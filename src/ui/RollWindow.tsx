import { useState } from "react";

import { readRollContext } from "../adapters/owlbear/windows";
import { GAIT_TABLE, gaitRow, harderBy, type Gait } from "../core/movement";

import {
  DIFFICULTY_TABLE,
  hardestGrade,
  modifiedSkill,
  rollRanges,
  rollSkill,
  type DifficultyGrade,
  type ModifierMethod,
  type RollResult,
} from "../core/rolls";


/**
 * Rolling a skill, in a window of its own.
 *
 * This is a separate Owlbear surface opened with `OBR.modal`, not a panel
 * component. A dialog rendered inside the panel is still trapped in the panel's
 * width, and the panel is a narrow column already carrying a body diagram, a
 * statblock, the damage controls and the character's numbers. Floating it frees
 * the skill list to be a list rather than a cramped dropdown.
 *
 * It reads the combatant from the room by id rather than being handed one,
 * because an iframe cannot be passed props. That also means it stays in step if
 * the sheet changes while the window is open.
 *
 * Everything here is a read of `core/rolls.ts`. The window picks the skill and
 * the grade, shows what the target works out to *before* the die is thrown, and
 * reports what happened. Nothing is graded in this file.
 *
 * The result is deliberately local rather than shared through the room: a
 * private roll the player can look at is one thing, and broadcasting everybody's
 * dice to the whole table is a different feature with its own decisions to make.
 */

const OUTCOME_LABEL: Record<RollResult["outcome"], string> = {
  critical: "Critical",
  success: "Success",
  failure: "Failure",
  fumble: "Fumble",
};



/**
 * Which of the book's two methods this table uses.
 *
 * Imperative prints both and says to pick one and keep it, so it is a decision
 * about the game rather than about a roll — it does not belong in a control the
 * player meets every time they throw. Hard-coded to multiplying, which is the
 * book's own "normal method" and the one that keeps behaving at high skill.
 */
const METHOD: ModifierMethod = "multiplier";

/** The book writes 100 as "00", and so does the die everyone is holding. */
const face = (roll: number) => (roll === 100 ? "00" : String(roll).padStart(2, "0"));

const span = (range: readonly [number, number] | null) =>
  range === null ? null : range[0] === range[1] ? face(range[0]) : `${face(range[0])}-${face(range[1])}`;

