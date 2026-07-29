import { describe, expect, it } from "vitest";

import {
  damageModifierFor,
  deriveAttributes,
  experienceModifierFor,
  healingRateFor,
  IMPERATIVE_ACTION_POINTS,
  initiativeBonusFor,
  luckPointsFor,
  magicPointsFor,
  type Characteristics,
} from "./characteristics";
import { isEventAllowedForPlayer } from "../adapters/owlbear/protocol";
import { reduce } from "./combat";
import { buildLocations, HUMANOID_PROFILE } from "./locations";
import { hitPointsFor } from "./tables";
import { createEmptyState } from "./types";

/** Anathaym, the worked example the rest of the suite is checked against. */
const ANATHAYM: Characteristics = {
  STR: 12,
  CON: 13,
  SIZ: 10,
  DEX: 16,
  INT: 14,
  POW: 12,
  CHA: 13,
};

describe("Action Points in Imperative", () => {
  /**
   * "Todos los personajes en Mythras Imperativo tienen 2 Puntos de Acción."
   * The core rules band INT + DEX instead; this is the difference that matters
   * most between the two books for this tracker.
   */
  it("are a flat 2 for everyone, not derived", () => {
    expect(IMPERATIVE_ACTION_POINTS).toBe(2);
    expect(deriveAttributes(ANATHAYM).actionPoints).toBe(2);
    expect(deriveAttributes({ ...ANATHAYM, INT: 18, DEX: 18 }).actionPoints).toBe(2);
    expect(deriveAttributes({ ...ANATHAYM, INT: 3, DEX: 3 }).actionPoints).toBe(2);
  });
});

describe("Damage Modifier from STR + SIZ", () => {
  it("reads the book's bands", () => {
    expect(damageModifierFor(5)).toBe("-1d8");
    expect(damageModifierFor(6)).toBe("-1d6");
    expect(damageModifierFor(10)).toBe("-1d6");
    expect(damageModifierFor(11)).toBe("-1d4");
    expect(damageModifierFor(16)).toBe("-1d2");
    expect(damageModifierFor(21)).toBe("+0");
    expect(damageModifierFor(25)).toBe("+0");
    expect(damageModifierFor(26)).toBe("+1d2");
  });

  it("handles the bands that widen past 50", () => {
    expect(damageModifierFor(50)).toBe("+1d10");
    expect(damageModifierFor(51)).toBe("+1d12");
    expect(damageModifierFor(60)).toBe("+1d12");
    expect(damageModifierFor(61)).toBe("+2d6");
    expect(damageModifierFor(80)).toBe("+1d8+1d6");
    expect(damageModifierFor(100)).toBe("+1d10+1d8");
    expect(damageModifierFor(130)).toBe("+2d10+1d4");
  });

  it("gives Anathaym no modifier at STR 12 + SIZ 10", () => {
    expect(damageModifierFor(22)).toBe("+0");
    expect(deriveAttributes(ANATHAYM).damageModifier).toBe("+0");
  });

  /**
   * Past 130 the book says only "Cada 10 puntos: Continúa la progresión". What
   * it continues by is not stated computably, so the last row is held rather
   * than dice being invented.
   */
  it("holds the last row past the printed table rather than inventing dice", () => {
    expect(damageModifierFor(131)).toBe("+2d10+1d4");
    expect(damageModifierFor(400)).toBe("+2d10+1d4");
  });

  it("survives a nonsense total without throwing", () => {
    expect(damageModifierFor(0)).toBe("-1d8");
    expect(damageModifierFor(-5)).toBe("-1d8");
  });
});

describe("the six-point bands", () => {
  it("gives Healing Rate from CON", () => {
    expect(healingRateFor(6)).toBe(1);
    expect(healingRateFor(7)).toBe(2);
    expect(healingRateFor(12)).toBe(2);
    expect(healingRateFor(13)).toBe(3);
    expect(healingRateFor(18)).toBe(3);
    expect(healingRateFor(19)).toBe(4);
    expect(healingRateFor(24)).toBe(4);
  });

  it("gives Luck Points from POW on the same bands", () => {
    expect(luckPointsFor(6)).toBe(1);
    expect(luckPointsFor(12)).toBe(2);
    expect(luckPointsFor(18)).toBe(3);
    expect(luckPointsFor(19)).toBe(4);
  });

  it("gives the Experience Modifier from CHA, two lower", () => {
    expect(experienceModifierFor(6)).toBe(-1);
    expect(experienceModifierFor(7)).toBe(0);
    expect(experienceModifierFor(12)).toBe(0);
    expect(experienceModifierFor(13)).toBe(1);
    expect(experienceModifierFor(18)).toBe(1);
    expect(experienceModifierFor(19)).toBe(2);
  });

  it("does not go below the first band on a ruined characteristic", () => {
    expect(healingRateFor(1)).toBe(1);
    expect(healingRateFor(0)).toBe(1);
    expect(experienceModifierFor(0)).toBe(-1);
  });
});

describe("Magic Points and Initiative Bonus", () => {
  it("gives Magic Points equal to POW", () => {
    expect(magicPointsFor(12)).toBe(12);
    expect(deriveAttributes(ANATHAYM).magicPoints).toBe(12);
  });

  it("averages DEX and INT for the Initiative Bonus", () => {
    expect(initiativeBonusFor(16, 14)).toBe(15);
    expect(initiativeBonusFor(10, 10)).toBe(10);
  });

  it("rounds a half upwards, matching the existing table", () => {
    expect(initiativeBonusFor(13, 14)).toBe(14);
  });
});

