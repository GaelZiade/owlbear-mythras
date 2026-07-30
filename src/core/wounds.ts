import type { HitLocation, Weapon, WoundLevel } from "./types";

/**
 * Wound level of a location.
 *
 * Source: Mythras core rules, Combat chapter.
 *   Minor   -> the location still has positive Hit Points
 *   Serious -> reduced to zero or below
 *   Major   -> reduced to a negative value equal to or beyond its starting Hit Points
 */
export function woundLevel(location: HitLocation): WoundLevel {
  if (location.hitPoints >= location.maxHitPoints) return "unharmed";
  if (location.hitPoints > 0) return "minor";
  if (location.hitPoints > -location.maxHitPoints) return "serious";
  return "major";
}

const SEVERITY: Record<WoundLevel, number> = {
  unharmed: 0,
  minor: 1,
  serious: 2,
  major: 3,
};

/** The combatant's worst wound, for the compact row. */
export function worstWound(locations: readonly HitLocation[]): WoundLevel {
  return locations.reduce<WoundLevel>((worst, location) => {
    const level = woundLevel(location);
    return SEVERITY[level] > SEVERITY[worst] ? level : worst;
  }, "unharmed");
}

export interface DamageOptions {
  ignoreArmor?: boolean;
}

/** Damage actually taken after Armor Points, never below zero. */
export function mitigatedDamage(
  location: HitLocation,
  amount: number,
  { ignoreArmor = false }: DamageOptions = {},
): number {
  return ignoreArmor ? Math.max(0, amount) : Math.max(0, amount - location.armorPoints);
}

/**
 * What a hit would do, without doing it.
 *
 * Exists so the interface can show the outcome before the user commits: how
 * many Hit Points would remain and which wound it would cause. Applying damage
 * you cannot preview is how tables lose track of a fight.
 */
export interface DamagePreview {
  mitigated: number;
  absorbed: number;
  hitPointsAfter: number;
  woundAfter: WoundLevel;
}

export function previewDamage(
  location: HitLocation,
  amount: number,
  options: DamageOptions = {},
): DamagePreview {
  const mitigated = mitigatedDamage(location, amount, options);
  const hitPointsAfter = location.hitPoints - mitigated;
  return {
    mitigated,
    absorbed: Math.max(0, amount) - mitigated,
    hitPointsAfter,
    woundAfter: woundLevel({ ...location, hitPoints: hitPointsAfter }),
  };
}

/** Applies damage to a location, subtracting Armor Points first. */
export function applyDamage(
  location: HitLocation,
  amount: number,
  options: DamageOptions = {},
): HitLocation {
  return {
    ...location,
    hitPoints: location.hitPoints - mitigatedDamage(location, amount, options),
  };
}

/** Heals a location, never past its maximum Hit Points. */
export function applyHealing(location: HitLocation, amount: number): HitLocation {
  return {
    ...location,
    hitPoints: Math.min(location.maxHitPoints, location.hitPoints + amount),
  };
}

/**
 * What a hit would do to a weapon, without doing it.
 *
 * A parry puts the weapon in the way of the blow, so weapons take damage the
 * same way a location does — Armour Points first, then Hit Points — and at zero
 * the weapon breaks. There is no wound level, because a weapon is either usable
 * or it is not.
 *
 * Separate from `previewDamage` rather than casting a weapon into a
 * `HitLocation`: the two share arithmetic and nothing else, and a weapon with a
 * `range` and a `woundAfter` would be a lie the type system had agreed to.
 */
export interface WeaponDamagePreview {
  mitigated: number;
  absorbed: number;
  hitPointsAfter: number;
  broken: boolean;
}

export function previewWeaponDamage(
  weapon: Weapon,
  amount: number,
  { ignoreArmor = false }: DamageOptions = {},
): WeaponDamagePreview {
  const armorPoints = weapon.armorPoints ?? 0;
  const mitigated = ignoreArmor ? Math.max(0, amount) : Math.max(0, amount - armorPoints);
  const hitPointsAfter = Math.max(0, (weapon.hitPoints ?? 0) - mitigated);
  return {
    mitigated,
    absorbed: Math.max(0, amount) - mitigated,
    hitPointsAfter,
    broken: hitPointsAfter === 0,
  };
}
