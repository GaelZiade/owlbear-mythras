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

describe("weapons, spells and movement from the builder", () => {
  const combatant = combatantFromSheet(jon, "c-jon");

  it("imports the weapon with its grip, size, reach and Hit Points", () => {
    const rapier = combatant.weapons![0]!;
    expect(rapier.name).toBe("Rapier");
    expect(rapier.damage).toBe("1d8");
    expect(rapier.size).toBe("M");
    expect(rapier.reach).toBe("L");
    expect(rapier.armorPoints).toBe(5);
    expect(rapier.hitPoints).toBe(8);
    expect(rapier.maxHitPoints).toBe(8);
  });

  /**
   * The builder writes the Special Effects a weapon grants space-separated, and
   * one of them is two words. Splitting would invent an effect called Street.
   */
  it("keeps the effects string whole rather than splitting it", () => {
    expect(combatant.weapons![0]!.effects).toBe("Impale Street Brawler");
  });

  it("carries the Movement Rate the sheet states", () => {
    expect(combatant.movementRate).toBe(6);
  });

  /** Jon knows no magic, and an empty list is absent rather than empty. */
  it("leaves spells off a character with none", () => {
    expect(combatant.spells).toBeUndefined();
  });

  it("reads each tradition's list, including a Path's three", () => {
    const { value } = parseSheet({
      ...jonSnow,
      magic: {
        folk: ["Bladesharp", "Heal"],
        miracles: [{ name: "Shield" }],
        sorcery: [],
        path: { path: "Way of Stone", augmentations: ["Stoneskin"], invocations: [], enhancements: [] },
      },
    });
    expect(value!.spells).toEqual([
      { name: "Bladesharp", tradition: "Folk" },
      { name: "Heal", tradition: "Folk" },
      { name: "Shield", tradition: "Theism" },
      { name: "Stoneskin", tradition: "Mysticism" },
    ]);
  });
});

describe("Passions", () => {
  it("works the value out of the builder's sentence", () => {
    // "30% plus Character's POW+INT", with POW 14 and INT 13.
    expect(jon.passions).toEqual([{ name: "Loyalty to the Knight's Watch", value: 57 }]);
  });

  /**
   * The trap this nearly walked into: a case-insensitive search for the
   * Characteristics finds CHA inside "Character's", which would add CHA to
   * every Passion on every sheet and look plausible enough to go unnoticed.
   */
  it("does not find CHA inside the word Character's", () => {
    const { value } = parseSheet({
      ...jonSnow,
      passions: [{ passion: "Fear (Wights)", modifier: "20% plus Character's POW+INT" }],
    });
    // POW 14 + INT 13 + 20 = 47. With CHA 13 wrongly added it would be 60.
    expect(value!.passions[0]!.value).toBe(47);
  });

  it("doubles a single Characteristic where the table says x2", () => {
    const { value } = parseSheet({
      ...jonSnow,
      passions: [{ passion: "Hate (Wildlings)", modifier: "40% plus Character's POW x2" }],
    });
    expect(value!.passions[0]!.value).toBe(68); // POW 14 doubled, plus 40
  });

  it("keeps a Passion it cannot value, and says so", () => {
    const { value, problems } = parseSheet({
      ...jonSnow,
      passions: [{ passion: "Desire (Nothing in particular)", modifier: "who knows" }],
    });
    expect(value!.passions).toEqual([{ name: "Desire (Nothing in particular)", value: 0 }]);
    expect(problems.some((problem) => problem.includes("Desire"))).toBe(true);
  });

  it("leaves passions off a character with none", () => {
    const { passions: _none, ...withoutPassions } = jonSnow as Record<string, unknown>;
    const { value } = parseSheet(withoutPassions);
    expect(combatantFromSheet(value!, "c-1").passions).toBeUndefined();
  });
});
