/**
 * Skill resolution.
 *
 * Source: *Mythras Imperativo* (ORC), Habilidades — "Cómo funcionan las
 * Habilidades", "Críticos y Pifias" and the Difficulty Grade table.
 *
 * A pure module, like the rest of `core/`: the die roll is passed in rather
 * than taken, so every rule below is testable without randomness. `rollSkill`
 * at the bottom is the only thing that touches a die.
 */

import { rollDie, type RandomSource } from "./dice";

/**
 * The grades, easiest first.
 *
 * `automatic` and `impossible` are in the table but are not rolls at all: one
 * succeeds without dice, the other cannot be attempted. They are modelled here
 * anyway so a caller can hold "the GM graded this Impossible" without a second
 * vocabulary for it.
 */
export const DIFFICULTY_GRADES = [
  "automatic",
  "very-easy",
  "easy",
  "standard",
  "hard",
  "formidable",
  "herculean",
  "impossible",
] as const;

export type DifficultyGrade = (typeof DIFFICULTY_GRADES)[number];

/**
 * Which of the book's two modifier methods is in use.
 *
 * Imperative prints both and is explicit that a table must pick one and stay
 * with it: *"Elige el método que mejor encaje con la partida, pero asegúrate de
 * que se utiliza siempre el mismo sistema."* Multiplying scales better at high
 * skill values; the flat version is easier at the table.
 */
export type ModifierMethod = "multiplier" | "simplified";

interface GradeRow {
  grade: DifficultyGrade;
  name: string;
  /** Factor applied to the skill under the normal method. `null` when no roll happens. */
  multiplier: number | null;
  /** Flat percentage added under the simplified method. */
  simplified: number;
  /** Whether a roll happens at all. */
  rollable: boolean;
}

export const DIFFICULTY_TABLE: readonly GradeRow[] = [
  { grade: "automatic", name: "Automatic", multiplier: null, simplified: 0, rollable: false },
  { grade: "very-easy", name: "Very Easy", multiplier: 2, simplified: 40, rollable: true },
  { grade: "easy", name: "Easy", multiplier: 1.5, simplified: 20, rollable: true },
  { grade: "standard", name: "Standard", multiplier: 1, simplified: 0, rollable: true },
  // "Reduce la Habilidad en un tercio" — two thirds of the value remains.
  { grade: "hard", name: "Hard", multiplier: 2 / 3, simplified: -20, rollable: true },
  { grade: "formidable", name: "Formidable", multiplier: 0.5, simplified: -40, rollable: true },
  { grade: "herculean", name: "Herculean", multiplier: 0.2, simplified: -80, rollable: true },
  { grade: "impossible", name: "Impossible", multiplier: null, simplified: 0, rollable: false },
] as const;

const BY_GRADE = new Map(DIFFICULTY_TABLE.map((row) => [row.grade, row]));

export function gradeRow(grade: DifficultyGrade): GradeRow {
  return BY_GRADE.get(grade) ?? BY_GRADE.get("standard")!;
}

/** Severity ranking, `automatic` being 0. */
function gradeSeverity(grade: DifficultyGrade): number {
  return DIFFICULTY_GRADES.indexOf(grade);
}

/**
 * The grade that applies when several are in play.
 *
 * *"Cuando un personaje sufre una penalización por varias circunstancias,
 * prevalece el Grado de Dificultad más elevado."* Fatigue is the obvious source
 * of a second grade — Exhausted makes every roll Formidable — so this is how a
 * fatigued character attempting something already Hard resolves.
 *
 * With nothing passed, Standard: no circumstances means no adjustment.
 */
export function hardestGrade(grades: readonly DifficultyGrade[]): DifficultyGrade {
  if (grades.length === 0) return "standard";
  return grades.reduce((worst, grade) =>
    gradeSeverity(grade) > gradeSeverity(worst) ? grade : worst,
  );
}

/**
 * The skill value actually rolled against.
 *
 * Floored at zero rather than allowed to go negative: a negative target and a
 * zero target both mean "only the automatic 01-05 can save you", and a negative
 * one would also make the critical range negative.
 *
 * Rounding: the book gives no rule for a fractional target, so values are
 * rounded down. A skill of 33 at Hard is 22, not 22.11.
 */
