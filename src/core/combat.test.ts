import { describe, expect, it } from "vitest";

import { currentTurn, reduce, turnStatus, type CombatEvent } from "./combat";
import { rollInitiative } from "./dice";
import { buildLocations, HUMANOID_PROFILE, locationForRoll } from "./locations";
import { actionPointsFor, hitPointsFor, initiativeBonusFor, initiativePenaltyFor } from "./tables";
import { createEmptyState, type Combatant, type CombatState } from "./types";
import { applyDamage, previewDamage, woundLevel, worstWound } from "./wounds";

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

function names(combatants: Combatant[]): string[] {
  return combatants.map((combatant) => combatant.name);
}

function find(state: CombatState, id: string): Combatant {
  const combatant = state.combatants.find((entry) => entry.id === id);
  if (!combatant) throw new Error(`No combatant ${id}`);
  return combatant;
}

describe("derived attribute tables", () => {
  it("gives Anathaym 3 Action Points from INT 14 + DEX 16", () => {
    expect(actionPointsFor(30)).toBe(3);
  });

  it("follows the Action Points bands", () => {
    expect(actionPointsFor(12)).toBe(1);
    expect(actionPointsFor(13)).toBe(2);
    expect(actionPointsFor(24)).toBe(2);
    expect(actionPointsFor(25)).toBe(3);
    expect(actionPointsFor(36)).toBe(3);
    expect(actionPointsFor(37)).toBe(4);
  });

  it("gives Anathaym her Hit Points from CON 13 + SIZ 10", () => {
    expect(hitPointsFor("head", 23)).toBe(5);
    expect(hitPointsFor("leg", 23)).toBe(5);
    expect(hitPointsFor("chest", 23)).toBe(7);
    expect(hitPointsFor("abdomen", 23)).toBe(6);
    expect(hitPointsFor("arm", 23)).toBe(4);
  });

  it("extends the Hit Points table past 40 at +1 per 5 points", () => {
    expect(hitPointsFor("chest", 40)).toBe(10);
    expect(hitPointsFor("chest", 45)).toBe(11);
  });

  it("averages INT and DEX for the Initiative Bonus", () => {
    expect(initiativeBonusFor(14, 16)).toBe(15);
  });

  it("matches the book's hoplite panoply penalty: 7 locations at ENC 4 is 6", () => {
    expect(initiativePenaltyFor(7 * 4)).toBe(6);
  });

  it("rolls initiative as 1d10 plus the bonus", () => {
    const alwaysMax = () => 0.99;
    const alwaysMin = () => 0;
    expect(rollInitiative(15, alwaysMax)).toBe(25);
    expect(rollInitiative(15, alwaysMin)).toBe(16);
  });
});

describe("hit locations", () => {
  it("maps a d20 roll to the humanoid location", () => {
    const locations = buildLocations(HUMANOID_PROFILE, 23);
    expect(locationForRoll(locations, 1)?.id).toBe("right-leg");
    expect(locationForRoll(locations, 9)?.id).toBe("abdomen");
    expect(locationForRoll(locations, 12)?.id).toBe("chest");
    expect(locationForRoll(locations, 20)?.id).toBe("head");
  });

  it("covers all twenty faces with no gaps or overlaps", () => {
    const locations = buildLocations(HUMANOID_PROFILE, 23);
    for (let roll = 1; roll <= 20; roll += 1) {
      const matches = locations.filter(({ range }) => roll >= range[0] && roll <= range[1]);
      expect(matches).toHaveLength(1);
    }
  });
});