describe("deriving everything at once", () => {
  const derived = deriveAttributes(ANATHAYM);

  it("produces the whole Attribute block for Anathaym", () => {
    expect(derived).toEqual({
      actionPoints: 2,
      damageModifier: "+0",
      experienceModifier: 1,
      healingRate: 3,
      initiativeBonus: 15,
      luckPoints: 2,
      magicPoints: 12,
      conPlusSiz: 23,
    });
  });

  /**
   * CON + SIZ is carried through because it is the input to the Hit Points per
   * location table, which is where the two halves of character creation meet.
   */
  it("hands CON + SIZ to the Hit Points table, giving the book's own numbers", () => {
    expect(derived.conPlusSiz).toBe(23);
    expect(hitPointsFor("head", derived.conPlusSiz)).toBe(5);
    expect(hitPointsFor("chest", derived.conPlusSiz)).toBe(7);
    expect(hitPointsFor("abdomen", derived.conPlusSiz)).toBe(6);
    expect(hitPointsFor("arm", derived.conPlusSiz)).toBe(4);
    expect(hitPointsFor("leg", derived.conPlusSiz)).toBe(5);
  });
});

describe("setting Characteristics on a combatant", () => {
  const base = {
    id: "a",
    name: "A",
    initiative: 0,
    initiativeBonus: 0,
    actionPoints: 5,
    maxActionPoints: 5,
    defeated: false,
    locations: buildLocations(HUMANOID_PROFILE, 10),
  };

  function withCharacteristics(characteristics = ANATHAYM, combatant = base) {
    const state = reduce(
      { ...createEmptyState(), combatants: [combatant] },
      { type: "combatant/characteristicsChanged", combatantId: "a", characteristics },
    );
    return state.combatants[0]!;
  }

  it("stores them", () => {
    expect(withCharacteristics().characteristics).toEqual(ANATHAYM);
  });

  it("applies the Initiative Bonus derived from DEX and INT", () => {
    expect(withCharacteristics().initiativeBonus).toBe(15);
  });

  it("sets Action Points to Imperative's flat 2, whatever they were", () => {
    expect(withCharacteristics().maxActionPoints).toBe(2);
    expect(withCharacteristics().actionPoints).toBe(2);
  });

  it("rewrites Hit Points per location from CON + SIZ", () => {
    const locations = withCharacteristics().locations;
    const byId = Object.fromEntries(locations.map((l) => [l.id, l.maxHitPoints]));
    expect(byId).toMatchObject({
      head: 5,
      chest: 7,
      abdomen: 6,
      "right-arm": 4,
      "left-arm": 4,
      "right-leg": 5,
      "left-leg": 5,
    });
  });

  /** Correcting a mistyped SIZ mid-fight must not heal anybody. */
  it("keeps the damage already taken", () => {
    const wounded = {
      ...base,
      locations: base.locations.map((location) =>
        location.id === "chest" ? { ...location, hitPoints: location.maxHitPoints - 3 } : location,
      ),
    };
    const chest = withCharacteristics(ANATHAYM, wounded).locations.find((l) => l.id === "chest")!;
    expect(chest.maxHitPoints).toBe(7);
    expect(chest.hitPoints).toBe(4);
  });

  /**
   * A tail has Hit Points, but not from a table of humanoid parts. Matching is
   * on the name because locations arrive from MEG too, where the same part is
   * spelled differently.
   */
  it("leaves a location it does not recognise alone", () => {
    const beast = {
      ...base,
      locations: [
        { id: "tail", name: "Tail", range: [1, 4] as const, hitPoints: 9, maxHitPoints: 9, armorPoints: 0 },
        { id: "head", name: "Head", range: [5, 20] as const, hitPoints: 2, maxHitPoints: 2, armorPoints: 0 },
      ],
    };
    const locations = withCharacteristics(ANATHAYM, beast).locations;
    expect(locations.find((l) => l.id === "tail")!.maxHitPoints).toBe(9);
    expect(locations.find((l) => l.id === "head")!.maxHitPoints).toBe(5);
  });

  it("matches MEG's spelling of the same parts", () => {
    const imported = {
      ...base,
      locations: [
        { id: "right-leg", name: "Right leg", range: [1, 10] as const, hitPoints: 1, maxHitPoints: 1, armorPoints: 0 },
        { id: "chest", name: "Chest", range: [11, 20] as const, hitPoints: 1, maxHitPoints: 1, armorPoints: 0 },
      ],
    };
    const locations = withCharacteristics(ANATHAYM, imported).locations;
    expect(locations.map((l) => l.maxHitPoints)).toEqual([5, 7]);
  });

  it("lets the owner set them, but not another player", () => {
    const state = {
      ...createEmptyState(),
      combatants: [{ ...base, ownerId: "player-1" }],
    };
    const event = {
      type: "combatant/characteristicsChanged" as const,
      combatantId: "a",
      characteristics: ANATHAYM,
    };
    expect(isEventAllowedForPlayer(event, "player-1", state)).toBe(true);
    expect(isEventAllowedForPlayer(event, "player-2", state)).toBe(false);
  });
});
