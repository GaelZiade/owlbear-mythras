import { hitPointsFor, type BodyPart } from "./tables";
import type { HitLocation } from "./types";

/**
 * Hit location profiles.
 *
 * A profile describes a creature's anatomy: which locations it has and which
 * d20 range hits each one. Humanoid is only the first profile; the Mythras
 * bestiary uses wings, tails, claws and forequarters with their own tables, and
 * they all fit this same shape without touching code.
 */
export interface LocationProfile {
  id: string;
  name: string;
  locations: ReadonlyArray<{
    id: string;
    name: string;
    range: readonly [number, number];
    /** Which row of the Hit Points table applies to this location. */
    part: BodyPart;
  }>;
}

/** Standard humanoid profile. Source: Mythras core rules, Combat chapter. */
export const HUMANOID_PROFILE: LocationProfile = {
  id: "humanoid",
  name: "Humanoid",
  locations: [
    { id: "right-leg", name: "Right Leg", range: [1, 3], part: "leg" },
    { id: "left-leg", name: "Left Leg", range: [4, 6], part: "leg" },
    { id: "abdomen", name: "Abdomen", range: [7, 9], part: "abdomen" },
    { id: "chest", name: "Chest", range: [10, 12], part: "chest" },
    { id: "right-arm", name: "Right Arm", range: [13, 15], part: "arm" },
    { id: "left-arm", name: "Left Arm", range: [16, 18], part: "arm" },
    { id: "head", name: "Head", range: [19, 20], part: "head" },
  ],
};

/**
 * Builds a combatant's locations from a profile and its CON + SIZ.
 *
 * Armor is passed separately because it is not derived from characteristics:
 * it depends on what the creature happens to be wearing.
 */
export function buildLocations(
  profile: LocationProfile,
  conPlusSiz: number,
  armorPoints: Readonly<Record<string, number>> = {},
): HitLocation[] {
  return profile.locations.map((location) => {
    const maxHitPoints = hitPointsFor(location.part, conPlusSiz);
    return {
      id: location.id,
      name: location.name,
      range: location.range,
      hitPoints: maxHitPoints,
      maxHitPoints,
      armorPoints: armorPoints[location.id] ?? 0,
    };
  });
}

/** The location hit by a d20 roll, or `undefined` if the profile leaves it uncovered. */
export function locationForRoll(
  locations: readonly HitLocation[],
  roll: number,
): HitLocation | undefined {
  return locations.find(({ range }) => roll >= range[0] && roll <= range[1]);
}
