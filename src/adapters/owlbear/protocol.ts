import type { CombatEvent } from "../../core/combat";
import type { CombatState } from "../../core/types";

/**
 * Contract between the extension's clients.
 *
 * Authority model: the GM's client is the only writer. Players do not write,
 * they send requests; the GM validates them against these rules and applies the
 * ones that pass. That way two writers never compete for the same metadata and
 * no conflict resolution is needed.
 */

/** Namespaced key inside the room metadata. */
export const COMBAT_METADATA_KEY = "rodeo.owlbear.mythras/combat";

/** Channel carrying player requests to the GM. */
export const REQUEST_CHANNEL = "rodeo.owlbear.mythras/request";

export interface CombatRequest {
  event: CombatEvent;
}

/**
 * Events a player may request against a combatant they own.
 *
 * The dividing line is decisions about *a character* versus decisions about
 * *the fight*. A player owns their own sheet — what their Hit Points are, how
 * much armour they are wearing, what their Initiative Bonus works out to — so
 * they may set those without waiting on the GM.
 *
 * Everything else — starting and ending combat, advancing the turn, adding or
 * removing combatants, reassigning ownership, renaming — belongs to the GM
 * alone. Those change the shape of the encounter, not one character's numbers.
 */
const PLAYER_EDITABLE_EVENTS = new Set<CombatEvent["type"]>([
  "actionPoints/changed",
  "location/damaged",
  "location/healed",
  "location/armorChanged",
  "location/hitPointsChanged",
  "location/maxHitPointsChanged",
  "combatant/defeatedToggled",
  "combatant/initiativeChanged",
  "combatant/initiativeBonusChanged",
  "combatant/actionPointsMaxChanged",
  /**
   * Fatigue sits on the character side of the line, next to Hit Points: it is a
   * condition the sheet carries between fights, not a decision about the
   * encounter. A GM ruling that a forced march cost two levels still applies it
   * themselves — the GM may edit anyone.
   */
  "combatant/fatigueChanged",
  /**
   * Characteristics are the sheet itself — the numbers a player rolls or buys
   * at creation and the Attributes come from. Nothing sits further inside the
   * character side of the line.
   */
  "combatant/characteristicsChanged",
  /**
   * Luck and Magic Points, spent and set.
   *
   * The clearest case of a resource that belongs to whoever is spending it: the
   * book has the player decide to burn a Luck Point to cheat fate, in the middle
   * of somebody else's action. Routing that through the GM would put a person in
   * the way of a decision the rules already gave to the player.
   */
  "luckPoints/changed",
  "magicPoints/changed",
  "combatant/maxLuckPointsChanged",
  "combatant/maxMagicPointsChanged",
  "luck/desperateEffort",
  /** A weapon breaks in the hand of whoever is parrying with it. */
  "weapon/hitPointsChanged",
  /**
   * The armour penalty and any effect adjusting Action Points. Same side of the
   * line as the Characteristics they adjust — what you are wearing is yours.
   */
  "combatant/initiativeModifierChanged",
  "combatant/actionPointsModifierChanged",
]);

/**
 * Whether a player may cause this event.
 *
 * The check always runs on the GM's client, against the player id Owlbear
 * associates with the connection rather than any id carried inside the message:
 * message contents are written by the remote client and are not trustworthy.
 */
export function isEventAllowedForPlayer(
  event: CombatEvent,
  playerId: string,
  state: CombatState,
): boolean {
  if (!PLAYER_EDITABLE_EVENTS.has(event.type)) return false;
  if (!("combatantId" in event)) return false;

  const target = state.combatants.find(({ id }) => id === event.combatantId);
  return target?.ownerId === playerId;
}

export function isCombatRequest(data: unknown): data is CombatRequest {
  if (typeof data !== "object" || data === null || !("event" in data)) return false;
  const { event } = data as { event: unknown };
  return typeof event === "object" && event !== null && typeof (event as { type?: unknown }).type === "string";
}
