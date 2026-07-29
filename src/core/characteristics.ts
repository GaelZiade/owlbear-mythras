/**
 * Characteristics and the Attributes derived from them.
 *
 * Source: *Mythras Imperativo* (ORC), Personajes, Paso 2 and Paso 3.
 *
 * Where Imperative and the core rules disagree, this module follows Imperative,
 * because Imperative is what the project can reproduce under the ORC licence.
 * The disagreement that matters is Action Points: the core rules derive them
 * from INT + DEX, while Imperative gives *every* character a flat 2. See
 * `actionPointsFor` below and DECISIONS §1.4.
 */

/** The seven Characteristics, in the book's order. */
export const CHARACTERISTICS = ["STR", "CON", "SIZ", "DEX", "INT", "POW", "CHA"] as const;

export type Characteristic = (typeof CHARACTERISTICS)[number];

export type Characteristics = Record<Characteristic, number>;

/** Spanish names, since the source is the Spanish edition and tables cite them. */
export const CHARACTERISTIC_NAME: Record<Characteristic, string> = {
  STR: "STR",
  CON: "CON",
  SIZ: "SIZ",
  DEX: "DEX",
  INT: "INT",
  POW: "POW",
  CHA: "CHA",
};

export function emptyCharacteristics(): Characteristics {
  return { STR: 0, CON: 0, SIZ: 0, DEX: 0, INT: 0, POW: 0, CHA: 0 };
}

/**
 * Action Points.
 *
 * Flat 2 for everyone: *"Todos los personajes en Mythras Imperativo tienen 2
 * Puntos de Acción."* Not a function of the characteristics at all.
 *
 * The core rules instead band INT + DEX (≤12 → 1, 13–24 → 2, 25–36 → 3, +1 per
 * further 12), which is what `tables.ts` implements. Both are kept because both
 * are true of their own book; this one is the default because Imperative is the
 * licensed source.
 */
export const IMPERATIVE_ACTION_POINTS = 2;

/**
 * Rows of the Damage Modifier table, as `[maxOfStrPlusSiz, modifier]`.
 *
 * The table is printed as bands from "5 or less" up to 121–130, after which the
 * book says only *"Cada 10 puntos: Continúa la progresión"*. What the
 * progression continues by is not stated in a form that can be computed, so
 * past the last row this returns the last row rather than inventing dice.
 */
const DAMAGE_MODIFIER_TABLE: readonly (readonly [number, string])[] = [
  [5, "-1d8"],
  [10, "-1d6"],
  [15, "-1d4"],
  [20, "-1d2"],
  [25, "+0"],
  [30, "+1d2"],
  [35, "+1d4"],
  [40, "+1d6"],
  [45, "+1d8"],
  [50, "+1d10"],
  [60, "+1d12"],
  [70, "+2d6"],
  [80, "+1d8+1d6"],
  [90, "+2d8"],
  [100, "+1d10+1d8"],
  [110, "+2d10"],
  [120, "+2d10+1d2"],
  [130, "+2d10+1d4"],
] as const;

/**
 * Damage Modifier from STR + SIZ.
 *
 * Returned as the die expression the book prints rather than a number: it is an
 * extra die added to or subtracted from the weapon's damage, and collapsing
 * `+1d8+1d6` to an average would quietly change what the rules say.
 */
export function damageModifierFor(strPlusSiz: number): string {
  for (const [ceiling, modifier] of DAMAGE_MODIFIER_TABLE) {
    if (strPlusSiz <= ceiling) return modifier;
  }
  return DAMAGE_MODIFIER_TABLE[DAMAGE_MODIFIER_TABLE.length - 1]![1];
}

/**
 * The book's recurring "6 or less → 1, 7–12 → 2, 13–18 → 3, every further 6 → +1".
 *
 * Healing Rate (from CON) and Luck Points (from POW) share it exactly. The
 * Experience Modifier uses the same bands shifted down by two, so it is
 * expressed in terms of this rather than repeated.
 */
function sixPointBands(value: number): number {
  if (value <= 6) return 1;
  return Math.floor((value - 1) / 6) + 1;
}

/** Healing Rate from CON. Hit Points regained per day, week or month. */
export function healingRateFor(con: number): number {
  return sixPointBands(con);
}

/** Luck Points from POW. */
export function luckPointsFor(pow: number): number {
  return sixPointBands(pow);
}

/**
 * Experience Modifier from CHA.
 *
 * Same bands as Healing Rate, but starting at −1 rather than 1: 6 or less → −1,
 * 7–12 → +0, 13–18 → +1, every further 6 → +1 more.
 */
export function experienceModifierFor(cha: number): number {
  return sixPointBands(cha) - 2;
}

/** Magic Points equal POW. */
export function magicPointsFor(pow: number): number {
  return pow;
}

/**
 * Initiative Bonus: the average of DEX and INT.
 *
 * The book gives no rounding rule. Rounding up matches the worked characters in
 * circulation and is what `tables.ts` already did, so the two agree.
 *
 * Armour subtracts from this separately — see `initiativePenaltyFor` — which is
 * why an imported creature's `strike_rank` arrives as `"10(13-3)"`.
 */
export function initiativeBonusFor(dex: number, int: number): number {
  return Math.ceil((dex + int) / 2);
}

/**
 * Movement Rate.
 *
 * *"El Movimiento no se calcula a partir de las Características, sino que es un
 * valor por defecto que varía entre especies."* Humans are 6 metres. It is a
 * species constant, so it is a default here rather than a derivation.
 */
export const HUMAN_MOVEMENT_RATE = 6;

export interface DerivedAttributes {
  actionPoints: number;
  damageModifier: string;
  experienceModifier: number;
  healingRate: number;
  initiativeBonus: number;
  luckPoints: number;
  magicPoints: number;
  /** CON + SIZ, the input to the Hit Points per location table in `tables.ts`. */
  conPlusSiz: number;
}

/** Every Attribute Imperative derives, from one set of Characteristics. */
export function deriveAttributes(characteristics: Characteristics): DerivedAttributes {
  const { STR, CON, SIZ, DEX, INT, POW, CHA } = characteristics;
  return {
    actionPoints: IMPERATIVE_ACTION_POINTS,
    damageModifier: damageModifierFor(STR + SIZ),
    experienceModifier: experienceModifierFor(CHA),
    healingRate: healingRateFor(CON),
    initiativeBonus: initiativeBonusFor(DEX, INT),
    luckPoints: luckPointsFor(POW),
    magicPoints: magicPointsFor(POW),
    conPlusSiz: CON + SIZ,
  };
}
