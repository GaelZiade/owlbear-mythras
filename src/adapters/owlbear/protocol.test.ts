import { describe, expect, it } from "vitest";

import type { CombatEvent } from "../../core/combat";
import { buildLocations, HUMANOID_PROFILE } from "../../core/locations";
import { createEmptyState, type Combatant, type CombatState } from "../../core/types";
import { isCombatRequest, isEventAllowedForPlayer } from "./protocol";

/**
 * The authority model, which is the one place where a mistake is a security
 * bug rather than a nuisance: these checks run on the GM's client against
 * requests written by somebody else's browser.
 */

const ALICE = "player-alice";
const BOB = "player-bob";

function combatant(id: string, ownerId?: string): Combatant {
  return {
    id,
    name: id,
    initiative: 10,
    initiativeBonus: 0,
    actionPoints: 2,
    maxActionPoints: 2,
    locations: buildLocations(HUMANOID_PROFILE, 23),
    defeated: false,
    ...(ownerId === undefined ? {} : { ownerId }),
  };
}

const state: CombatState = {
  ...createEmptyState(),
  combatants: [combatant("hers", ALICE), combatant("his", BOB), combatant("npc")],
};

/** Everything a player may do to their own character. */
const OWN_CHARACTER: CombatEvent[] = [
  { type: "actionPoints/changed", combatantId: "hers", delta: -1 },
  { type: "combatant/initiativeChanged", combatantId: "hers", initiative: 14 },
  { type: "combatant/initiativeBonusChanged", combatantId: "hers", initiativeBonus: 15 },
  { type: "combatant/actionPointsMaxChanged", combatantId: "hers", maxActionPoints: 3 },
  { type: "combatant/defeatedToggled", combatantId: "hers" },
  { type: "location/damaged", combatantId: "hers", locationId: "chest", amount: 4 },
  { type: "location/healed", combatantId: "hers", locationId: "chest", amount: 2 },
  { type: "location/armorChanged", combatantId: "hers", locationId: "chest", armorPoints: 5 },
  { type: "location/hitPointsChanged", combatantId: "hers", locationId: "chest", hitPoints: 3 },
  { type: "location/maxHitPointsChanged", combatantId: "hers", locationId: "chest", maxHitPoints: 8 },
];

/** Decisions about the encounter, which stay with the GM. */
const THE_GM_ALONE: CombatEvent[] = [
  { type: "combat/started" },
  { type: "combat/ended" },
  { type: "turn/advanced" },
  { type: "combatants/added", combatants: [combatant("intruder", ALICE)] },
  { type: "combatant/removed", combatantId: "hers" },
  { type: "combatant/renamed", combatantId: "hers", name: "Renamed" },
  { type: "combatant/ownerChanged", combatantId: "hers", ownerId: ALICE },
];

describe("what a player may request", () => {
  it.each(OWN_CHARACTER.map((event) => [event.type, event] as const))(
    "allows %s against their own character",
    (_type, event) => {
      expect(isEventAllowedForPlayer(event, ALICE, state)).toBe(true);
    },
  );

  it.each(OWN_CHARACTER.map((event) => [event.type, event] as const))(
    "refuses %s against somebody else's character",
    (_type, event) => {
      expect(isEventAllowedForPlayer(event, BOB, state)).toBe(false);
    },
  );

  it.each(THE_GM_ALONE.map((event) => [event.type, event] as const))(
    "refuses %s, which is the GM's to decide",
    (_type, event) => {
      expect(isEventAllowedForPlayer(event, ALICE, state)).toBe(false);
    },
  );

  it("refuses a combatant nobody owns", () => {
    const event: CombatEvent = { type: "actionPoints/changed", combatantId: "npc", delta: -1 };
    expect(isEventAllowedForPlayer(event, ALICE, state)).toBe(false);
  });

  it("refuses a combatant that does not exist", () => {
    const event: CombatEvent = { type: "actionPoints/changed", combatantId: "ghost", delta: -1 };
    expect(isEventAllowedForPlayer(event, ALICE, state)).toBe(false);
  });

  /**
   * Ownership is read from the state the GM holds, never from the request. A
   * client that claims to own a combatant is claiming it about itself.
   */
  it("ignores an ownerId smuggled into the request", () => {
    const forged = {
      type: "actionPoints/changed",
      combatantId: "his",
      delta: -1,
      ownerId: ALICE,
    } as unknown as CombatEvent;
    expect(isEventAllowedForPlayer(forged, ALICE, state)).toBe(false);
  });
});

describe("recognising a request at all", () => {
  it("accepts a well formed request", () => {
    expect(isCombatRequest({ event: { type: "turn/advanced" } })).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "turn/advanced"],
    ["an object with no event", {}],
    ["an event that is not an object", { event: "turn/advanced" }],
    ["an event with no type", { event: {} }],
    ["an event whose type is not a string", { event: { type: 7 } }],
  ])("rejects %s", (_label, payload) => {
    expect(isCombatRequest(payload)).toBe(false);
  });
});

describe("who may spend Luck and Magic Points", () => {
  const state: CombatState = {
    ...createEmptyState(),
    combatants: [
      combatant("mine", ALICE),
      combatant("theirs", BOB),
    ],
  };

  /**
   * The book has the player decide to burn a Luck Point mid-action, so routing
   * it through the GM would put a person in the way of a decision the rules
   * already handed to the player.
   */
  it("lets a player spend their own", () => {
    for (const event of [
      { type: "luckPoints/changed", combatantId: "mine", delta: -1 },
      { type: "magicPoints/changed", combatantId: "mine", delta: -3 },
      { type: "luck/desperateEffort", combatantId: "mine" },
    ] as const) {
      expect(isEventAllowedForPlayer(event, ALICE, state)).toBe(true);
    }
  });

  it("refuses somebody else's", () => {
    expect(
      isEventAllowedForPlayer(
        { type: "luckPoints/changed", combatantId: "theirs", delta: -1 },
        ALICE,
        state,
      ),
    ).toBe(false);
    expect(
      isEventAllowedForPlayer({ type: "luck/desperateEffort", combatantId: "theirs" }, ALICE, state),
    ).toBe(false);
  });
});