export function modifiedSkill(
  skill: number,
  grade: DifficultyGrade,
  method: ModifierMethod = "multiplier",
): number {
  const row = gradeRow(grade);
  if (!row.rollable) return Math.max(0, skill);

  const raw =
    method === "multiplier" ? skill * (row.multiplier ?? 1) : skill + row.simplified;
  return Math.max(0, Math.floor(raw));
}

/**
 * The highest roll that criticals.
 *
 * *"Un éxito Crítico es igual a una décima parte del valor de la Habilidad… y
 * esto incluye las Habilidades que han recibido un modificador."* So it is a
 * tenth of the *modified* target, not the base skill, and fractions round up:
 * a skill doubled from 33 to 66 criticals on 7 or less.
 *
 * At least 1, so that any skill worth rolling can still crit on a 1.
 */
export function criticalThreshold(modified: number): number {
  return Math.max(1, Math.ceil(modified / 10));
}

export type RollOutcome = "critical" | "success" | "failure" | "fumble";

export interface RollResult {
  roll: number;
  /** The target after the difficulty grade was applied. */
  target: number;
  criticalOn: number;
  outcome: RollOutcome;
  grade: DifficultyGrade;
  /** Set when the grade decided the result without a die. */
  note: string | null;
}

/**
 * Grades a d100 against a skill.
 *
 * The order of the rules is the order the book states them, and it matters:
 *
 *   1. A fumble is 99 or 00 — but a skill over 100 fumbles only on 00.
 *   2. 96-00 always fails, however high the skill.
 *   3. 01-05 always succeeds, however low.
 *   4. Otherwise, roll at or under the target succeeds.
 *
 * A critical is checked within a success, so an 01 against a tiny skill is the
 * automatic success of rule 3 and criticals only if it is also within the
 * tenth. The two special ranges overlap nothing: 96-00 and 01-05 are disjoint.
 */
export function gradeRoll(
  roll: number,
  skill: number,
  grade: DifficultyGrade = "standard",
  method: ModifierMethod = "multiplier",
): RollResult {
  const target = modifiedSkill(skill, grade, method);
  const criticalOn = criticalThreshold(target);

  if (grade === "automatic") {
    return {
      roll,
      target,
      criticalOn,
      outcome: "success",
      grade,
      note: "Automatic: no roll needed.",
    };
  }
  if (grade === "impossible") {
    return {
      roll,
      target,
      criticalOn,
      outcome: "failure",
      grade,
      note: "Impossible: the attempt cannot be made.",
    };
  }

  const fumbles = target > 100 ? roll === 100 : roll === 99 || roll === 100;
  if (fumbles) {
    return { roll, target, criticalOn, outcome: "fumble", grade, note: null };
  }

  // 96-00 always fails. 100 is the "00" of the book's d100.
  if (roll >= 96) {
    return { roll, target, criticalOn, outcome: "failure", grade, note: "96-00 always fails." };
  }

  const succeeds = roll <= 5 || roll <= target;
  if (!succeeds) {
    return { roll, target, criticalOn, outcome: "failure", grade, note: null };
  }

  if (roll <= criticalOn) {
    return { roll, target, criticalOn, outcome: "critical", grade, note: null };
  }

  return {
    roll,
    target,
    criticalOn,
    outcome: "success",
    grade,
    note: roll > target ? "01-05 always succeeds." : null,
  };
}

/**
 * Rolls 1d100 and grades it. The only function here that touches a die.
 *
 * The generator is a parameter for the same reason it is in `dice.ts`: the
 * rules above are worth testing exhaustively, and that is only possible when
 * the roll is an input.
 */
export function rollSkill(
  skill: number,
  grade: DifficultyGrade = "standard",
  method: ModifierMethod = "multiplier",
  random: RandomSource = Math.random,
): RollResult {
  return gradeRoll(rollDie(100, random), skill, grade, method);
}