export function RollWindow() {
  const [context] = useState(readRollContext);
  const [query, setQuery] = useState("");
  const [skillName, setSkillName] = useState<string | null>(null);
  const [grade, setGrade] = useState<DifficultyGrade>("standard");
  const [gait, setGait] = useState<Gait>("walk");
  const [result, setResult] = useState<RollResult | null>(null);

  if (!context) return <p className="notice">Nothing to roll. Open this from a combatant.</p>;

  const skills = context.skills;
  if (skills.length === 0) return <p className="notice">{context.name} has no skills on file.</p>;

  const skill = skills.find(({ name }) => name === skillName) ?? skills[0]!;

  /*
   * Fatigue is a second grade in play, and the book says the hardest wins. An
   * Exhausted character attempting something Hard rolls Formidable whether or
   * not the person clicking remembers that.
   */
  const fatigueGrade = context.fatigueGrade as DifficultyGrade | null;
  /*
   * Two different operations, in this order. Fatigue and the GM's ruling are
   * grades in play at once, so the hardest wins; moving fast then shifts along
   * the table from wherever that landed. Shifting first and then taking the
   * hardest would quietly discard the Gait whenever Fatigue was worse, which is
   * not what "one Grade harder to pull off at a Run" says.
   */
  const situational = hardestGrade(fatigueGrade ? [grade, fatigueGrade] : [grade]);
  const applied = harderBy(situational, gaitRow(gait).gradeShift);
  const target = modifiedSkill(skill.value, applied, METHOD);
  const ranges = rollRanges(skill.value, applied, METHOD);

  const matches = skills.filter(({ name }) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    // No backdrop and no close button: Owlbear draws the window frame and its
    // own dismiss control, so drawing a second one would be a fake inside a real.
    <div className="roll-window">
      <div>
        <h2 className="roll-title">{context.name}</h2>

        {/* Sixty skills is too many to scroll past; typing two letters is not. */}
        <input
          type="search"
          className="roll-filter"
          placeholder="Filter skills"
          aria-label="Filter skills"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <ul className="roll-list">
          {matches.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                className={`roll-pick${entry.name === skill.name ? " on" : ""}`}
                aria-pressed={entry.name === skill.name}
                onClick={() => {
                  setSkillName(entry.name);
                  setResult(null);
                }}
              >
                <span>
                  {entry.name}
                  {entry.combatStyle && <span className="roll-style"> style</span>}
                </span>
                <span className="dim">{entry.value}%</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="roll-empty">Nothing matches.</li>}
        </ul>

        <label className="roll-grade">
          Difficulty
          <select
            value={grade}
            onChange={(event) => {
              setGrade(event.target.value as DifficultyGrade);
              setResult(null);
            }}
          >
            {DIFFICULTY_TABLE.map((row) => (
              <option key={row.grade} value={row.grade}>
                {row.name}
              </option>
            ))}
          </select>
        </label>

        {/*
          Gait sits beside Difficulty rather than inside it because it is a
          different operation — a shift along the table, not a grade competing
          for the hardest. Defaults to Walk, which costs nothing and is what
          almost every roll is made at.
        */}
        <label className="roll-grade">
          Gait
          <select
            value={gait}
            onChange={(event) => {
              setGait(event.target.value as Gait);
              setResult(null);
            }}
          >
            {GAIT_TABLE.map((row) => (
              <option key={row.gait} value={row.gait}>
                {row.name}
                {row.gradeShift > 0 && ` — ${row.gradeShift} grade${row.gradeShift > 1 ? "s" : ""} harder`}
              </option>
            ))}
          </select>
        </label>

        {applied !== grade && (
          <p className="roll-note">
            {[
              fatigueGrade && situational !== grade ? context.fatigueName : null,
              gait !== "walk" ? gaitRow(gait).name.toLowerCase() : null,
            ]
              .filter(Boolean)
              .join(" and ")}{" "}
            makes this {DIFFICULTY_TABLE.find((r) => r.grade === applied)?.name}.
          </p>
        )}

        {/*
          Said, not enforced. Which action is being attempted is a decision at
          the table, and the exceptions — charging, Skirmishing weapons — are
          exactly the kind of judgement this extension leaves alone.
        */}
        {!gaitRow(gait).proactiveActions && (
          <p className="roll-note">
            Most proactive actions are unavailable at a {gaitRow(gait).name.toLowerCase()}.
          </p>
        )}

        {/* The target before the die, so a wrong grade is visible while it can still change. */}
        <p className="roll-target">
          <strong>{skill.name}</strong> — rolling against <strong>{target}</strong>
          <span className="dim">
            {" "}
            from {skill.value}
            {applied === "hopeless" ? " · cannot be attempted" : ""}
            {applied === "automatic" ? " · no roll needed" : ""}
          </span>
        </p>

        {/*
          Both ranges before the throw, not after it.

          The critical range moves with the difficulty — it is a tenth of the
          *modified* target, so the same skill criticals on 13 or less when it is
          doubled and on 2 or less at Herculean. Nobody works that out mid-fight,
          and finding out afterwards is finding out too late to have chosen a
          different grade.
        */}
        <p className="roll-ranges">
          {ranges.critical ? (
            <span className="roll-range roll-range-critical">crit {span(ranges.critical)}</span>
          ) : (
            <span className="roll-range dim">no critical</span>
          )}
          {ranges.fumble && (
            <span className="roll-range roll-range-fumble">fumble {span(ranges.fumble)}</span>
          )}
        </p>

        <button
          type="button"
          className="apply"
          onClick={() => setResult(rollSkill(skill.value, applied, METHOD))}
        >
          Roll d100
        </button>

        {result && (
          <div className={`roll-result roll-${result.outcome}`}>
            <span className="roll-die">{result.roll === 100 ? "00" : result.roll}</span>
            <span className="roll-outcome">{OUTCOME_LABEL[result.outcome]}</span>
            <span className="roll-detail">
              vs {result.target}
              {result.outcome !== "fumble" && ` · crit ${result.criticalOn}`}
            </span>
            {result.note && <span className="roll-detail">{result.note}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
