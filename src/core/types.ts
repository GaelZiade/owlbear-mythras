/**
 * Mythras domain model.
 *
 * This module knows nothing about Owlbear Rodeo or React. Everything here must
 * run and be testable in plain Node with no external dependencies.
 *
 * Naming note: Mythras abbreviates both "Action Points" and "Armor Points" as
 * AP. This codebase never abbreviates either one.
 */

/** Version of the persisted state. Changing the model means bumping this and adding a migration. */
export const SCHEMA_VERSION = 1;

/**
 * A hit location.
 *
 * Not a fixed enum of humanoid parts: the Mythras bestiary has wings, tails,
 * claws and forequarters, each creature with its own d20 table. Locations are
 * therefore data, not types.
 */
export interface HitLocation {
  /** Stable identifier within the combatant, e.g. "right-leg". */
  id: string;
  name: string;
  /** The d20 range that hits here, both ends inclusive. */
  range: readonly [min: number, max: number];
  /** Current Hit Points. Goes negative: that is where Serious and Major Wounds come from. */
  hitPoints: number;
  /** Maximum Hit Points. Also defines the Major Wound threshold. */
  maxHitPoints: number;
  /** Armor Points protecting this location. */
  armorPoints: number;
}

/**
 * Wound severity of a location, derived from Hit Points rather than declared.
 *
 * Mythras names three levels: Minor, Serious and Major. "Unharmed" is not one
 * of them; it exists here only so the interface can tell an untouched location
 * from a scratched one.
 */
export type WoundLevel = "unharmed" | "minor" | "serious" | "major";

export interface Combatant {
  id: string;
  name: string;
  /** Linked Owlbear item, if any. A combatant can exist without a token. */
  tokenId?: string;
  /**
   * Owlbear player controlling this combatant.
   * Grants the right to edit its Action Points, Hit Points and Initiative.
   */
  ownerId?: string;
  /** Result of 1d10 + Initiative Bonus. Ties act simultaneously. */
  initiative: number;
  /**
   * Initiative Bonus: the average of INT and DEX, less the armor penalty.
   * Stored so initiative can be rolled for a whole group at once.
   */
  initiativeBonus: number;
  actionPoints: number;
  maxActionPoints: number;
  locations: HitLocation[];
  /**
   * Toggled by hand, never derived from Hit Points.
   *
   * In Mythras, being knocked out of a fight comes from opposed Endurance rolls
   * the extension cannot know about, so the call is always a human one. A
   * defeated combatant is skipped in the initiative order.
   */
  defeated: boolean;
}

export interface CombatState {
  schemaVersion: number;
  status: "idle" | "active";
  /** Combat Round: the five second period. Starts at 1. */
  round: number;
  /** Cycle within the Round: the initiative countdown. Starts at 1. */
  cycle: number;
  /**
   * The Initiative value currently holding the turn.
   *
   * Stored as a value rather than an index because several combatants can share
   * an initiative (they act simultaneously) and because the list mutates during
   * combat: an index breaks when combatants are added or removed, a value does not.
   */
  activeInitiative: number | null;
  combatants: Combatant[];
}

export function createEmptyState(): CombatState {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "idle",
    round: 0,
    cycle: 0,
    activeInitiative: null,
    combatants: [],
  };
}
