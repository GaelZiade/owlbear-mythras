import { describe, expect, it } from "vitest";

import { woundLevel } from "../../core/wounds";
import creatureFixture from "./fixtures/creature.json";
import indexFixture from "./fixtures/index-slice.json";
import {
  combatantFromCreature,
  parseCreatures,
  parseMovement,
  parseIndex,
  parseRange,
  parseStrikeRank,
  searchIndex,
} from "./parse";

/** The catalogue slice, parsed once — every search test runs against real entries. */
const catalogue = parseIndex(indexFixture).value!;

/** Vinkolt, the Dragon Queen acolyte, exactly as the endpoint returned him. */
const vinkolt = parseCreatures(creatureFixture).value![0]!;

describe("reading the MEG index", () => {
  it("keeps every entry in the real slice", () => {
    const { value, problems } = parseIndex(indexFixture);
    expect(problems).toEqual([]);
    expect(value).toHaveLength(6);
  });

  it("reads the fields the search needs", () => {
    const kobold = catalogue.find(({ id }) => id === 42)!;
    expect(kobold).toEqual({
      id: 42,
      name: "Kobold warrior",
      race: "Human",
      rank: 1,
      owner: "skoll",
      tags: ["Fantasy"],
      notes: "",
    });
  });

  it("refuses a payload that is not a list", () => {
    expect(parseIndex({ entries: [] }).value).toBeNull();
  });

  it("skips a malformed entry instead of losing the rest", () => {
    const { value, problems } = parseIndex([{ id: 1, name: "Fine" }, { name: "No id" }]);
    expect(value).toHaveLength(1);
    expect(problems).toHaveLength(1);
  });
});

describe("searching the catalogue", () => {
  it("finds by name", () => {
    expect(searchIndex(catalogue, "kobold").map(({ name }) => name)).toEqual(["Kobold warrior"]);
  });

  it("is case insensitive and matches partial words", () => {
    expect(searchIndex(catalogue, "ZOMB").map(({ id }) => id)).toEqual([125]);
  });

  it("puts a name starting with the query ahead of one merely containing it", () => {
    const entries = parseIndex([
      { id: 1, name: "Zombie, kobold warrior", race: "", rank: 1, owner: "", tags: [], notes: "" },
      { id: 2, name: "Kobold warrior", race: "", rank: 1, owner: "", tags: [], notes: "" },
    ]).value!;
    expect(searchIndex(entries, "kob").map(({ id }) => id)).toEqual([2, 1]);
  });

  it("falls back to race and tags when no name matches", () => {
    expect(searchIndex(catalogue, "goblin").map(({ id }) => id)).toEqual([5297]);
    expect(searchIndex(catalogue, "undead").map(({ id }) => id)).toEqual([125]);
  });

  it("returns nothing for an empty query rather than the whole catalogue", () => {
    expect(searchIndex(catalogue, "   ")).toEqual([]);
  });

  it("matches names with non-English characters", () => {
    expect(searchIndex(catalogue, "contadino").map(({ id }) => id)).toEqual([4363]);
  });
});

describe("hit location ranges", () => {
  it("reads the zero-padded form MEG uses", () => {
    expect(parseRange("01-03")).toEqual([1, 3]);
    expect(parseRange("19-20")).toEqual([19, 20]);
  });

  it("reads a single value as a range of one", () => {
    expect(parseRange("20")).toEqual([20, 20]);
  });

  it("sorts a reversed pair rather than rejecting it", () => {
    expect(parseRange("07-04")).toEqual([4, 7]);
  });

  it("rejects what it cannot read", () => {
    expect(parseRange("")).toBeNull();
    expect(parseRange("head")).toBeNull();
  });
});

describe("the Initiative Bonus out of strike_rank", () => {
  /** "10(13-3)" is 13 base less 3 for armour; the leading number is the answer. */
  it("takes the total, not the working", () => {
    expect(parseStrikeRank("10(13-3)")).toBe(10);
    expect(parseStrikeRank("11(13-2)")).toBe(11);
  });

  it("reads a bare number", () => {
    expect(parseStrikeRank("11")).toBe(11);
  });

  it("rejects what it cannot read", () => {
    expect(parseStrikeRank("")).toBeNull();
    expect(parseStrikeRank("unknown")).toBeNull();
  });
});

