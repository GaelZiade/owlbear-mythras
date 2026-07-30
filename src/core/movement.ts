import { DIFFICULTY_GRADES, type DifficultyGrade } from "./rolls";

/**
 * Gaits: how far a Movement Rate carries you, and what it costs to act.
 *
 * **Source: the Community Errata, not *Mythras Imperative*.** The SRD gives a
 * Movement Rate and a Move Action, and then refers to "the rules for Walk, Run,
 * and Sprint set forth above" — a table it never prints. The published
 * Imperative has no Gait rules at all; they are in the core rulebook, which is
 * Reserved Material and cannot be reproduced here.
 *
 * What is implemented below is the Community Errata's filling of that gap, which
 * is published openly at srd.mythras.net. `reference/README.md` records the
 * provenance so nobody later mistakes it for something traceable to a line in
 * the SRD, which is the standard everything else in `core/` is held to.
 */

export type Gait = "walk" | "run" | "sprint";

export interface GaitRow {
  gait: Gait;
  name: string;
  /** Multiplier on the Movement Rate. */
  multiplier: number;
  /**
   * How many Difficulty Grades harder an action becomes at this Gait.
   *
   * *"As a general rule, any allowed actions should be treated as one Grade
   * harder to pull off at a Run, and two Grades harder at a Sprint."*
   */
  gradeShift: number;
  /**
   * Whether proactive actions are available at all.
   *
   * At a Run or Sprint most are not — attacking and casting among them — with
   * charging and Skirmishing ranged weapons as the named exceptions. Carried as
   * a flag to *say* so rather than to enforce it: which action is being
   * attempted is a decision at the table, not a field in this state.
   */
  proactiveActions: boolean;
}

export const GAIT_TABLE: readonly GaitRow[] = [
  { gait: "walk", name: "Walk", multiplier: 1, gradeShift: 0, proactiveActions: true },
  { gait: "run", name: "Run", multiplier: 3, gradeShift: 1, proactiveActions: false },
  { gait: "sprint", name: "Sprint", multiplier: 5, gradeShift: 2, proactiveActions: false },
] as const;

const BY_GAIT = new Map(GAIT_TABLE.map((row) => [row.gait, row]));

/** The row for a gait, defaulting to Walk rather than throwing. */
export function gaitRow(gait: Gait | undefined): GaitRow {
  return (gait && BY_GAIT.get(gait)) ?? BY_GAIT.get("walk")!;
}

/**
 * Distance covered at a gait.
 *
 * The rate passed in should already have Fatigue applied — the table halves a
 * *Movement Rate*, and multiplying before halving would let an Exhausted
 * character sprint further than the rounding allows. An immobile character
 * covers nothing at any gait, which falls out of multiplying zero.
 */
export function movementForGait(rate: number, gait: Gait): number {
  return rate * gaitRow(gait).multiplier;
}

/**
 * A Difficulty Grade made harder by a number of steps.
 *
 * Clamped at Hopeless rather than running off the end of the table: two steps
 * past Herculean is as impossible as one, and the book has a word for it.
 *
 * Note this is not `hardestGrade`. That one picks the worst of several grades in
 * play at once, which is what Fatigue and a GM's ruling do to each other; this
 * one shifts along the table, which is what moving fast does to whatever grade
 * you had arrived at.
 */
export function harderBy(grade: DifficultyGrade, steps: number): DifficultyGrade {
  const index = DIFFICULTY_GRADES.indexOf(grade);
  if (index < 0) return grade;
  const shifted = Math.min(DIFFICULTY_GRADES.length - 1, Math.max(0, index + steps));
  return DIFFICULTY_GRADES[shifted]!;
}
