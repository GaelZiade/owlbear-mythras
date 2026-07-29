import { describe, expect, it } from "vitest";

import { migrate } from "../adapters/owlbear/migrations";
import type { Characteristics } from "./characteristics";
import {
  baseMaxActionPoints,
  effectiveInitiativeBonus,
  effectiveMaxActionPoints,
  reduce,
  type CombatEvent,
} from "./combat";
import { buildLocations, HUMANOID_PROFILE } from "./locations";
import { createEmptyState, type Combatant, type CombatState } from "./types";

const JON: Characteristics = { STR: 15, CON: 9, SIZ: 16, DEX: 11, INT: 13, POW: 14, CHA: 13 };

function makeCombatant(overrides: Partial<Combatant> & Pick<Combatant, "id">): Combatant {
  return {
    name: overrides.id,
    initiative: 0,
    initiativeBonus: 10,
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

describe("a sheet outliving the roster", () => {
  /** The complaint this exists for: pull somebody out, put them back, start over. */
  const fullySetUp = makeCombatant({
    id: "c-jon",
    name: "Jon Snow",
    tokenId: "token-jon",
    ownerId: "player-1",
    characteristics: JON,
    initiativeModifier: -2,
    fatigue: "tired",
    notes: "Knows nothing.",
  });

  const afterRemoval = play(
    createEmptyState(),
    { type: "combatants/added", combatants: [fullySetUp] },
    { type: "combatant/removed", combatantId: "c-jon" },
  );

  it("leaves the initiative order", () => {
    expect(afterRemoval.combatants).toHaveLength(0);
  });

  it("files the sheet under the token", () => {
    expect(afterRemoval.characters["token-jon"]).toMatchObject({
      name: "Jon Snow",
      ownerId: "player-1",
      characteristics: JON,
      initiativeModifier: -2,
      fatigue: "tired",
      notes: "Knows nothing.",
    });
  });

  it("comes back whole when the token is added again", () => {
    const back = play(afterRemoval, {
      type: "combatants/added",
      combatants: [makeCombatant({ id: "c-new", name: "Token Name", tokenId: "token-jon" })],
    });

    const jon = back.combatants[0]!;
    expect(jon.name).toBe("Jon Snow");
    expect(jon.ownerId).toBe("player-1");
    expect(jon.characteristics).toEqual(JON);
    expect(jon.initiativeModifier).toBe(-2);
    expect(jon.fatigue).toBe("tired");
    expect(jon.notes).toBe("Knows nothing.");
  });

  /** Wounds are the character's, not the fight's: they do not heal on the way out. */
  it("brings the wounds back too", () => {
    const wounded = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [fullySetUp] },
      { type: "location/damaged", combatantId: "c-jon", locationId: "chest", amount: 4 },
      { type: "combatant/removed", combatantId: "c-jon" },
      {
        type: "combatants/added",
        combatants: [makeCombatant({ id: "c-again", tokenId: "token-jon" })],
      },
    );
    const chest = wounded.combatants[0]!.locations.find(({ id }) => id === "chest")!;
    expect(chest.hitPoints).toBe(chest.maxHitPoints - 4);
  });

  /** Rolled initiative belongs to the fight, not the sheet. */
  it("does not bring back a stale initiative roll", () => {
    const rolled = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [fullySetUp] },
      { type: "combatant/initiativeChanged", combatantId: "c-jon", initiative: 19 },
      { type: "combatant/removed", combatantId: "c-jon" },
      {
        type: "combatants/added",
        combatants: [makeCombatant({ id: "c-again", tokenId: "token-jon", initiative: 3 })],
      },
    );
    expect(rolled.combatants[0]!.initiative).toBe(0);
  });

  it("brings them back with Action Points full for the new fight", () => {
    const spent = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [fullySetUp] },
      { type: "actionPoints/changed", combatantId: "c-jon", delta: -2 },
      { type: "combatant/removed", combatantId: "c-jon" },
      {
        type: "combatants/added",
        combatants: [makeCombatant({ id: "c-again", tokenId: "token-jon" })],
      },
    );
    const jon = spent.combatants[0]!;
    expect(jon.actionPoints).toBe(effectiveMaxActionPoints(jon));
    expect(jon.actionPoints).toBeGreaterThan(0);
  });

  it("keeps a combatant with no token out of the archive, as documented", () => {
    const loose = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [makeCombatant({ id: "c-loose" })] },
      { type: "combatant/removed", combatantId: "c-loose" },
    );
    expect(loose.characters).toEqual({});
  });

  it("leaves an unknown token as whatever was passed in", () => {
    const fresh = play(createEmptyState(), {
      type: "combatants/added",
      combatants: [makeCombatant({ id: "c-x", name: "Stranger", tokenId: "token-unknown" })],
    });
    expect(fresh.combatants[0]!.name).toBe("Stranger");
    expect(fresh.combatants[0]!.characteristics).toBeUndefined();
  });
});

