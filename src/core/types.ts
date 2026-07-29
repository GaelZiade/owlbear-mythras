/**
 * Mythras domain model.
 *
 * This module knows nothing about Owlbear Rodeo or React. Everything here must
 * run and be testable in plain Node with no external dependencies.
 *
 * Naming note: Mythras abbreviates both "Action Points" and "Armor Points" as
 * AP. This codebase never abbreviates either one.
 */

import type { Characteristics } from "./characteristics";
import type { FatigueLevel } from "./fatigue";

/** Version of the persisted state. Changing the model means bumping this and adding a migration. */
export const SCHEMA_VERSION = 3;

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
   * Initiative Bonus when there are no Characteristics to derive one from.
   *
   * Creatures imported from MEG land here: their `strike_rank` is already final
   * and there is nothing to recompute it from. A character with Characteristics
   * ignores this and uses the derived value instead — see
   * `effectiveInitiativeBonus`.
   */
  initiativeBonus: number;
  actionPoints: number;
  /** Maximum Action Points when there are no Characteristics. Same story as above. */
  maxActionPoints: number;
  /**
   * Adjustment to the Initiative Bonus, on top of whatever the base is.
   *
   * This is where armour lives: a hoplite panoply is 28 ENC and costs 6. It is
   * kept separate from the base rather than folded into it because the two have
   * different lifetimes — the base follows the Characteristics, the modifier
   * follows what the character is currently wearing.
   */
  initiativeModifier?: number;
  /** Adjustment to maximum Action Points, for effects that grant or cost one. */
  actionPointsModifier?: number;
  /**
   * Fatigue level, absent meaning Fresh.
   *
   * Optional rather than required so a fight saved by an earlier build still
   * loads: every combatant without the field reads as unfatigued, which is what
   * it was. That keeps the schema version where it is.
   */
  fatigue?: FatigueLevel;
  /**
   * Free text shown in the detail panel, absent meaning none.
   *
   * Exists because imported creatures carry their mechanics here rather than in
   * the statblock: "Rabble", "***Total 5 Hitpoints***", ability descriptions.
   * Dropping it on import would lose the half of the creature the tracker
   * cannot model.
   */
  notes?: string;
  /**
   * The seven Characteristics, absent when nobody entered them.
   *
   * Optional because most combatants never need them: a creature imported from
   * MEG arrives with its Attributes already final, and re-deriving them here
   * would disagree with the statblock (DECISIONS §5). They are stored for
   * characters built in the panel, where they are the input the Attributes come
   * from, and so that a corrected SIZ can recompute what depends on it.
   */
  characteristics?: Characteristics;
  /**
   * Percentages to roll against, absent when nobody imported a sheet.
   *
   * Stored as final numbers rather than as the builder's formulas: the formulas
   * are that format's business, and re-evaluating them here would mean carrying
   * a second rules engine that has to agree with `characteristics.ts`.
   */
  skills?: Skill[];
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

/**
 * The turn currently being taken.
 *
 * Holds both where the countdown is and who is taking the turn, because those
 * are genuinely two different questions once initiatives can tie.
 *
 * `combatantIds` is fixed when the turn begins and never recomputed. Deriving it
 * from "everyone on this initiative" instead was wrong in both directions: a
 * combatant who arrived on a shared initiative with no Action Points lit up as
 * active even though they were about to be skipped, and one who spent their last
 * point mid-turn had to keep the marker, which the same rule could not express.
 */
export interface ActiveTurn {
  /** Position in the Cycle's countdown. */
  initiative: number;
  /** Who is taking it. Ties act simultaneously, so this can hold several. */
  combatantIds: string[];
}

/** A skill or combat style, as a percentage. */
export interface Skill {
  name: string;
  value: number;
  /** Professional skills are untrained at zero; basic ones always have a value. */
  professional: boolean;
  /** Combat styles roll like skills but are worth showing apart. */
  combatStyle: boolean;
}

/**
 * A character's durable half, kept when they leave the initiative order.
 *
 * The roster is not the sheet. Pulling somebody out of the fight used to
 * destroy their Characteristics, armour, owner and wounds, so putting them back
 * meant entering all of it again — which is not what "remove from tracker"
 * means to anybody at a table.
 *
 * Archived on removal and restored on add, keyed by Owlbear token id. That
 * makes the roster the single source of truth *during* a fight and this a pure
 * archive, rather than two copies of the same data drifting apart.
 */
export interface StoredCharacter {
  name: string;
  ownerId?: string;
  characteristics?: Characteristics;
  skills?: Skill[];
  initiativeBonus: number;
  maxActionPoints: number;
  initiativeModifier?: number;
  actionPointsModifier?: number;
  fatigue?: FatigueLevel;
  notes?: string;
  /** Kept whole, wounds included: someone pulled out of a fight is still hurt. */
  locations: HitLocation[];
}

/** A player Owlbear has told us about, remembered so owners can be set offline. */
export interface KnownPlayer {
  id: string;
  name: string;
}

export interface CombatState {
  schemaVersion: number;
  status: "idle" | "active";
  /** Combat Round: the five second period. Starts at 1. */
  round: number;
  /** Cycle within the Round: the initiative countdown. Starts at 1. */
  cycle: number;
  /**
   * `null` between fights, and while a Round has nobody left able to act.
   *
   * Identifying combatants by id rather than by list position matters because
   * the list mutates during combat: an index breaks when someone is added or
   * removed, an id does not.
   */
  activeTurn: ActiveTurn | null;
  combatants: Combatant[];
  /**
   * Sheets of characters not currently in the fight, by token id.
   *
   * Only reachable through a token: a combatant added without one has nothing
   * stable to key on, so it is not archived. That is the trade for not needing a
   * character library and a screen to manage it.
   */
  characters: Record<string, StoredCharacter>;
  /**
   * Everyone seen in this room, so a combatant can be assigned to a player who
   * is not connected right now. Owlbear only reports who is online, which meant
   * the owner dropdown was empty whenever the party had not arrived yet.
   */
  knownPlayers: KnownPlayer[];
}

export function createEmptyState(): CombatState {
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "idle",
    round: 0,
    cycle: 0,
    activeTurn: null,
    combatants: [],
    characters: {},
    knownPlayers: [],
  };
}
