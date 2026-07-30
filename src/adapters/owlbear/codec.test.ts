import { describe, expect, it } from "vitest";

import { combatantFromSheet, parseSheet } from "../sheet/parse";
import jonSnow from "../sheet/fixtures/jon-snow.json";
import { buildLocations, HUMANOID_PROFILE } from "../../core/locations";
import { createEmptyState, type CombatState } from "../../core/types";
import {
  decodeFromRoom,
  decodeState,
  encodeForRoom,
  encodeState,
  METADATA_LIMIT_BYTES,
  payloadSize,
} from "./codec";

const encodedSize = (state: CombatState) => payloadSize(encodeState(state));

const jon = combatantFromSheet(parseSheet(jonSnow).value!, "c-jon");

function fightWith(count: number): CombatState {
  const combatants = Array.from({ length: count }, (_, index) => ({
    ...jon,
    id: `c-${index}`,
    tokenId: `token-${index}`,
  }));
  return {
    ...createEmptyState(),
    status: "active",
    round: 2,
    cycle: 1,
    activeTurn: { initiative: 12, combatantIds: ["c-0"] },
    combatants,
    characters: Object.fromEntries(
      combatants.map((c) => [c.tokenId!, { ...c, initiativeBonus: c.initiativeBonus, maxActionPoints: c.maxActionPoints }]),
    ),
    knownPlayers: [{ id: "player-1", name: "Juan" }],
  };
}

describe("packing for the 16 kB ceiling", () => {
  /**
   * Owlbear refuses a write past 16 kB outright. This is the number the whole
   * format exists for, so it is asserted rather than described.
   */
  it("fits a party of six with archived sheets", () => {
    const size = encodedSize(fightWith(6));
    expect(size).toBeLessThan(METADATA_LIMIT_BYTES);
  });

  it("is far smaller than the verbose shape it replaces", () => {
    const state = fightWith(6);
    const verbose = new TextEncoder().encode(JSON.stringify(state)).length;
    expect(encodedSize(state)).toBeLessThan(verbose / 2);
  });

  it("spends its savings on skills and locations, which were the bulk", () => {
    const one = encodedSize({ ...createEmptyState(), combatants: [jon] });
    expect(one).toBeLessThan(1500);
  });
});

/**
 * A fight where no two sheets are alike.
 *
 * Copies of one character compress to almost nothing, which would make the
 * numbers below a flattering lie. Every value is nudged instead, so what is
 * measured is a real party rather than the compressor spotting a repeat.
 */
function variedFight(count: number): CombatState {
  const state = fightWith(count);
  const combatants = state.combatants.map((combatant, index) => ({
    ...combatant,
    name: `Combatant ${index} of ${count}`,
    ...(combatant.skills
      ? {
          skills: combatant.skills.map((skill) => ({
            ...skill,
            value: skill.value + ((index * 7 + skill.name.length) % 23) - 11,
          })),
        }
      : {}),
    locations: combatant.locations.map((location) => ({
      ...location,
      hitPoints: Math.max(1, location.hitPoints - (index % 4)),
    })),
  }));
  return {
    ...state,
    combatants,
    characters: Object.fromEntries(combatants.map((c) => [c.tokenId!, c])),
  };
}

describe("compressing for the ceiling", () => {
  /**
   * The number the compression exists for. Packed but uncompressed, the eighth
   * imported character crosses 16 kB; a large fight would hit it mid-session,
   * which is exactly when nobody can do anything about it.
   */
  it("fits a fight far larger than anyone will run", async () => {
    const { size } = await encodeForRoom(variedFight(50));
    expect(size).toBeLessThan(METADATA_LIMIT_BYTES);
  });

  it("leaves the budget mostly unspent at a realistic party size", async () => {
    const { size } = await encodeForRoom(variedFight(8));
    // Uncompressed this state is over the ceiling.
    expect(encodedSize(variedFight(8))).toBeGreaterThan(METADATA_LIMIT_BYTES);
    expect(size).toBeLessThan(METADATA_LIMIT_BYTES / 4);
  });

  it("returns the same fight it compressed", async () => {
    const state = variedFight(12);
    const { payload } = await encodeForRoom(state);
    const back = await decodeFromRoom(payload);
    expect(back.combatants).toHaveLength(12);
    expect(back.combatants[5]!.skills).toEqual(state.combatants[5]!.skills);
    expect(back.combatants[5]!.locations).toEqual(state.combatants[5]!.locations);
    expect(Object.keys(back.characters)).toHaveLength(12);
  });

  it("writes a small fight uncompressed, since deflating it would cost bytes", async () => {
    const { payload } = await encodeForRoom(createEmptyState());
    expect(payload).toHaveProperty("wire");
  });

  it("reads a packed state that was never compressed", async () => {
    const state = fightWith(2);
    const back = await decodeFromRoom(encodeState(state));
    expect(back.combatants).toHaveLength(2);
  });

  it("returns an empty fight rather than throwing on a corrupt payload", async () => {
    const back = await decodeFromRoom({ z: 5, d: "not base64 deflate" });
    expect(back.combatants).toEqual([]);
  });
});

