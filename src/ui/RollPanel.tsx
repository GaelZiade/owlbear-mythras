import { useState } from "react";

import { fatigueRow } from "../core/fatigue";
import {
  DIFFICULTY_TABLE,
  hardestGrade,
  modifiedSkill,
  rollSkill,
  type DifficultyGrade,
  type ModifierMethod,
  type RollResult,
} from "../core/rolls";
import type { Combatant } from "../core/types";

/**
 * Rolling a skill.
 *
 * Everything here is a read of `core/rolls.ts`. The panel picks the skill and
 * the grade, shows what the target works out to *before* the die is thrown, and
 * then reports what happened. Nothing is graded in this file.
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

interface Props {
  combatant: Combatant;
}

export function RollPanel({ combatant }: Props) {
  const skills = combatant.skills ?? [];
  const [open, setOpen] = useState(false);
  const [skillName, setSkillName] = useState(() => skills[0]?.name ?? "");
  const [grade, setGrade] = useState<DifficultyGrade>("standard");
  const [method, setMethod] = useState<ModifierMethod>("multiplier");
  const [result, setResult] = useState<RollResult | null>(null);

  if (skills.length === 0) return null;

  const skill = skills.find(({ name }) => name === skillName) ?? skills[0]!;

  /*
   * Fatigue is a second grade in play, and the book says the hardest wins. An
   * Exhausted character attempting something Hard rolls Formidable whether or
   * not the person clicking remembers that.
   */
  const fatigue = fatigueRow(combatant.fatigue);
  const fatigueGrade = fatigue.difficulty === "none" ? null : (fatigue.difficulty as DifficultyGrade);
  const applied = hardestGrade(fatigueGrade ? [grade, fatigueGrade] : [grade]);
  const target = modifiedSkill(skill.value, applied, method);

  return (
    <div className="rolls">
      <button
        type="button"
        className="chars-toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span>Roll a skill</span>
        <span className="dim">{skills.length} known</span>
      </button>

      {open && (
        <>
          <label className="roll-skill">
            Skill
            <select value={skill.name} onChange={(event) => setSkillName(event.target.value)}>
              {skills.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name} {entry.value}%{entry.combatStyle ? " ⚔" : ""}
                </option>
              ))}
            </select>
          </label>

          <div className="roll-controls">
            <label>
              Difficulty
              <select
                value={grade}
                onChange={(event) => setGrade(event.target.value as DifficultyGrade)}
              >
                {DIFFICULTY_TABLE.map((row) => (
                  <option key={row.grade} value={row.grade}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>

            {/*
              The book prints two methods and insists a table pick one and keep
              it. They agree around 60 and diverge sharply above it, so which one
              is in use has to be visible rather than assumed.
            */}
            <label>
              Method
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as ModifierMethod)}
              >
                <option value="multiplier">Multiply</option>
                <option value="simplified">Flat %</option>
              </select>
            </label>
          </div>

          {applied !== grade && (
            <p className="roll-note">
              {fatigue.name} makes this {DIFFICULTY_TABLE.find((r) => r.grade === applied)?.name}.
            </p>
          )}

          {/* The target before the die, so a bad grade is visible while it can still be changed. */}
          <p className="roll-target">
            Rolling against <strong>{target}</strong>
            <span className="dim">
              {" "}
              from {skill.value}
              {applied === "impossible" ? " · cannot be attempted" : ""}
              {applied === "automatic" ? " · no roll needed" : ""}
            </span>
          </p>

          <button
            type="button"
            className="apply"
            onClick={() => setResult(rollSkill(skill.value, applied, method))}
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
        </>
      )}
    </div>
  );
}
