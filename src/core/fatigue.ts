/**
 * Mythras Fatigue.
 *
 * Source: Mythras core rules, Fatigue table.
 *
 * The table has five columns. Two of them land on numbers this tracker already
 * models — Initiative and Action Points — and are applied automatically. The
 * other three cannot be:
 *
 *   Difficulty Grade  there are no skills here, so there is no roll to grade
 *   Movement          there is no map distance in the combat state
 *   Recovery Period   measured in hours of rest, which a Round-based tracker
 *                     has no clock for
 *
 * They are still carried as data on every level so the interface can show the
 * GM what a level costs, rather than silently dropping three fifths of the rule.
 * Displaying a value the engine does not enforce is the honest option: the
 * alternative is a tracker that quietly forgets a character cannot move.
 */

export type FatigueLevel =
  | "fresh"
  | "winded"
  | "tired"
  | "wearied"
  | "exhausted"
  | "debilitated"
  | "incapacitated"
  | "semi-conscious"
  | "comatose"
  | "dead";

/** Skill difficulty grades named by the Fatigue table. */
export type DifficultyGrade = "none" | "hard" | "formidable" | "herculean" | "impossible";

export interface FatigueRow {
  level: FatigueLevel;
  name: string;
  /** Grade every skill roll is shifted to. Not enforced: no skills are modelled. */
  difficulty: DifficultyGrade;
  /** Movement effect, as the book words it. Not enforced: no distances are modelled. */
  movement: string;
  /** Penalty to Initiative. Applied. */
  initiativeModifier: number;
  /** Penalty to maximum Action Points. Applied. */
  actionPointsModifier: number;
  /**
   * Whether the character can act at all.
   *
   * From Semi-Conscious down the table stops giving penalties and says outright
   * that no activity is possible, so this is a flag rather than a large modifier.
   */
  canAct: boolean;
  /** Rest needed to recover one level. `null` past the point of recovering. */
  recovery: string | null;
}

/**
 * The table, in the book's order, worsening downwards.
 *
 * Ordered deliberately: `FATIGUE_LEVELS.indexOf` gives the severity ranking, so
 * worsening and recovering are index arithmetic rather than a second table.
 */
export const FATIGUE_TABLE: readonly FatigueRow[] = [
  {
    level: "fresh",
    name: "Fresh",
    difficulty: "none",
    movement: "No penalty",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: true,
    recovery: null,
  },
  {
    level: "winded",
    name: "Winded",
    difficulty: "hard",
    movement: "No penalty",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: true,
    recovery: "15 minutes",
  },
  {
    level: "tired",
    name: "Tired",
    difficulty: "hard",
    movement: "-1 metre",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: true,
    recovery: "3 hours",
  },
  {
    level: "wearied",
    name: "Wearied",
    difficulty: "formidable",
    movement: "-2 metres",
    initiativeModifier: -2,
    actionPointsModifier: 0,
    canAct: true,
    recovery: "6 hours",
  },
  {
    level: "exhausted",
    name: "Exhausted",
    difficulty: "formidable",
    movement: "Halved",
    initiativeModifier: -4,
    actionPointsModifier: -1,
    canAct: true,
    recovery: "12 hours",
  },
  {
    level: "debilitated",
    name: "Debilitated",
    difficulty: "herculean",
    movement: "Halved",
    initiativeModifier: -6,
    actionPointsModifier: -2,
    canAct: true,
    recovery: "18 hours",
  },
  {
    level: "incapacitated",
    name: "Incapacitated",
    difficulty: "herculean",
    movement: "Immobile",
    initiativeModifier: -8,
    actionPointsModifier: -3,
    canAct: true,
    recovery: "24 hours",
  },
  {
    level: "semi-conscious",
    name: "Semi-Conscious",
    difficulty: "impossible",
    movement: "No activity possible",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: "36 hours",
  },
  {
    level: "comatose",
    name: "Comatose",
    difficulty: "impossible",
    movement: "No activity possible",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: "48 hours",
  },
  {
    level: "dead",
    name: "Dead",
    difficulty: "impossible",
    movement: "Never",
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: null,
  },
] as const;

export const FATIGUE_LEVELS: readonly FatigueLevel[] = FATIGUE_TABLE.map(({ level }) => level);

const BY_LEVEL = new Map(FATIGUE_TABLE.map((row) => [row.level, row]));

/**
 * The row for a level.
 *
 * Falls back to Fresh rather than throwing: an unknown level can only reach here
 * from persisted state written by a newer build, and a tracker that refuses to
 * render a fight is worse than one that treats a stranger as unfatigued.
 */
export function fatigueRow(level: FatigueLevel | undefined): FatigueRow {
  return (level && BY_LEVEL.get(level)) ?? BY_LEVEL.get("fresh")!;
}

/** Severity ranking, `fresh` being 0. Unknown levels rank as Fresh. */
export function fatigueSeverity(level: FatigueLevel | undefined): number {
  const index = level === undefined ? -1 : FATIGUE_LEVELS.indexOf(level);
  return index === -1 ? 0 : index;
}

/** One level worse, stopping at Dead. */
export function worsenFatigue(level: FatigueLevel | undefined): FatigueLevel {
  const next = Math.min(fatigueSeverity(level) + 1, FATIGUE_LEVELS.length - 1);
  return FATIGUE_LEVELS[next]!;
}

/**
 * One level better, stopping at Fresh.
 *
 * Dead recovers like any other level here. The engine does not decide that a
 * combatant is beyond help — the same reason `defeated` is a manual toggle — and
 * a GM who set the level by mistake needs a way back.
 */
export function recoverFatigue(level: FatigueLevel | undefined): FatigueLevel {
  const previous = Math.max(fatigueSeverity(level) - 1, 0);
  return FATIGUE_LEVELS[previous]!;
}
