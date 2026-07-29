import { applyDamage, applyHealing, type DamageOptions } from "./wounds";
import { deriveAttributes, type Characteristics } from "./characteristics";
import { fatigueRow, type FatigueLevel } from "./fatigue";
import { hitPointsFor, type BodyPart } from "./tables";
import {
  SCHEMA_VERSION,
  type ActiveTurn,
  type Combatant,
  type CombatState,
  type KnownPlayer,
  type StoredCharacter,
} from "./types";

/**
 * Mythras combat engine.
 *
 * A pure function: `reduce(state, event) -> state`. It does not touch Owlbear,
 * does not touch React and never mutates its input, so the whole behaviour of a
 * fight can be verified from tests without starting anything.
 *
 * Combat has three levels, not two:
 *
 *   Round  five seconds, containing several Cycles
 *   Cycle  the initiative countdown, highest to lowest
 *   Turn   one participant's chance to act within a Cycle
 *
 * When a Cycle runs out another one opens for whoever still has Action Points.
 * When nobody does, the Round ends and Action Points are restored.
 */

export type CombatEvent =
  | { type: "combat/started" }
  | { type: "combat/ended" }
  | { type: "turn/advanced" }
  /**
   * Always plural, even for one.
   *
   * Adding several combatants has to be a single event: as separate events each
   * one is its own persisted write, and concurrent writes can land out of order
   * and drop the ones in between. It also makes "add the selection" a single
   * step to undo.
   */
  | { type: "combatants/added"; combatants: Combatant[] }
  | { type: "combatant/removed"; combatantId: string }
  | { type: "combatant/renamed"; combatantId: string; name: string }
  | { type: "combatant/initiativeChanged"; combatantId: string; initiative: number }
  | { type: "combatant/initiativeBonusChanged"; combatantId: string; initiativeBonus: number }
  | { type: "combatant/actionPointsMaxChanged"; combatantId: string; maxActionPoints: number }
  | { type: "combatant/ownerChanged"; combatantId: string; ownerId: string | undefined }
  | { type: "combatant/initiativeModifierChanged"; combatantId: string; initiativeModifier: number }
  | {
      type: "combatant/actionPointsModifierChanged";
      combatantId: string;
      actionPointsModifier: number;
    }
  /** Records who Owlbear has reported, so owners survive the party going offline. */
  | { type: "players/seen"; players: KnownPlayer[] }
  | { type: "combatant/defeatedToggled"; combatantId: string }
  | { type: "combatant/fatigueChanged"; combatantId: string; fatigue: FatigueLevel }
  | {
      type: "combatant/characteristicsChanged";
      combatantId: string;
      characteristics: Characteristics;
    }
  | { type: "actionPoints/changed"; combatantId: string; delta: number }
  | {
      type: "location/damaged";
      combatantId: string;
      locationId: string;
      amount: number;
      ignoreArmor?: boolean;
    }
  | { type: "location/healed"; combatantId: string; locationId: string; amount: number }
  | { type: "location/armorChanged"; combatantId: string; locationId: string; armorPoints: number }
  /**
   * Sets Hit Points outright, rather than by the difference damage and healing
   * apply. Setting up a character means entering what the sheet says, and
   * correcting a mistyped total should not require working out the delta.
   */
  | { type: "location/hitPointsChanged"; combatantId: string; locationId: string; hitPoints: number }
  | {
      type: "location/maxHitPointsChanged";
      combatantId: string;
      locationId: string;
      maxHitPoints: number;
    };

/**
 * The Initiative Bonus before Fatigue: derived when there are Characteristics
 * to derive from, stored otherwise, plus whatever armour is costing.
 *
 * Two bases rather than one because the two kinds of combatant genuinely differ.
 * A character built in the panel has Characteristics and the Bonus follows them;
 * a creature out of MEG has a final `strike_rank` and nothing to recompute it
 * from (DECISIONS §5).
 */
export function effectiveInitiativeBonus(combatant: Combatant): number {
  const base = combatant.characteristics
    ? deriveAttributes(combatant.characteristics).initiativeBonus
    : combatant.initiativeBonus;
  return base + (combatant.initiativeModifier ?? 0);
}

