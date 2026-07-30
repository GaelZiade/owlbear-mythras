import { describe, expect, it } from "vitest";

import { isEventAllowedForPlayer } from "../adapters/owlbear/protocol";
import {
  canAct,
  currentTurn,
  effectiveInitiative,
  effectiveMaxActionPoints,
  orderedCombatants,
  reduce,
  type CombatEvent,
} from "./combat";
import {
  FATIGUE_LEVELS,
  FATIGUE_TABLE,
  fatigueRow,
  fatigueSeverity,
  recoverFatigue,
  worsenFatigue,
  type FatigueLevel,
} from "./fatigue";
import { buildLocations, HUMANOID_PROFILE } from "./locations";
import { createEmptyState, type Combatant, type CombatState } from "./types";

function makeCombatant(overrides: Partial<Combatant> & Pick<Combatant, "id">): Combatant {
  return {
    name: overrides.id,
    initiative: 10,
    initiativeBonus: 0,
    actionPoints: 2,
    maxActionPoints: 2,
    locations: buildLocations(HUMANOID_PROFILE, 23),
    defeated: false,
    ...overrides,
  };
}

function play(state: CombatState, ...events: CombatEvent[]): CombatState {
  return events.reduce(reduce, state);
}

function added(...combatants: Combatant[]): CombatEvent {
  return { type: "combatants/added", combatants };
}

function find(state: CombatState, id: string): Combatant {
  const combatant = state.combatants.find((entry) => entry.id === id);
  if (!combatant) throw new Error(`No combatant ${id}`);
  return combatant;
}

function fatigued(id: string, fatigue: FatigueLevel, overrides: Partial<Combatant> = {}) {
  return makeCombatant({ id, fatigue, ...overrides });
}

describe("the Fatigue table", () => {
  it("has the book's ten levels, worsening downwards", () => {
    expect(FATIGUE_LEVELS).toEqual([
      "fresh",
      "winded",
      "tired",
      "wearied",
      "exhausted",
      "debilitated",
      "incapacitated",
      "semi-conscious",
      "comatose",
      "dead",
    ]);
  });

  /** The two columns the engine actually applies, transcribed from the table. */
  it("carries the Initiative and Action Point penalties the book prints", () => {
    const applied = FATIGUE_TABLE.map(({ level, initiativeModifier, actionPointsModifier }) => [
      level,
      initiativeModifier,
      actionPointsModifier,
    ]);
    expect(applied).toEqual([
      ["fresh", 0, 0],
      ["winded", 0, 0],
      ["tired", 0, 0],
      ["wearied", -2, 0],
      ["exhausted", -4, -1],
      ["debilitated", -6, -2],
      ["incapacitated", -8, -3],
      ["semi-conscious", 0, 0],
      ["comatose", 0, 0],
      ["dead", 0, 0],
    ]);
  });

  it("stops allowing activity from Semi-Conscious down", () => {
    const acting = FATIGUE_TABLE.filter(({ canAct: allowed }) => allowed).map(({ level }) => level);
    expect(acting).toEqual([
      "fresh",
      "winded",
      "tired",
      "wearied",
      "exhausted",
      "debilitated",
      "incapacitated",
    ]);
  });

  it("keeps the recovery periods, which the engine shows but never applies", () => {
    expect(fatigueRow("winded").recovery).toBe("15 minutes");
    expect(fatigueRow("incapacitated").recovery).toBe("24 hours");
    expect(fatigueRow("comatose").recovery).toBe("48 hours");
    // "Never" is what the book prints in the Recovery Period column for Dead,
    // and it is the one entry in that column that is a rule rather than a
    // duration. `null` is reserved for Fresh, which has nothing to recover from.
    expect(fatigueRow("dead").recovery).toBe("Never");
    expect(fatigueRow("fresh").recovery).toBeNull();
  });

  it("keeps the difficulty grade and movement, which are shown but not enforced", () => {
    expect(fatigueRow("tired").difficulty).toBe("hard");
    expect(fatigueRow("tired").movement).toBe("-1 metre");
    expect(fatigueRow("debilitated").difficulty).toBe("herculean");
    expect(fatigueRow("incapacitated").movement).toBe("Immobile");
  });

  it("treats a missing level as Fresh, so state from an older build still loads", () => {
    expect(fatigueRow(undefined).level).toBe("fresh");
    expect(fatigueSeverity(undefined)).toBe(0);
  });

  it("treats a level it does not know as Fresh rather than throwing", () => {
    expect(fatigueRow("hungover" as FatigueLevel).level).toBe("fresh");
  });

  it("worsens and recovers one level at a time", () => {
    expect(worsenFatigue("fresh")).toBe("winded");
    expect(worsenFatigue("wearied")).toBe("exhausted");
    expect(recoverFatigue("exhausted")).toBe("wearied");
  });

  it("stops at both ends instead of running off the table", () => {
    expect(worsenFatigue("dead")).toBe("dead");
    expect(recoverFatigue("fresh")).toBe("fresh");
  });
});

