import { useState } from "react";

import { readRollContext } from "../adapters/owlbear/windows";
import { harderBy } from "../core/movement";

import {
  DIFFICULTY_TABLE,
  hardestGrade,
  augmentFrom,
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
  const [passionName, setPassionName] = useState<string | null>(null);
  const [result, setResult] = useState<RollResult | null>(null);

  if (!context) return <p className="notice">Nothing to roll. Open this from a combatant.</p>;

  const passions = context.passions ?? [];
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
  const applied = harderBy(situational, context.gaitShift ?? 0);

  /*
   * The augment lands on the skill, before the grade touches it.
   *
   * The book does not settle the order — it says only that the Passion "adds 20%
   * of its value to a skill being used". Ours is that a Passion is part of what
   * the character brings, and the grade is what the world does to the attempt, so
   * the Passion goes in first and the difficulty scales the total. It also has
   * the property that a Passion is never worth less because the task is hard,
   * which the other order would produce.
   */
  const passion = passions.find(({ name }) => name === passionName) ?? null;
  const augment = passion ? augmentFrom(passion.value) : 0;
  const augmented = skill.value + augment;
  const target = modifiedSkill(augmented, applied, METHOD);
  const ranges = rollRanges(augmented, applied, METHOD);

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

        <div className="roll-controls">
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
          Only on screen when there are Passions to pick, because a character
          with none should not meet an empty control. "None" first: augmenting
          needs the Games Master to agree it is thematically important, so it is
          the deliberate choice rather than the default.
        */}
        {passions.length > 0 && (
          <label className="roll-grade">
            Augment
            <select
              value={passionName ?? ""}
              onChange={(event) => {
                setPassionName(event.target.value === "" ? null : event.target.value);
                setResult(null);
              }}
            >
              <option value="">None</option>
              {passions.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} ({entry.value}%) — +{augmentFrom(entry.value)}
                </option>
              ))}
            </select>
          </label>
        )}

        </div>

        {applied !== grade && (
          <p className="roll-note">
            {[
              fatigueGrade && situational !== grade ? context.fatigueName : null,
              context.gaitName ? context.gaitName.toLowerCase() : null,
            ]
              .filter(Boolean)
              .join(" and ")}{" "}
            makes this {DIFFICULTY_TABLE.find((r) => r.grade === applied)?.name}.
          </p>
        )}

        {/*
          One panel, because it is one statement: this is the number, and this is
          where it came from. The ranges used to trail underneath as loose text
          that read like a stray line of debug output.
        */}
        <div className="roll-summary">
          <div className="roll-headline">
            <span className="roll-skill-name">{skill.name}</span>
            <span className="roll-vs">
              vs <strong>{target}</strong>
            </span>
          </div>

          <p className="roll-working">
            {skill.value}
            {augment > 0 && ` + ${augment} from ${passion!.name}`}
            {applied !== "standard" &&
              ` · ${DIFFICULTY_TABLE.find((row) => row.grade === applied)?.name}`}
            {applied === "hopeless" && " — cannot be attempted"}
            {applied === "automatic" && " — no roll needed"}
          </p>

          {/*
            Both ranges before the throw, not after it.

            The critical range moves with the difficulty — it is a tenth of the
            *modified* target, so the same skill criticals on 13 or less when it
            is doubled and on 2 or less at Herculean. Nobody works that out
            mid-fight, and finding out afterwards is finding out too late to have
            chosen a different grade.
          */}
          <div className="roll-ranges">
            <span className="roll-range roll-range-critical">
              <span className="roll-range-label">Critical</span>
              {ranges.critical ? span(ranges.critical) : "—"}
            </span>
            <span className="roll-range roll-range-fumble">
              <span className="roll-range-label">Fumble</span>
              {ranges.fumble ? span(ranges.fumble) : "—"}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="roll-throw"
          onClick={() => setResult(rollSkill(augmented, applied, METHOD))}
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