/** Maximum Action Points before Fatigue, on the same two-base rule. */
export function baseMaxActionPoints(combatant: Combatant): number {
  const base = combatant.characteristics
    ? deriveAttributes(combatant.characteristics).actionPoints
    : combatant.maxActionPoints;
  return Math.max(0, base + (combatant.actionPointsModifier ?? 0));
}

/**
 * Maximum Action Points after Fatigue.
 *
 * Fatigue is applied here rather than written into `maxActionPoints` so the
 * sheet value survives. A character who recovers has to get their full total
 * back, and that is only possible if the penalty was never stored.
 *
 * Floored at zero: Incapacitated costs 3 Action Points, which is more than many
 * combatants have, and a negative maximum has no meaning.
 */
export function effectiveMaxActionPoints(combatant: Combatant): number {
  const { actionPointsModifier } = fatigueRow(combatant.fatigue);
  return Math.max(0, baseMaxActionPoints(combatant) + actionPointsModifier);
}

/**
 * Initiative after Fatigue.
 *
 * Allowed to go negative. The penalties reach -8, which will outrun a low roll,
 * and clamping at zero would silently bunch the worst-off combatants together
 * at the bottom of the order instead of ranking them.
 */
export function effectiveInitiative(combatant: Combatant): number {
  return combatant.initiative + fatigueRow(combatant.fatigue).initiativeModifier;
}

/**
 * Whether a combatant can still take a Turn.
 *
 * Anyone out of Action Points is skipped outright, including in the first Cycle.
 *
 * This is a deliberate departure from the book, which gives a spent character a
 * Turn they cannot use: Anathaym parries three arrows, runs dry, and "her Turn
 * comes and she is unable to do anything". Stopping the tracker on someone who
 * has no move to make is friction at the table, so we skip them. Their Action
 * Points still come back at the end of the Round, so nothing is lost.
 *
 * From Semi-Conscious down the Fatigue table stops handing out penalties and
 * says no activity is possible at all, so those levels drop out here regardless
 * of how many Action Points are on the sheet.
 */
export function canAct(combatant: Combatant): boolean {
  if (combatant.defeated) return false;
  if (!fatigueRow(combatant.fatigue).canAct) return false;
  return Math.min(combatant.actionPoints, effectiveMaxActionPoints(combatant)) > 0;
}

/** Initiative values that still have someone able to act, highest first. */
function initiativeOrder(state: CombatState): number[] {
  const values = state.combatants.filter(canAct).map(effectiveInitiative);
  return [...new Set(values)].sort((a, b) => b - a);
}

/**
 * Opens the turn at an initiative value, recording who takes it.
 *
 * Membership is decided here, once, from who can act at that moment. Everything
 * afterwards reads the recorded list, so spending Action Points during a turn
 * changes what you can do but never who the turn belongs to.
 */
function beginTurn(state: CombatState, initiative: number): ActiveTurn {
  return {
    initiative,
    combatantIds: state.combatants
      .filter((combatant) => effectiveInitiative(combatant) === initiative && canAct(combatant))
      .map(({ id }) => id),
  };
}

/**
 * Combatants holding the turn right now.
 *
 * Someone who spends their last Action Point mid-turn stays here until the GM
 * advances: dropping them the moment they hit zero reads as "it is no longer
 * their turn", which is both wrong and disorienting. Someone who *arrived* on a
 * shared initiative with no points was never in the list to begin with.
 */
export function currentTurn(state: CombatState): Combatant[] {
  if (state.status !== "active" || !state.activeTurn) return [];
  const taking = new Set(state.activeTurn.combatantIds);
  return state.combatants.filter((combatant) => taking.has(combatant.id));
}

export type TurnStatus = "active" | "acted" | "pending" | "out";

/**
 * Where a combatant stands in the current Cycle, so the list can show progress
 * instead of only marking whoever is up.
 */
export function turnStatus(state: CombatState, combatant: Combatant): TurnStatus {
  const turn = state.activeTurn;
  if (state.status !== "active" || !turn) return "pending";
  if (turn.combatantIds.includes(combatant.id)) return "active";
  if (!canAct(combatant)) return "out";
  return effectiveInitiative(combatant) > turn.initiative ? "acted" : "pending";
}