describe("Vinkolt, imported", () => {
  const { value: combatant, problems } = combatantFromCreature(vinkolt, "c-vinkolt");

  it("imports cleanly, with nothing to report", () => {
    expect(problems).toEqual([]);
    expect(combatant).not.toBeNull();
  });

  it("takes his name and his Action Points", () => {
    expect(combatant!.name).toBe("Vinkolt (Acolyte, Dragon Queen 1)");
    expect(combatant!.maxActionPoints).toBe(3);
    expect(combatant!.actionPoints).toBe(3);
  });

  it("takes the Initiative Bonus with the armour penalty already applied", () => {
    expect(combatant!.initiativeBonus).toBe(10);
  });

  it("leaves initiative unrolled, so he does not jump the order", () => {
    expect(combatant!.initiative).toBe(0);
  });

  it("carries all seven locations with their ranges, Hit Points and armour", () => {
    expect(combatant!.locations).toHaveLength(7);
    expect(combatant!.locations[0]).toEqual({
      id: "right-leg",
      name: "Right leg",
      range: [1, 3],
      hitPoints: 6,
      maxHitPoints: 6,
      armorPoints: 2,
    });
    expect(combatant!.locations.at(-1)).toEqual({
      id: "head",
      name: "Head",
      range: [19, 20],
      hitPoints: 6,
      maxHitPoints: 6,
      armorPoints: 5,
    });
  });

  it("arrives undamaged, so every location reads as unharmed", () => {
    for (const location of combatant!.locations) {
      expect(woundLevel(location)).toBe("unharmed");
    }
  });

  it("keeps the notes, where half the creature's mechanics live", () => {
    expect(combatant!.notes).toContain("Basic cultist of the Dragon Queen.");
  });

  it("covers the whole d20 with no gap and no overlap", () => {
    const covered = combatant!.locations.flatMap(({ range }) =>
      Array.from({ length: range[1] - range[0] + 1 }, (_, step) => range[0] + step),
    );
    expect([...covered].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });
});

describe("importing a creature that is not quite right", () => {
  function creature(overrides: Record<string, unknown> = {}) {
    return parseCreatures([
      {
        name: "Test Beast",
        hit_locations: [{ name: "Body", range: "01-20", hp: 5, ap: 1 }],
        attributes: { action_points: 2, strike_rank: "9(11-2)" },
        ...overrides,
      },
    ]).value![0]!;
  }

  it("drops a location whose range cannot be read, and says which", () => {
    const broken = creature({
      hit_locations: [
        { name: "Body", range: "01-10", hp: 5, ap: 1 },
        { name: "Tail", range: "??", hp: 3, ap: 0 },
      ],
    });
    const { value, problems } = combatantFromCreature(broken, "c-1");
    expect(value!.locations).toHaveLength(1);
    expect(problems[0]).toContain("Tail");
  });

  it("refuses a creature left with no locations at all", () => {
    const { value, problems } = combatantFromCreature(creature({ hit_locations: [] }), "c-1");
    expect(value).toBeNull();
    expect(problems.at(-1)).toContain("no usable hit locations");
  });

  it("falls back when the Initiative Bonus is missing, and says so", () => {
    const { value, problems } = combatantFromCreature(creature({ attributes: {} }), "c-1");
    expect(value!.initiativeBonus).toBe(0);
    expect(problems.join(" ")).toContain("Initiative Bonus");
  });

  it("falls back to one Action Point rather than zero, which cannot act", () => {
    const { value } = combatantFromCreature(
      creature({ attributes: { strike_rank: "9" } }),
      "c-1",
    );
    expect(value!.maxActionPoints).toBe(1);
  });

  it("keeps a location with 0 Hit Points usable by flooring it at 1", () => {
    const broken = creature({ hit_locations: [{ name: "Body", range: "01-20", hp: 0, ap: 0 }] });
    expect(combatantFromCreature(broken, "c-1").value!.locations[0]!.maxHitPoints).toBe(1);
  });

  it("gives repeated location names distinct ids", () => {
    const many = creature({
      hit_locations: [
        { name: "Leg", range: "01-05", hp: 4, ap: 1 },
        { name: "Leg", range: "06-10", hp: 4, ap: 1 },
        { name: "Leg", range: "11-20", hp: 4, ap: 1 },
      ],
    });
    const ids = combatantFromCreature(many, "c-1").value!.locations.map(({ id }) => id);
    expect(ids).toEqual(["leg", "leg-2", "leg-3"]);
    expect(new Set(ids).size).toBe(3);
  });

  it("omits notes entirely when MEG sends an empty string", () => {
    const quiet = creature({ notes: "   " });
    expect(combatantFromCreature(quiet, "c-1").value!.notes).toBeUndefined();
  });
});

describe("payloads that are not creatures at all", () => {
  it("reports an empty list rather than importing nothing silently", () => {
    expect(parseCreatures([]).problems).toEqual(["No creatures in the payload."]);
  });

  it("skips an entry with no name", () => {
    const { value, problems } = parseCreatures([{ hit_locations: [] }]);
    expect(value).toEqual([]);
    expect(problems[0]).toContain("no name");
  });

  it("accepts a bare object as well as a list, since amount=1 could return either", () => {
    const { value } = parseCreatures({
      name: "Lone",
      hit_locations: [{ name: "Body", range: "01-20", hp: 4, ap: 0 }],
      attributes: { action_points: 2, strike_rank: "8" },
    });
    expect(value).toHaveLength(1);
  });
});

describe("a creature's own skills", () => {
  it("reads MEG's array of single-key objects", () => {
    const byName = Object.fromEntries(vinkolt.skills.map((s) => [s.name, s.value]));
    expect(byName.Athletics).toBe(46);
    expect(byName.Endurance).toBe(65);
    expect(byName.Willpower).toBe(64);
  });

  it("brings the combat styles across, flagged", () => {
    const style = vinkolt.skills.find(({ name }) => name === "Dragon Queen Raider")!;
    expect(style.value).toBe(49);
    expect(style.combatStyle).toBe(true);
  });

  it("puts them on the combatant so the roll dialog can see them", () => {
    const { value } = combatantFromCreature(vinkolt, "c-1");
    expect(value!.skills).toBeDefined();
    expect(value!.skills!.length).toBe(vinkolt.skills.length);
    expect(value!.skills!.some(({ combatStyle }) => combatStyle)).toBe(true);
  });

  it("leaves skills off entirely when a creature has none", () => {
    const bare = parseCreatures([
      {
        name: "Blank",
        hit_locations: [{ name: "Body", range: "01-20", hp: 4, ap: 0 }],
        attributes: { action_points: 2, strike_rank: "8" },
      },
    ]).value![0]!;
    expect(bare.skills).toEqual([]);
    expect(combatantFromCreature(bare, "c-1").value!.skills).toBeUndefined();
  });

  it("ignores a skill whose value is not a number", () => {
    const odd = parseCreatures([
      {
        name: "Odd",
        hit_locations: [{ name: "Body", range: "01-20", hp: 4, ap: 0 }],
        attributes: {},
        skills: [{ Athletics: 40 }, { Broken: "lots" }],
      },
    ]).value![0]!;
    expect(odd.skills).toEqual([{ name: "Athletics", value: 40, combatStyle: false }]);
  });
});

describe("Magic Points", () => {
  it("imports the pool MEG prints, rather than deriving one", () => {
    const { value } = combatantFromCreature(vinkolt, "c-1");
    expect(value!.maxMagicPoints).toBe(15);
    // No Characteristics, so nothing re-derives over the statblock.
    expect(value!.characteristics).toBeUndefined();
  });
});

describe("weapons, spells and movement", () => {
  const { value } = combatantFromCreature(vinkolt, "c-1");

  /**
   * MEG files weapons under the combat style that wields them. The style is
   * already imported as a skill; this is the kit that style swings.
   */
  it("flattens the weapons out of the combat styles", () => {
    expect(value!.weapons?.map((weapon) => weapon.name)).toEqual([
      "Dagger",
      "Shortspear",
      "Buckler Shield",
    ]);
  });

  it("keeps damage as printed, and Hit Points as a resource", () => {
    const spear = value!.weapons!.find(({ name }) => name === "Shortspear")!;
    expect(spear.damage).toBe("1d8+1");
    expect(spear.size).toBe("M");
    expect(spear.reach).toBe("L");
    expect(spear.armorPoints).toBe(4);
    // Starts whole; parrying is what moves it.
    expect(spear.hitPoints).toBe(5);
    expect(spear.maxHitPoints).toBe(5);
    expect(spear.effects).toBe("Impale");
  });

  it("imports every spell list, tagged with its tradition", () => {
    const folk = value!.spells!.filter((spell) => spell.tradition === "Folk");
    const theism = value!.spells!.filter((spell) => spell.tradition === "Theism");
    expect(folk.map((spell) => spell.name)).toContain("Dragon Mask");
    expect(folk).toHaveLength(8);
    expect(theism).toHaveLength(5);
    // Empty lists contribute nothing rather than an empty tradition.
    expect(value!.spells!.some((spell) => spell.tradition === "Sorcery")).toBe(false);
  });

  it("takes the leading number of the movement string", () => {
    expect(value!.movementRate).toBe(6);
    expect(parseMovement("6")).toBe(6);
    // Flying creatures carry a note beside the walking rate.
    expect(parseMovement("6 (12 flying)")).toBe(6);
    expect(parseMovement(undefined)).toBeNull();
    expect(parseMovement("varies")).toBeNull();
  });
});
