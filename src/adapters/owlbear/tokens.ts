import OBR, { type Item } from "@owlbear-rodeo/sdk";

import { buildLocations, HUMANOID_PROFILE } from "../../core/locations";
import type { Combatant } from "../../core/types";

/**
 * Building combatants from the scene's tokens.
 *
 * A combatant can exist without a token — an archer off the map, an absent
 * character — so the link is optional in both directions.
 */

/**
 * Defaults until the character sheet exists.
 *
 * CON + SIZ = 21 is an average human: 5 points in head and legs, 6 in the
 * abdomen, 7 in the chest and 4 in the arms. These are placeholders meant to be
 * edited by hand, not an estimate of anything.
 */
const DEFAULT_CON_PLUS_SIZ = 21;
const DEFAULT_ACTION_POINTS = 2;

export function createCombatant(name: string): Combatant {
  return {
    id: crypto.randomUUID(),
    name,
    initiative: 0,
    initiativeBonus: 0,
    actionPoints: DEFAULT_ACTION_POINTS,
    maxActionPoints: DEFAULT_ACTION_POINTS,
    locations: buildLocations(HUMANOID_PROFILE, DEFAULT_CON_PLUS_SIZ),
    defeated: false,
  };
}

function combatantFromItem(item: Item): Combatant {
  return {
    ...createCombatant(item.name),
    tokenId: item.id,
    // Whoever created the token owns it by default, which gives a player control
    // of their own Action and Hit Points with no extra setup. When the GM makes
    // the token, they can reassign the owner from the combatant's panel.
    ownerId: item.createdUserId,
  };
}

function newcomers(items: readonly Item[], existing: readonly Combatant[]): Combatant[] {
  const alreadyInCombat = new Set(
    existing.map(({ tokenId }) => tokenId).filter((id): id is string => id !== undefined),
  );
  return items.filter((item) => !alreadyInCombat.has(item.id)).map(combatantFromItem);
}

/**
 * Turns the current selection into combatants, skipping tokens already in the
 * fight so pressing the button twice does not duplicate anyone.
 */
export async function combatantsFromSelection(existing: readonly Combatant[]): Promise<Combatant[]> {
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length === 0) return [];

  return newcomers(await OBR.scene.items.getItems(selection), existing);
}

/**
 * Every token on the scene that could plausibly fight.
 *
 * Restricted to the character and mount layers: the scene also holds maps,
 * drawings, notes and props, and sweeping those into the initiative order would
 * make the button useless.
 */
export async function combatantsFromScene(existing: readonly Combatant[]): Promise<Combatant[]> {
  const items = await OBR.scene.items.getItems(
    (item) => item.layer === "CHARACTER" || item.layer === "MOUNT",
  );
  return newcomers(items, existing);
}

/** Combatants whose token is currently selected in the scene. */
export async function combatantsInSelection(
  combatants: readonly Combatant[],
): Promise<Combatant[]> {
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length === 0) return [];

  const selected = new Set(selection);
  return combatants.filter(
    (combatant) => combatant.tokenId !== undefined && selected.has(combatant.tokenId),
  );
}