describe("Fatigue applied to Action Points", () => {
  it("leaves the first four levels alone", () => {
    expect(effectiveMaxActionPoints(fatigued("a", "wearied", { maxActionPoints: 3 }))).toBe(3);
  });

  it("takes a point off at Exhausted", () => {
    expect(effectiveMaxActionPoints(fatigued("a", "exhausted", { maxActionPoints: 3 }))).toBe(2);
  });

  it("never goes below zero, even when the penalty exceeds the total", () => {
    expect(effectiveMaxActionPoints(fatigued("a", "incapacitated", { maxActionPoints: 2 }))).toBe(0);
  });

  it("leaves the sheet's own maximum untouched, so recovery gives it back", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a", maxActionPoints: 3 })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "debilitated" },
    );
    expect(find(state, "a").maxActionPoints).toBe(3);
    expect(effectiveMaxActionPoints(find(state, "a"))).toBe(1);

    const recovered = play(state, {
      type: "combatant/fatigueChanged",
      combatantId: "a",
      fatigue: "fresh",
    });
    expect(effectiveMaxActionPoints(find(recovered, "a"))).toBe(3);
  });

  it("brings current Action Points down when Fatigue worsens past them", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a", actionPoints: 3, maxActionPoints: 3 })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "exhausted" },
    );
    expect(find(state, "a").actionPoints).toBe(2);
  });

  it("does not hand Action Points back on recovery, only raise the ceiling", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a", actionPoints: 3, maxActionPoints: 3 })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "debilitated" },
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "fresh" },
    );
    expect(find(state, "a").actionPoints).toBe(1);
    expect(effectiveMaxActionPoints(find(state, "a"))).toBe(3);
  });

  it("refills to the fatigued maximum at the end of a Round, not the sheet's", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a", maxActionPoints: 3 })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "exhausted" },
      { type: "combat/started" },
    );
    expect(find(state, "a").actionPoints).toBe(2);
  });

  it("applies Fatigue to a raised maximum without refilling current points", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a" })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "exhausted" },
      { type: "combatant/actionPointsMaxChanged", combatantId: "a", maxActionPoints: 4 },
    );
    // 2 max, dropped to 1 by Exhausted, then the sheet's maximum raised to 4.
    expect(find(state, "a").maxActionPoints).toBe(4);
    expect(effectiveMaxActionPoints(find(state, "a"))).toBe(3);
    // The ceiling moved; the points already spent stay spent until the Round ends.
    expect(find(state, "a").actionPoints).toBe(1);
  });

  it("will not spend past the fatigued ceiling when gaining points back", () => {
    const state = play(
      createEmptyState(),
      added(makeCombatant({ id: "a", actionPoints: 0, maxActionPoints: 3 })),
      { type: "combatant/fatigueChanged", combatantId: "a", fatigue: "exhausted" },
      { type: "actionPoints/changed", combatantId: "a", delta: 5 },
    );
    expect(find(state, "a").actionPoints).toBe(2);
  });
});