describe("wounds", () => {
  const chest = {
    id: "chest",
    name: "Chest",
    range: [10, 12] as const,
    hitPoints: 7,
    maxHitPoints: 7,
    armorPoints: 0,
  };

  it("derives the level from remaining Hit Points", () => {
    expect(woundLevel(chest)).toBe("unharmed");
    expect(woundLevel({ ...chest, hitPoints: 3 })).toBe("minor");
    expect(woundLevel({ ...chest, hitPoints: 0 })).toBe("serious");
    expect(woundLevel({ ...chest, hitPoints: -6 })).toBe("serious");
    expect(woundLevel({ ...chest, hitPoints: -7 })).toBe("major");
  });

  it("subtracts Armor Points before applying damage", () => {
    const armored = { ...chest, armorPoints: 4 };
    expect(applyDamage(armored, 6).hitPoints).toBe(5);
    expect(applyDamage(armored, 3).hitPoints).toBe(7);
    expect(applyDamage(armored, 6, { ignoreArmor: true }).hitPoints).toBe(1);
  });

  it("previews a hit without applying it", () => {
    const armored = { ...chest, armorPoints: 4 };
    const preview = previewDamage(armored, 10);

    expect(preview.absorbed).toBe(4);
    expect(preview.mitigated).toBe(6);
    expect(preview.hitPointsAfter).toBe(1);
    expect(preview.woundAfter).toBe("minor");
    expect(armored.hitPoints).toBe(7);
  });

  it("previews the wound a killing blow would cause", () => {
    expect(previewDamage(chest, 14).woundAfter).toBe("major");
    expect(previewDamage(chest, 8).woundAfter).toBe("serious");
  });

  it("reports the combatant's worst wound", () => {
    const locations = buildLocations(HUMANOID_PROFILE, 23);
    expect(worstWound(locations)).toBe("unharmed");

    const wounded = locations.map((entry) =>
      entry.id === "left-arm" ? { ...entry, hitPoints: -1 } : entry,
    );
    expect(worstWound(wounded)).toBe("serious");
  });
});