export function orderedCombatants(state: CombatState): Combatant[] {
  return [...state.combatants].sort((a, b) => effectiveInitiative(b) - effectiveInitiative(a));
}

function refreshActionPoints(combatants: Combatant[]): Combatant[] {
  return combatants.map((combatant) => ({
    ...combatant,
    actionPoints: effectiveMaxActionPoints(combatant),
  }));
}

/**
 * Moves to the next Turn, opening a new Cycle or Round when needed.
 *
 * Order of attempts: next initiative down among those who can act -> a fresh
 * Cycle from the top -> close the Round, restore Action Points and start again.
 *
 * Action Points are never spent automatically. If nobody spends any, the Cycle
 * counter simply keeps climbing, which is both what the rules say and a visible
 * hint that someone forgot to track them.
 */
function advanceTurn(state: CombatState): CombatState {
  if (state.status !== "active") return state;

  const order = initiativeOrder(state);

  if (order.length === 0) {
    const refreshed: CombatState = { ...state, combatants: refreshActionPoints(state.combatants) };
    const opening = initiativeOrder(refreshed)[0];
    return {
      ...refreshed,
      round: state.round + 1,
      cycle: 1,
      activeTurn: opening === undefined ? null : beginTurn(refreshed, opening),
    };
  }

  const current = state.activeTurn;
  if (!current) {
    return { ...state, activeTurn: beginTurn(state, order[0]!) };
  }

  const next = order.find((initiative) => initiative < current.initiative);
  if (next !== undefined) {
    return { ...state, activeTurn: beginTurn(state, next) };
  }

  return { ...state, cycle: state.cycle + 1, activeTurn: beginTurn(state, order[0]!) };
}

/**
 * Which row of the Hit Points table a location reads from, or `null`.
 *
 * Matched on the name rather than declared, because locations are data and
 * arrive from anywhere — the panel's own humanoid profile, or MEG, where the
 * same part is called "Right leg" rather than "Right Leg". Anything unrecognised
 * returns null and keeps whatever Hit Points it already had.
 */
function bodyPartFor(id: string, name: string): BodyPart | null {
  const text = `${id} ${name}`.toLowerCase();
  if (text.includes("head")) return "head";
  if (text.includes("chest")) return "chest";
  if (text.includes("abdomen")) return "abdomen";
  if (text.includes("arm")) return "arm";
  if (text.includes("leg")) return "leg";
  return null;
}

/** The half of a combatant that outlives the fight. */
function toStoredCharacter(combatant: Combatant): StoredCharacter {
  return {
    name: combatant.name,
    initiativeBonus: combatant.initiativeBonus,
    maxActionPoints: combatant.maxActionPoints,
    locations: combatant.locations,
    ...(combatant.ownerId !== undefined ? { ownerId: combatant.ownerId } : {}),
    ...(combatant.characteristics ? { characteristics: combatant.characteristics } : {}),
    ...(combatant.initiativeModifier !== undefined
      ? { initiativeModifier: combatant.initiativeModifier }
      : {}),
    ...(combatant.actionPointsModifier !== undefined
      ? { actionPointsModifier: combatant.actionPointsModifier }
      : {}),
    ...(combatant.fatigue ? { fatigue: combatant.fatigue } : {}),
    ...(combatant.notes ? { notes: combatant.notes } : {}),
  };
}

function updateCombatant(
  state: CombatState,
  combatantId: string,
  update: (combatant: Combatant) => Combatant,
): CombatState {
  return {
    ...state,
    combatants: state.combatants.map((combatant) =>
      combatant.id === combatantId ? update(combatant) : combatant,
    ),
  };
}

function updateLocation(
  state: CombatState,
  combatantId: string,
  locationId: string,
  update: (location: Combatant["locations"][number]) => Combatant["locations"][number],
): CombatState {
  return updateCombatant(state, combatantId, (combatant) => ({
    ...combatant,
    locations: combatant.locations.map((location) =>
      location.id === locationId ? update(location) : location,
    ),
  }));
}

