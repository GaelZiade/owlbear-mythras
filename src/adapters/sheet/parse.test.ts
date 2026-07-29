import { describe, expect, it } from "vitest";

import { effectiveInitiativeBonus, effectiveMaxActionPoints } from "../../core/combat";
import { combatantFromSheet, parseSheet, skillValue } from "./parse";
import jonSnow from "./fixtures/jon-snow.json";

const parsed = parseSheet(jonSnow);
const jon = parsed.value!;

describe("reading a character out of the builder", () => {
  it("parses the sample with nothing to report", () => {
    expect(parsed.problems).toEqual([]);
    expect(jon.name).toBe("Jon Snow");
    expect(jon.player).toBe("Juan");
  });

  it("takes the seven Characteristics", () => {
    expect(jon.characteristics).toEqual({
      STR: 15,
      CON: 9,
      SIZ: 16,
      DEX: 11,
      INT: 13,
      POW: 14,
      CHA: 13,
    });
  });

  /**
   * The builder ships its own computed Attributes in `currentValues`. Every one
   * this project derives independently agrees with it, which is the strongest
   * check available on the tables in `characteristics.ts`.
   */
  it("agrees with the builder's own derived Attributes", () => {
    const theirs = (jonSnow as { currentValues: Record<string, number | string> }).currentValues;
    const combatant = combatantFromSheet(jon, "c-jon");

    expect(theirs.init).toBe(12);
    expect(combatant.initiativeBonus).toBe(12);
    expect(theirs.ap).toBe(2);
    expect(combatant.maxActionPoints).toBe(2);
  });

  it("reads the armour worn, by our own location ids", () => {
    expect(jon.armor).toEqual({ chest: 2, abdomen: 1, "left-arm": 1 });
  });

  /** Their key is "abdoment". Matching their spelling is the adapter's whole job. */
  it("matches the builder's spelling of abdomen", () => {
    expect(jon.armor.abdomen).toBe(1);
  });

  it("totals the ENC and turns it into the Initiative penalty", () => {
    expect(jon.armorEnc).toBe(10);
    expect(jon.initiativeModifier).toBe(-2);
  });

  it("leaves the modifier at zero when nothing is worn", () => {
    const naked = parseSheet({ ...(jonSnow as object), equipment: {} }).value!;
    expect(naked.armorEnc).toBe(0);
    expect(naked.initiativeModifier).toBe(0);
  });
});

describe("working out a skill from its formula", () => {
  const C = jon.characteristics;

  it("sums the base Characteristics and adds the bonuses", () => {
    // Athletics: STR 15 + DEX 11, +15 career, +10 extra.
    expect(skillValue({ base: ["str", "dex"], careerBonus: 15, extraBonus: 10 }, C)).toBe(51);
  });

  it("multiplies the base before adding anything", () => {
    // Endurance: CON 9 doubled, +15 career, +15 extra.
    expect(skillValue({ base: ["con"], multiply: 2, careerBonus: 15, extraBonus: 15 }, C)).toBe(48);
  });

  /**
   * The order is not stated anywhere in the format. Customs is INT with add 40
   * and multiply 2: multiplying first gives 66, adding first gives 106, and no
   * starting skill reaches 106.
   */
  it("settles the ambiguous case the only way that is not absurd", () => {
    expect(skillValue({ base: ["int"], add: 40, multiply: 2, extraBonus: 15 }, C)).toBe(81);
  });

  it("reads the character's real skills", () => {
    const byName = Object.fromEntries(jon.skills.map((skill) => [skill.name, skill.value]));
    expect(byName.Athletics).toBe(51);
    expect(byName.Endurance).toBe(48);
    expect(byName.Customs).toBe(81);
    expect(byName.Brawn).toBe(61);
  });

  it("brings in the combat styles, marked apart", () => {
    const guardian = jon.skills.find(({ name }) => name === "Guardian")!;
    // STR 15 + DEX 11, three pools of 15.
    expect(guardian.value).toBe(71);
    expect(guardian.combatStyle).toBe(true);
  });

  it("keeps a trained professional skill, flagged as one", () => {
    // Survival has 15 career points spent on it.
    const survival = jon.skills.find(({ name }) => name === "Survival")!;
    expect(survival.professional).toBe(true);
    expect(survival.value).toBe(38);
    expect(jon.skills.find(({ name }) => name === "Athletics")!.professional).toBe(false);
  });

  /**
   * The builder exports every professional skill in the game on every sheet, at
   * base value with nothing spent. In Mythras an untrained professional skill is
   * one the character does not have, and they were four fifths of what got
   * stored — enough to push a party past the room's metadata limit.
   */
  it("drops professional skills nobody trained", () => {
    expect(jon.skills.find(({ name }) => name === "Lockpicking")).toBeUndefined();
    expect(jon.skills.find(({ name }) => name === "Seduction")).toBeUndefined();
  });

  it("keeps every basic skill, trained or not", () => {
    expect(jon.skills.find(({ name }) => name === "Boating")).toBeDefined();
    expect(jon.skills.find(({ name }) => name === "Sing")).toBeDefined();
  });

  it("keeps combat styles whether or not they look trained", () => {
    expect(jon.skills.find(({ name }) => name === "Guardian")!.combatStyle).toBe(true);
  });

  it("cuts the stored list to what the character actually has", () => {
    expect(jon.skills.length).toBeLessThan(40);
  });

  it("scores an unknown Characteristic as zero rather than throwing", () => {
    expect(skillValue({ base: ["nonsense"], extraBonus: 10 }, C)).toBe(10);
  });
});

