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
 *   Movement          there was no Movement Rate to apply it to
 *   Recovery Period   measured in hours of rest, which a Round-based tracker
 *                     has no clock for
 *
 * Movement has since become applicable: both importers carry a Movement Rate, so
 * the column is now arithmetic wherever a rate is known and words wherever it is
 * not. The Difficulty Grade found its consumer earlier, in the roll window.
 *
 * They are all still carried as data on every level so the interface can show the
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
export type DifficultyGrade = "none" | "hard" | "formidable" | "herculean" | "hopeless";

/**
 * What Fatigue does to a Movement Rate.
 *
 * Four shapes because the column has four: nothing, a flat subtraction, a
 * halving, and a stop. Modelled rather than parsed out of the string, so that
 * "-1 metre" cannot be turned into a penalty by a regular expression that also
 * matches "-2 metres" and one day matches something else.
 */
export type MovementEffect =
  | { kind: "none" }
  | { kind: "minus"; metres: number }
  | { kind: "halved" }
  | { kind: "immobile" };

/**
 * A Movement Rate after Fatigue.
 *
 * Halving rounds up, which is the book's general rule: *"Whenever a division
 * result creates a fraction, always round up to the whole number."* A rate of 7
 * halved is 4.
 *
 * Never below zero, and never below one unless the effect is a stop outright: a
 * character penalised down to nothing by subtraction is exhausted, not rooted,
 * and the table has a separate word for rooted.
 */
export function applyMovementEffect(rate: number, effect: MovementEffect): number {
  switch (effect.kind) {
    case "none":
      return rate;
    case "minus":
      return Math.max(1, rate - effect.metres);
    case "halved":
      return Math.max(1, Math.ceil(rate / 2));
    case "immobile":
      return 0;
  }
}

export interface FatigueRow {
  level: FatigueLevel;
  name: string;
  /** Grade every skill roll is shifted to. Not enforced: no skills are modelled. */
  difficulty: DifficultyGrade;
  /** Movement effect, as the book words it, for showing. */
  movement: string;
  /**
   * The same column, as arithmetic.
   *
   * Added once a Movement Rate could be imported. The string is still what gets
   * printed — "Halved" reads better than "3 metres" when the rate is unknown —
   * but where there *is* a rate, the tracker can do the subtraction rather than
   * leaving it to somebody counting squares mid-fight.
   */
  movementEffect: MovementEffect;
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
    movementEffect: { kind: "none" },
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
    movementEffect: { kind: "none" },
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
    movementEffect: { kind: "minus", metres: 1 },
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
    movementEffect: { kind: "minus", metres: 2 },
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
    movementEffect: { kind: "halved" },
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
    movementEffect: { kind: "halved" },
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
    movementEffect: { kind: "immobile" },
    initiativeModifier: -8,
    actionPointsModifier: -3,
    canAct: true,
    recovery: "24 hours",
  },
  {
    level: "semi-conscious",
    name: "Semi-Conscious",
    difficulty: "hopeless",
    movement: "No activity possible",
    movementEffect: { kind: "immobile" },
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: "36 hours",
  },
  {
    level: "comatose",
    name: "Comatose",
    difficulty: "hopeless",
    movement: "No activity possible",
    movementEffect: { kind: "immobile" },
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: "48 hours",
  },
  {
    level: "dead",
    name: "Dead",
    difficulty: "hopeless",
    // The book leaves Movement blank on this row and puts "Never" under Recovery
    // Period. Those two were the wrong way round here, which read as though a
    // corpse had a movement restriction rather than no way back.
    movement: "—",
    movementEffect: { kind: "immobile" },
    initiativeModifier: 0,
    actionPointsModifier: 0,
    canAct: false,
    recovery: "Never",
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
