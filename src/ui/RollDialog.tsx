import { useEffect, useRef, useState } from "react";

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
 * Rolling a skill, in a dialog over the panel.
 *
 * A dialog rather than another accordion in the sidebar. Owlbear's panel is
 * narrow and already carries the statblock, the damage controls and the
 * character's numbers; a sixty-skill list folded into that is one section too
 * many. Rolling is also a moment rather than a setting — you open it, throw, and
 * close.
 *
 * Everything here is a read of `core/rolls.ts`. The dialog picks the skill and
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

interface Props {
  combatant: Combatant;
  onClose: () => void;
}

/**
 * Which of the book's two methods this table uses.
 *
 * Imperative prints both and says to pick one and keep it, so it is a decision
 * about the game rather than about a roll — it does not belong in a control the
 * player meets every time they throw. Hard-coded to multiplying, which is the
 * book's own "normal method" and the one that keeps behaving at high skill.
 */
const METHOD: ModifierMethod = "multiplier";

export function RollDialog({ combatant, onClose }: Props) {
  const skills = combatant.skills ?? [];
  const [query, setQuery] = useState("");
  const [skillName, setSkillName] = useState(() => skills[0]?.name ?? "");
  const [grade, setGrade] = useState<DifficultyGrade>("standard");
  const [result, setResult] = useState<RollResult | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, as any dialog should.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
  const target = modifiedSkill(skill.value, applied, METHOD);

  const matches = skills.filter(({ name }) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Roll a skill for ${combatant.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{combatant.name}</h2>
          <button type="button" className="ghost" ref={closeRef} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

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

        {applied !== grade && (
          <p className="roll-note">
            {fatigue.name} makes this {DIFFICULTY_TABLE.find((r) => r.grade === applied)?.name}.
          </p>
        )}

        {/* The target before the die, so a wrong grade is visible while it can still change. */}
        <p className="roll-target">
          <strong>{skill.name}</strong> — rolling against <strong>{target}</strong>
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