describe("a round trip through the wire format", () => {
  const state = fightWith(3);
  const back = decodeState(encodeState(state));

  it("returns the same fight", () => {
    expect(back.status).toBe("active");
    expect(back.round).toBe(2);
    expect(back.activeTurn).toEqual({ initiative: 12, combatantIds: ["c-0"] });
    expect(back.combatants).toHaveLength(3);
    expect(back.knownPlayers).toEqual([{ id: "player-1", name: "Juan" }]);
  });

  it("returns every skill unchanged, flags included", () => {
    expect(back.combatants[0]!.skills).toEqual(jon.skills);
  });

  it("returns every hit location unchanged", () => {
    expect(back.combatants[0]!.locations).toEqual(jon.locations);
  });

  it("keeps wounds, which is the thing that kept going missing", () => {
    const wounded = {
      ...state,
      combatants: [
        {
          ...jon,
          locations: jon.locations.map((l) =>
            l.id === "chest" ? { ...l, hitPoints: l.maxHitPoints - 4 } : l,
          ),
        },
      ],
    };
    const chest = decodeState(encodeState(wounded)).combatants[0]!.locations.find(
      ({ id }) => id === "chest",
    )!;
    expect(chest.hitPoints).toBe(chest.maxHitPoints - 4);
  });

  it("keeps the Characteristics, the token link and the modifiers", () => {
    const one = decodeState(encodeState({ ...createEmptyState(), combatants: [jon] })).combatants[0]!;
    expect(one.characteristics).toEqual(jon.characteristics);
    expect(one.initiativeModifier).toBe(jon.initiativeModifier);
  });

  it("keeps the archived sheets", () => {
    expect(Object.keys(back.characters)).toHaveLength(3);
    expect(back.characters["token-0"]!.skills).toEqual(jon.skills);
  });

  it("leaves skills off a combatant that has none", () => {
    const { skills: _none, ...plain } = { ...jon, id: "c-plain" };
    const one = decodeState(encodeState({ ...createEmptyState(), combatants: [plain] })).combatants[0]!;
    expect(one.skills).toBeUndefined();
  });
});

describe("reading what earlier builds wrote", () => {
  /** Rooms written before packing existed hold the verbose shape and still load. */
  it("still reads an unpacked state", () => {
    const verbose = {
      schemaVersion: 3,
      status: "active",
      round: 1,
      cycle: 1,
      activeTurn: null,
      combatants: [
        {
          id: "a",
          name: "A",
          initiative: 4,
          initiativeBonus: 9,
          actionPoints: 2,
          maxActionPoints: 2,
          locations: buildLocations(HUMANOID_PROFILE, 23),
          defeated: false,
        },
      ],
      characters: {},
      knownPlayers: [],
    };
    const back = decodeState(verbose);
    expect(back.combatants).toHaveLength(1);
    expect(back.combatants[0]!.locations).toHaveLength(7);
  });

  it("survives rubbish without throwing", () => {
    expect(decodeState(null).combatants).toEqual([]);
    expect(decodeState("nonsense").combatants).toEqual([]);
    expect(decodeState({ wire: 4, combatants: "not a list" }).combatants).toEqual([]);
  });

  it("skips a packed location that is malformed rather than losing the combatant", () => {
    const packed = encodeState({ ...createEmptyState(), combatants: [jon] });
    (packed.combatants as Record<string, unknown>[])[0]!.l = [["chest", "Chest", 10, 12, 5, 7, 2], "junk"];
    const back = decodeState(packed);
    expect(back.combatants[0]!.locations).toHaveLength(1);
  });
});
