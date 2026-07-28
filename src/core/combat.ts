import { applyDamage, applyHealing, type DamageOptions } from "./wounds";
import { SCHEMA_VERSION, type ActiveTurn, type Combatant, type CombatState } from "./types";

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
  | { type: "combatant/defeatedToggled"; combatantId: string }
  | { type: "actionPoints/changed"; combatantId: string; delta: number }
  | {
      type: "location/damaged";
      combatantId: string;
      locationId: string;
      amount: number;
      ignoreArmor?: boolean;
    }
  | { type: "location/healed"; combatantId: string; locationId: string; amount: number }
  | { type: "location/armorChanged"; combatantId: string; locationId: string; armorPoints: number };

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
 */
export function canAct(combatant: Combatant): boolean {
  return !combatant.defeated && combatant.actionPoints > 0;
}

/** Initiative values that still have someone able to act, highest first. */
function initiativeOrder(state: CombatState): number[] {
  const values = state.combatants.filter(canAct).map((combatant) => combatant.initiative);
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
      .filter((combatant) => combatant.initiative === initiative && canAct(combatant))
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
  return combatant.initiative > turn.initiative ? "acted" : "pending";
}

export function orderedCombatants(state: CombatState): Combatant[] {
  return [...state.combatants].sort((a, b) => b.initiative - a.initiative);
}

function refreshActionPoints(combatants: Combatant[]): Combatant[] {
  return combatants.map((combatant) => ({
    ...combatant,
    actionPoints: combatant.maxActionPoints,
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

    case "combatants/added":
      if (event.combatants.length === 0) return state;
      return { ...state, combatants: [...state.combatants, ...event.combatants] };

    case "combatant/removed":
      return {
        ...state,
        combatants: state.combatants.filter(({ id }) => id !== event.combatantId),
      };

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
        const maxActionPoints = Math.max(0, event.maxActionPoints);
        return {
          ...combatant,
          maxActionPoints,
          actionPoints: Math.min(combatant.actionPoints, maxActionPoints),
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

    case "actionPoints/changed":
      return updateCombatant(state, event.combatantId, (combatant) => ({
        ...combatant,
        actionPoints: Math.max(
          0,
          Math.min(combatant.maxActionPoints, combatant.actionPoints + event.delta),
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
  }
}