describe("remembering players", () => {
  it("keeps everyone Owlbear has reported", () => {
    const state = play(createEmptyState(), {
      type: "players/seen",
      players: [
        { id: "player-1", name: "Juan" },
        { id: "player-2", name: "Ana" },
      ],
    });
    expect(state.knownPlayers).toHaveLength(2);
  });

  /**
   * Owlbear reports only who is online, so each report is a slice of the room's
   * history. Replacing the list would forget whoever happened to be away.
   */
  it("merges reports instead of replacing them", () => {
    const state = play(
      createEmptyState(),
      { type: "players/seen", players: [{ id: "player-1", name: "Juan" }] },
      { type: "players/seen", players: [{ id: "player-2", name: "Ana" }] },
    );
    expect(state.knownPlayers.map(({ id }) => id).sort()).toEqual(["player-1", "player-2"]);
  });

  it("updates a name that changed rather than duplicating the player", () => {
    const state = play(
      createEmptyState(),
      { type: "players/seen", players: [{ id: "player-1", name: "Juan" }] },
      { type: "players/seen", players: [{ id: "player-1", name: "Juan Carlos" }] },
    );
    expect(state.knownPlayers).toEqual([{ id: "player-1", name: "Juan Carlos" }]);
  });
});

describe("Initiative Bonus and Action Points as base plus modifier", () => {
  it("derives the base from Characteristics when there are any", () => {
    const jon = makeCombatant({ id: "c", characteristics: JON, initiativeBonus: 99 });
    // (DEX 11 + INT 13) / 2 = 12, and the stored 99 is ignored.
    expect(effectiveInitiativeBonus(jon)).toBe(12);
    expect(baseMaxActionPoints(jon)).toBe(2);
  });

  /** MEG creatures have no Characteristics and a final strike_rank. */
  it("falls back to the stored value when there are none", () => {
    const beast = makeCombatant({ id: "c", initiativeBonus: 10, maxActionPoints: 3 });
    expect(effectiveInitiativeBonus(beast)).toBe(10);
    expect(baseMaxActionPoints(beast)).toBe(3);
  });

  /** Jon's armour is 10 ENC, which costs 2. */
  it("adds the modifier on top of either base", () => {
    const armoured = makeCombatant({ id: "c", characteristics: JON, initiativeModifier: -2 });
    expect(effectiveInitiativeBonus(armoured)).toBe(10);

    const beast = makeCombatant({ id: "c", initiativeBonus: 10, initiativeModifier: -3 });
    expect(effectiveInitiativeBonus(beast)).toBe(7);
  });

  it("adds an Action Point modifier and never goes below zero", () => {
    const blessed = makeCombatant({ id: "c", characteristics: JON, actionPointsModifier: 1 });
    expect(baseMaxActionPoints(blessed)).toBe(3);

    const cursed = makeCombatant({ id: "c", characteristics: JON, actionPointsModifier: -5 });
    expect(baseMaxActionPoints(cursed)).toBe(0);
  });

  it("stacks the modifier with Fatigue rather than replacing it", () => {
    const both = makeCombatant({
      id: "c",
      characteristics: JON,
      actionPointsModifier: 1,
      fatigue: "exhausted",
    });
    // 2 derived, +1 modifier, -1 Exhausted.
    expect(effectiveMaxActionPoints(both)).toBe(2);
  });

  it("brings current Action Points down when a modifier lowers the ceiling", () => {
    const state = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [makeCombatant({ id: "c", actionPoints: 3, maxActionPoints: 3 })] },
      { type: "combatant/actionPointsModifierChanged", combatantId: "c", actionPointsModifier: -2 },
    );
    expect(state.combatants[0]!.actionPoints).toBe(1);
  });

  it("treats an absent modifier as zero, so older combatants are unchanged", () => {
    const old = makeCombatant({ id: "c", initiativeBonus: 8 });
    expect(old.initiativeModifier).toBeUndefined();
    expect(effectiveInitiativeBonus(old)).toBe(8);
  });
});

