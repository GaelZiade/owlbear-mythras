/**
 * Mythras derived attribute tables.
 *
 * Source: Mythras core rules, Characters chapter.
 * Verified against the book's own worked example, Anathaym:
 *   INT 14 + DEX 16 = 30  -> 3 Action Points
 *   CON 13 + SIZ 10 = 23  -> 5 head and legs, 7 chest, 6 abdomen, 4 arms
 */

/**
 * Action Points from INT + DEX.
 * 12 or less -> 1; 13-24 -> 2; 25-36 -> 3; +1 for every additional 12 points.
 */
export function actionPointsFor(intPlusDex: number): number {
  if (intPlusDex <= 12) return 1;
  return Math.floor((intPlusDex - 1) / 12) + 1;
}

/** Magic Points equal POW. */
export function magicPointsFor(pow: number): number {
  return pow;
}

/**
 * Initiative Bonus: the average of INT and DEX.
 * The book does not state a rounding rule; tables commonly round up.
 */
export function initiativeBonusFor(int: number, dex: number): number {
  return Math.ceil((int + dex) / 2);
}

/**
 * Initiative penalty from armor: total ENC of worn armor divided by 5, rounded up.
 * The book works this through with a hoplite panoply: 7 locations at ENC 4 is 28,
 * and 28 / 5 rounded up is 6.
 */
export function initiativePenaltyFor(totalArmorEnc: number): number {
  return Math.ceil(totalArmorEnc / 5);
}

/** Rows of the Hit Points per location table, in the book's order. */
const HIT_POINT_TABLE = {
  leg: [1, 2, 3, 4, 5, 6, 7, 8],
  abdomen: [2, 3, 4, 5, 6, 7, 8, 9],
  chest: [3, 4, 5, 6, 7, 8, 9, 10],
  arm: [1, 1, 2, 3, 4, 5, 6, 7],
  head: [1, 2, 3, 4, 5, 6, 7, 8],
} as const satisfies Record<string, readonly number[]>;

export type BodyPart = keyof typeof HIT_POINT_TABLE;

/**
 * Hit Points of a humanoid body part from CON + SIZ.
 *
 * The table runs from 1-5 up to 36-40 in steps of 5. Past 40 it adds +1 for
 * every further 5 points, which is the book's "+5 pts." column.
 */
export function hitPointsFor(part: BodyPart, conPlusSiz: number): number {
  const row = HIT_POINT_TABLE[part];
  const clamped = Math.max(1, conPlusSiz);
  const columnIndex = Math.ceil(clamped / 5) - 1;

  const lastIndex = row.length - 1;
  if (columnIndex <= lastIndex) {
    return row[columnIndex]!;
  }
  return row[lastIndex]! + (columnIndex - lastIndex);
}