describe("the sheet as a combatant", () => {
  const combatant = combatantFromSheet(jon, "c-jon");

  it("uses the book's Hit Points table, not the builder's formula", () => {
    const byId = Object.fromEntries(
      combatant.locations.map((location) => [location.id, location.maxHitPoints]),
    );
    // CON 9 + SIZ 16 = 25.
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

  it("lays the worn armour over the locations", () => {
    const byId = Object.fromEntries(
      combatant.locations.map((location) => [location.id, location.armorPoints]),
    );
    expect(byId).toMatchObject({
      chest: 2,
      abdomen: 1,
      "left-arm": 1,
      "right-arm": 0,
      head: 0,
    });
  });

  it("carries the armour penalty as a modifier, not folded into the base", () => {
    expect(combatant.initiativeBonus).toBe(12);
    expect(combatant.initiativeModifier).toBe(-2);
    expect(effectiveInitiativeBonus(combatant)).toBe(10);
  });

  it("gives Imperative's flat 2 Action Points", () => {
    expect(effectiveMaxActionPoints(combatant)).toBe(2);
  });

  it("arrives unrolled and undamaged", () => {
    expect(combatant.initiative).toBe(0);
    for (const location of combatant.locations) {
      expect(location.hitPoints).toBe(location.maxHitPoints);
    }
  });

  it("keeps the Characteristics so the panel can re-derive later", () => {
    expect(combatant.characteristics).toEqual(jon.characteristics);
  });
});

describe("files that are not characters", () => {
  it("refuses something that is not an object", () => {
    expect(parseSheet("nope").value).toBeNull();
    expect(parseSheet(null).value).toBeNull();
  });

  it("refuses a JSON file with no skills block", () => {
    const { value, problems } = parseSheet({ name: "Someone" });
    expect(value).toBeNull();
    expect(problems[0]).toContain("does not look like a character file");
  });

  it("reports missing Characteristics rather than importing zeroes silently", () => {
    const { value, problems } = parseSheet({ name: "Half", skills: { str: 10, skills: [] } });
    expect(value).not.toBeNull();
    expect(problems.join(" ")).toContain("CON is missing");
    expect(problems.join(" ")).toContain("No skills found");
  });

  it("falls back to a name rather than an empty one", () => {
    expect(parseSheet({ skills: { str: 1, con: 1, siz: 1, dex: 1, int: 1, pow: 1, cha: 1, skills: [{ name: "X", base: ["str"] }] } }).value!.name).toBe("Character");
  });
});