describe("migrating to version 3", () => {
  it("carries a version 2 fight over with an empty archive", () => {
    const v2 = {
      schemaVersion: 2,
      status: "active",
      round: 2,
      cycle: 1,
      activeTurn: { initiative: 14, combatantIds: ["a"] },
      combatants: [{ id: "a", name: "A", initiative: 14, initiativeBonus: 0, actionPoints: 1, maxActionPoints: 2, locations: [], defeated: false }],
    };
    const migrated = migrate(v2);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.round).toBe(2);
    expect(migrated.combatants).toHaveLength(1);
    expect(migrated.characters).toEqual({});
    expect(migrated.knownPlayers).toEqual([]);
  });

  it("still migrates all the way from version 1", () => {
    const v1 = {
      schemaVersion: 1,
      status: "active",
      round: 1,
      cycle: 1,
      activeInitiative: 12,
      combatants: [{ id: "a", initiative: 12, actionPoints: 2, defeated: false }],
    };
    const migrated = migrate(v1);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.activeTurn).toEqual({ initiative: 12, combatantIds: ["a"] });
    expect(migrated.characters).toEqual({});
  });

  it("repairs a current-version state that is missing the additive fields", () => {
    const broken = {
      schemaVersion: 3,
      status: "idle",
      round: 0,
      cycle: 0,
      activeTurn: null,
      combatants: [],
    };
    const migrated = migrate(broken);
    expect(migrated.characters).toEqual({});
    expect(migrated.knownPlayers).toEqual([]);
  });
});

describe("never writing on load", () => {
  /**
   * The worst failure this project has had. `connect` read the room once and
   * then wrote, to record who was in the party. When that read answered before
   * the room had settled it produced an empty fight, and the write cemented it:
   * roster, wounds and imported sheets all gone. It presented as "nothing
   * persists", when in truth the load was destroying what had persisted.
   *
   * The engine cannot stop a caller writing at the wrong moment, so this pins
   * the property the caller depends on: recording players is a change to an
   * existing state, never a reason to replace one.
   */
  it("keeps the fight when players are recorded", () => {
    const fight = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [makeCombatant({ id: "a", tokenId: "t" })] },
      { type: "location/damaged", combatantId: "a", locationId: "chest", amount: 3 },
    );

    const after = play(fight, {
      type: "players/seen",
      players: [{ id: "player-1", name: "Juan" }],
    });

    expect(after.combatants).toHaveLength(1);
    const chest = after.combatants[0]!.locations.find(({ id }) => id === "chest")!;
    expect(chest.hitPoints).toBe(chest.maxHitPoints - 3);
  });

  it("does not invent a roster when told about players on an empty state", () => {
    const empty = play(createEmptyState(), {
      type: "players/seen",
      players: [{ id: "player-1", name: "Juan" }],
    });
    expect(empty.combatants).toEqual([]);
    expect(empty.knownPlayers).toHaveLength(1);
  });
});

describe("damage surviving a round trip through the room", () => {
  /** What a reload does: serialise, migrate back, and expect the wounds intact. */
  it("keeps wounds through serialisation and migration", () => {
    const fight = play(
      createEmptyState(),
      { type: "combatants/added", combatants: [makeCombatant({ id: "a", tokenId: "t" })] },
      { type: "location/damaged", combatantId: "a", locationId: "chest", amount: 4 },
      { type: "location/damaged", combatantId: "a", locationId: "head", amount: 2 },
    );

    const reloaded = migrate(JSON.parse(JSON.stringify(fight)));
    const byId = Object.fromEntries(
      reloaded.combatants[0]!.locations.map((l) => [l.id, l.hitPoints]),
    );
    const maxes = Object.fromEntries(
      reloaded.combatants[0]!.locations.map((l) => [l.id, l.maxHitPoints]),
    );
    expect(byId.chest).toBe(maxes.chest! - 4);
    expect(byId.head).toBe(maxes.head! - 2);
  });
});