describe("Fatigue applied to Initiative", () => {
  it("leaves Initiative alone until Wearied", () => {
    expect(effectiveInitiative(fatigued("a", "tired", { initiative: 12 }))).toBe(12);
    expect(effectiveInitiative(fatigued("a", "wearied", { initiative: 12 }))).toBe(10);
  });

  it("goes negative rather than bunching the worst-off together at zero", () => {
    expect(effectiveInitiative(fatigued("a", "incapacitated", { initiative: 3 }))).toBe(-5);
  });

  it("reorders the initiative list by the fatigued value", () => {
    const state = play(
      createEmptyState(),
      added(
        fatigued("weary", "exhausted", { initiative: 12 }),
        makeCombatant({ id: "fresh", initiative: 10 }),
      ),
    );
    expect(orderedCombatants(state).map(({ id }) => id)).toEqual(["fresh", "weary"]);
  });

  it("opens the turn on the fatigued value, not the rolled one", () => {
    const state = play(
      createEmptyState(),
      added(
        fatigued("weary", "exhausted", { initiative: 12 }),
        makeCombatant({ id: "fresh", initiative: 10 }),
      ),
      { type: "combat/started" },
    );
    expect(currentTurn(state).map(({ id }) => id)).toEqual(["fresh"]);
    expect(state.activeTurn?.initiative).toBe(10);
  });

  /**
   * A penalty can drop one combatant onto another's value. They tie, and the
   * book has ties act simultaneously, so both must hold the same turn.
   */
  it("ties combatants whose penalty lands them on the same value", () => {
    const state = play(
      createEmptyState(),
      added(
        fatigued("weary", "wearied", { initiative: 12 }),
        makeCombatant({ id: "fresh", initiative: 10 }),
      ),
      { type: "combat/started" },
    );
    expect(currentTurn(state).map(({ id }) => id).sort()).toEqual(["fresh", "weary"]);
  });
});

describe("Fatigue and being able to act", () => {
  it("keeps Incapacitated in the fight, penalised but acting", () => {
    expect(canAct(fatigued("a", "incapacitated", { maxActionPoints: 5, actionPoints: 5 }))).toBe(
      true,
    );
  });

  it("drops Semi-Conscious, Comatose and Dead out of the order", () => {
    for (const level of ["semi-conscious", "comatose", "dead"] as const) {
      expect(canAct(fatigued("a", level))).toBe(false);
    }
  });

  it("skips them when the turn advances", () => {
    const state = play(
      createEmptyState(),
      added(
        makeCombatant({ id: "awake", initiative: 8 }),
        fatigued("out", "comatose", { initiative: 15 }),
      ),
      { type: "combat/started" },
    );
    expect(currentTurn(state).map(({ id }) => id)).toEqual(["awake"]);
  });

  it("drops someone whose Fatigue penalty leaves them no Action Points", () => {
    expect(canAct(fatigued("a", "incapacitated", { maxActionPoints: 2, actionPoints: 2 }))).toBe(
      false,
    );
  });
});

describe("Fatigue and the player permission line", () => {
  const state = play(
    createEmptyState(),
    added(
      makeCombatant({ id: "mine", ownerId: "player-1" }),
      makeCombatant({ id: "theirs", ownerId: "player-2" }),
    ),
  );

  it("lets a player set Fatigue on their own character", () => {
    const event: CombatEvent = {
      type: "combatant/fatigueChanged",
      combatantId: "mine",
      fatigue: "tired",
    };
    expect(isEventAllowedForPlayer(event, "player-1", state)).toBe(true);
  });

  it("refuses to let them set it on someone else's", () => {
    const event: CombatEvent = {
      type: "combatant/fatigueChanged",
      combatantId: "theirs",
      fatigue: "dead",
    };
    expect(isEventAllowedForPlayer(event, "player-1", state)).toBe(false);
  });
});