export function reduce(state: CombatState, event: CombatEvent): CombatState {
  switch (event.type) {
    case "combat/started": {
      const started: CombatState = {
        ...state,
        schemaVersion: SCHEMA_VERSION,
        status: "active",
        round: 1,
        cycle: 1,
        combatants: refreshActionPoints(state.combatants),
        activeTurn: null,
      };
      const opening = initiativeOrder(started)[0];
      return {
        ...started,
        activeTurn: opening === undefined ? null : beginTurn(started, opening),
      };
    }

    case "combat/ended":
      return { ...state, status: "idle", round: 0, cycle: 0, activeTurn: null };

    case "turn/advanced":
      return advanceTurn(state);

    /**
     * Anyone whose token has a sheet on file arrives with it restored, rather
     * than as a blank humanoid. Only the fight-scoped values are left fresh:
     * rolled initiative starts at 0 and Action Points start full, because those
     * belong to this fight and not to the character.
     */
    case "combatants/added": {
      if (event.combatants.length === 0) return state;
      const restored = event.combatants.map((combatant) => {
        const stored = combatant.tokenId ? state.characters[combatant.tokenId] : undefined;
        if (!stored) return combatant;

        const merged: Combatant = {
          ...combatant,
          name: stored.name,
          initiativeBonus: stored.initiativeBonus,
          maxActionPoints: stored.maxActionPoints,
          locations: stored.locations,
          ...(stored.ownerId !== undefined ? { ownerId: stored.ownerId } : {}),
          ...(stored.characteristics ? { characteristics: stored.characteristics } : {}),
          ...(stored.initiativeModifier !== undefined
            ? { initiativeModifier: stored.initiativeModifier }
            : {}),
          ...(stored.actionPointsModifier !== undefined
            ? { actionPointsModifier: stored.actionPointsModifier }
            : {}),
          ...(stored.fatigue ? { fatigue: stored.fatigue } : {}),
          ...(stored.notes ? { notes: stored.notes } : {}),
        };
        return { ...merged, initiative: 0, actionPoints: effectiveMaxActionPoints(merged) };
      });
      return { ...state, combatants: [...state.combatants, ...restored] };
    }

    /**
     * Removal archives the sheet rather than destroying it.
     *
     * A combatant with no token has nothing stable to file it under, so it is
     * dropped as before — that is the cost of not keeping a character library.
     */
    case "combatant/removed": {
      const leaving = state.combatants.find(({ id }) => id === event.combatantId);
      const combatants = state.combatants.filter(({ id }) => id !== event.combatantId);
      if (!leaving?.tokenId) return { ...state, combatants };

      return {
        ...state,
        combatants,
        characters: { ...state.characters, [leaving.tokenId]: toStoredCharacter(leaving) },
      };
    }

    case "combatant/initiativeModifierChanged":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        initiativeModifier: event.initiativeModifier,
      }));

    case "combatant/actionPointsModifierChanged":
      return updateCombatant(state, event.combatantId, (combatant) => {
        const updated = { ...combatant, actionPointsModifier: event.actionPointsModifier };
        return {
          ...updated,
          actionPoints: Math.min(updated.actionPoints, effectiveMaxActionPoints(updated)),
        };
      });

    /**
     * Merged rather than replaced: Owlbear only reports who is online, so each
     * report is a slice of the room's history, never the whole of it.
     */
    case "players/seen": {
      const byId = new Map(state.knownPlayers.map((player) => [player.id, player]));
      for (const player of event.players) byId.set(player.id, player);
      return { ...state, knownPlayers: [...byId.values()] };
    }

    case "combatant/renamed":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        name: event.name,
      }));

    case "combatant/initiativeChanged":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        initiative: event.initiative,
      }));

    case "combatant/initiativeBonusChanged":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        initiativeBonus: event.initiativeBonus,
      }));

    case "combatant/actionPointsMaxChanged":
      return updateCombatant(state, event.combatantId, (combatant) => {
        const raised = { ...combatant, maxActionPoints: Math.max(0, event.maxActionPoints) };
        return {
          ...raised,
          actionPoints: Math.min(raised.actionPoints, effectiveMaxActionPoints(raised)),
        };
      });

    case "combatant/ownerChanged":
      return updateCombatant(state, event.combatantId, (combatant) => {
        const { ownerId: _discarded, ...rest } = combatant;
        return event.ownerId === undefined ? rest : { ...rest, ownerId: event.ownerId };
      });

    case "combatant/defeatedToggled":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        defeated: !combatant.defeated,
      }));

    /**
     * Worsening Fatigue can put a combatant over their new ceiling, so current
     * Action Points come down with it. Recovering does *not* hand points back:
     * the ceiling rises, but points are only restored at the end of a Round,
     * and refilling mid-Cycle would be a free action out of nowhere.
     */
    case "combatant/fatigueChanged":
      return updateCombatant(state, event.combatantId, (combatant) => {
        const fatigued = { ...combatant, fatigue: event.fatigue };
        return {
          ...fatigued,
          actionPoints: Math.min(fatigued.actionPoints, effectiveMaxActionPoints(fatigued)),
        };
      });

    /**
     * Records the Characteristics and applies what Imperative derives from them.
     *
     * Only ever reached from the panel, never from an import: a creature out of
     * MEG arrives with its Attributes already final and re-deriving them here
     * would disagree with its own statblock (DECISIONS §5). Combatants from MEG
     * simply never get Characteristics, so this case never sees them.
     *
     * Hit Points are rewritten per location, keeping the damage already taken so
     * that correcting a mistyped SIZ mid-fight does not heal anybody. Locations
     * whose name matches no humanoid part are left alone rather than guessed at:
     * a tail has Hit Points, but not from this table.
     */
    case "combatant/characteristicsChanged":
      return updateCombatant(state, event.combatantId, (combatant) => {
        const derived = deriveAttributes(event.characteristics);
        const locations = combatant.locations.map((location) => {
          const part = bodyPartFor(location.id, location.name);
          if (!part) return location;
          const maxHitPoints = hitPointsFor(part, derived.conPlusSiz);
          const damageTaken = location.maxHitPoints - location.hitPoints;
          return { ...location, maxHitPoints, hitPoints: maxHitPoints - damageTaken };
        });

        const updated = {
          ...combatant,
          characteristics: event.characteristics,
          initiativeBonus: derived.initiativeBonus,
          maxActionPoints: derived.actionPoints,
          locations,
        };
        return {
          ...updated,
          actionPoints: Math.min(updated.actionPoints, effectiveMaxActionPoints(updated)),
        };
      });

    case "actionPoints/changed":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        actionPoints: Math.max(
          0,
          Math.min(effectiveMaxActionPoints(combatant), combatant.actionPoints + event.delta),
        ),
      }));

    case "location/damaged": {
      const options: DamageOptions = { ignoreArmor: event.ignoreArmor ?? false };
      return updateLocation(state, event.combatantId, event.locationId, (location) =>
        applyDamage(location, event.amount, options),
      );
    }

    case "location/healed":
      return updateLocation(state, event.combatantId, event.locationId, (location) =>
        applyHealing(location, event.amount),
      );

    case "location/armorChanged":
      return updateLocation(state, event.combatantId, event.locationId, (location) => ({
        ...location,
        armorPoints: Math.max(0, event.armorPoints),
      }));

    /**
     * Capped at the maximum but deliberately not floored at zero: negative Hit
     * Points are what distinguishes a Serious wound from a Major one, so
     * clamping them away would erase the distinction the rules turn on.
     */
    case "location/hitPointsChanged":
      return updateLocation(state, event.combatantId, event.locationId, (location) => ({
        ...location,
        hitPoints: Math.min(location.maxHitPoints, event.hitPoints),
      }));

    /**
     * Raising or lowering the maximum keeps the damage already taken, so a
     * combatant edited mid-fight stays as wounded as they were. Setting the
     * maximum on an untouched location therefore fills it, which is what
     * entering a character's sheet is meant to do.
     *
     * A location cannot drop below 1 Hit Point: at zero the Major Wound
     * threshold collapses onto the Serious one and every hit reads as Major.
     */
    case "location/maxHitPointsChanged":
      return updateLocation(state, event.combatantId, event.locationId, (location) => {
        const maxHitPoints = Math.max(1, event.maxHitPoints);
        const damageTaken = location.maxHitPoints - location.hitPoints;
        return { ...location, maxHitPoints, hitPoints: maxHitPoints - damageTaken };
      });
  }
}