describe("combat engine", () => {
  const base = play(
    createEmptyState(),
    added(
      makeCombatant({ id: "swift", initiative: 18 }),
      makeCombatant({ id: "middle", initiative: 12 }),
      makeCombatant({ id: "slow", initiative: 7 }),
    ),
  );

  it("adds a whole group in one event, so a batch is one write and one undo", () => {
    expect(base.combatants).toHaveLength(3);
    expect(reduce(base, added()).combatants).toHaveLength(3);
  });

  it("starts on Round 1, Cycle 1, with the highest initiative", () => {
    const state = play(base, { type: "combat/started" });
    expect(state.round).toBe(1);
    expect(state.cycle).toBe(1);
    expect(names(currentTurn(state))).toEqual(["swift"]);
  });

  it("counts down the initiatives within a Cycle", () => {
    let state = play(base, { type: "combat/started" });
    expect(names(currentTurn(state))).toEqual(["swift"]);

    state = reduce(state, { type: "turn/advanced" });
    expect(names(currentTurn(state))).toEqual(["middle"]);

    state = reduce(state, { type: "turn/advanced" });
    expect(names(currentTurn(state))).toEqual(["slow"]);
  });

  it("gives tied initiatives the turn simultaneously", () => {
    const state = play(
      base,
      added(makeCombatant({ id: "twin", initiative: 12 })),
      { type: "combat/started" },
      { type: "turn/advanced" },
    );
    expect(names(currentTurn(state)).sort()).toEqual(["middle", "twin"]);
  });

  it("skips defeated combatants", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "combatant/defeatedToggled", combatantId: "middle" },
      { type: "turn/advanced" },
    );
    expect(names(currentTurn(state))).toEqual(["slow"]);
  });

  it("brings a combatant back once undefeated", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "combatant/defeatedToggled", combatantId: "middle" },
      { type: "combatant/defeatedToggled", combatantId: "middle" },
      { type: "turn/advanced" },
    );
    expect(names(currentTurn(state))).toEqual(["middle"]);
  });

  it("skips anyone out of Action Points, including in the first Cycle", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "actionPoints/changed", combatantId: "middle", delta: -2 },
      { type: "turn/advanced" },
    );
    expect(state.cycle).toBe(1);
    expect(names(currentTurn(state))).toEqual(["slow"]);
  });

  it("keeps the turn marker on whoever spends their last Action Point", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "actionPoints/changed", combatantId: "swift", delta: -2 },
    );

    expect(names(currentTurn(state))).toEqual(["swift"]);
    expect(turnStatus(state, find(state, "swift"))).toBe("active");
  });

  it("reports where each combatant stands in the Cycle", () => {
    const state = play(base, { type: "combat/started" }, { type: "turn/advanced" });

    expect(turnStatus(state, find(state, "swift"))).toBe("acted");
    expect(turnStatus(state, find(state, "middle"))).toBe("active");
    expect(turnStatus(state, find(state, "slow"))).toBe("pending");

    const withSpent = reduce(state, {
      type: "actionPoints/changed",
      combatantId: "slow",
      delta: -2,
    });
    expect(turnStatus(withSpent, find(withSpent, "slow"))).toBe("out");
  });

  it("opens a new Cycle from the top when the countdown runs out", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "turn/advanced" },
      { type: "turn/advanced" },
      { type: "turn/advanced" },
    );

    expect(state.cycle).toBe(2);
    expect(state.round).toBe(1);
    expect(names(currentTurn(state))).toEqual(["swift"]);
  });

  it("ends the Round and restores Action Points once nobody has any", () => {
    const state = play(
      base,
      { type: "combat/started" },
      { type: "actionPoints/changed", combatantId: "swift", delta: -2 },
      { type: "actionPoints/changed", combatantId: "middle", delta: -2 },
      { type: "actionPoints/changed", combatantId: "slow", delta: -2 },
      { type: "turn/advanced" },
    );

    expect(state.round).toBe(2);
    expect(state.cycle).toBe(1);
    expect(state.combatants.map((combatant) => combatant.actionPoints)).toEqual([2, 2, 2]);
    expect(names(currentTurn(state))).toEqual(["swift"]);
  });

  it("keeps Action Points within zero and the maximum", () => {
    const state = play(
      base,
      { type: "actionPoints/changed", combatantId: "swift", delta: -99 },
      { type: "actionPoints/changed", combatantId: "middle", delta: +99 },
    );
    expect(find(state, "swift").actionPoints).toBe(0);
    expect(find(state, "middle").actionPoints).toBe(2);
  });

  it("trims current Action Points when the maximum drops", () => {
    const state = play(base, {
      type: "combatant/actionPointsMaxChanged",
      combatantId: "swift",
      maxActionPoints: 1,
    });
    expect(find(state, "swift").maxActionPoints).toBe(1);
    expect(find(state, "swift").actionPoints).toBe(1);
  });

  it("assigns and clears the controlling player", () => {
    const assigned = play(base, {
      type: "combatant/ownerChanged",
      combatantId: "swift",
      ownerId: "player-1",
    });
    expect(find(assigned, "swift").ownerId).toBe("player-1");

    const cleared = reduce(assigned, {
      type: "combatant/ownerChanged",
      combatantId: "swift",
      ownerId: undefined,
    });
    expect("ownerId" in find(cleared, "swift")).toBe(false);
  });

  /**
   * The Saga of Anathaym, Mythras core rules, Combat chapter.
   *
   * Three centaurs with better initiative each spend an Action Point to shoot
   * her. Anathaym parries all three arrows, which burns her three Action Points
   * reactively. In the second Cycle the centaurs spend their last point
   * reloading, and the Round ends because nobody has any points left.
   *
   * One documented departure: the book gives Anathaym a Turn she cannot use,
   * while the tracker skips her outright. See `canAct`.
   */
  it("replays the Anathaym and the three centaurs example", () => {
    const centaurs = ["centaur-1", "centaur-2", "centaur-3"];
    let state = play(
      createEmptyState(),
      added(
        makeCombatant({ id: "centaur-1", initiative: 20 }),
        makeCombatant({ id: "centaur-2", initiative: 19 }),
        makeCombatant({ id: "centaur-3", initiative: 18 }),
        makeCombatant({
          id: "anathaym",
          initiative: 15,
          actionPoints: 3,
          maxActionPoints: 3,
        }),
      ),
      { type: "combat/started" },
    );

    // Cycle 1: each centaur shoots and Anathaym parries, a point per arrow.
    for (const centaur of centaurs) {
      expect(names(currentTurn(state))).toEqual([centaur]);
      state = play(
        state,
        { type: "actionPoints/changed", combatantId: centaur, delta: -1 },
        { type: "actionPoints/changed", combatantId: "anathaym", delta: -1 },
        { type: "turn/advanced" },
      );
    }

    // Out of Action Points, she is skipped and Cycle 2 opens straight away.
    expect(find(state, "anathaym").actionPoints).toBe(0);
    expect(state.cycle).toBe(2);
    expect(state.round).toBe(1);

    // Cycle 2: the centaurs reload with their last point.
    for (const centaur of centaurs) {
      expect(names(currentTurn(state))).toEqual([centaur]);
      state = play(
        state,
        { type: "actionPoints/changed", combatantId: centaur, delta: -1 },
        { type: "turn/advanced" },
      );
    }

    // Nobody has points left: the next Round starts with everyone restored.
    expect(state.round).toBe(2);
    expect(state.cycle).toBe(1);
    expect(names(currentTurn(state))).toEqual(["centaur-1"]);
    expect(find(state, "anathaym").actionPoints).toBe(3);
  });
});
