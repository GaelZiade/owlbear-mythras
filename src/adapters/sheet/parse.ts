import {
  deriveAttributes,
  type Characteristic,
  type Characteristics,
} from "../../core/characteristics";
import { buildLocations, HUMANOID_PROFILE } from "../../core/locations";
import { initiativePenaltyFor } from "../../core/tables";
import type { Combatant, HitLocation } from "../../core/types";

/**
 * Reading a character out of the online sheet builder the group uses.
 *
 * The format stores *formulas*, not results: a skill knows which Characteristics
 * it is based on and what bonuses were spent on it, and the value is worked out
 * on the way to the screen. So this module computes rather than copies.
 *
 * Its own `currentValues` block was used to check that: every Attribute this
 * project derives independently — Damage Modifier, Experience Modifier, Healing
 * Rate, Initiative Bonus, Luck Points — matches the builder's answer exactly for
 * the sample character. The Hit Points come from the book's table rather than
 * the builder's divide-by-five formula, which agrees at human sizes and is not
 * the rule as printed.
 */

/** A skill or combat style, once its formula has been worked out. */
export interface SheetSkill {
  name: string;
  value: number;
  professional: boolean;
  /** Combat styles roll like skills but are listed apart on the sheet. */
  combatStyle: boolean;
}

export interface SheetCharacter {
  name: string;
  player: string | null;
  characteristics: Characteristics;
  /** Armor Points by our location id, for whatever the character is wearing. */
  armor: Record<string, number>;
  /** Total ENC of worn armor, which is what the Initiative penalty comes from. */
  armorEnc: number;
  /** Negative, or zero when unarmoured. */
  initiativeModifier: number;
  skills: SheetSkill[];
  movementRate: number | null;
  notes: string | null;
}

interface RawSkill {
  name?: unknown;
  base?: unknown;
  professional?: unknown;
  add?: unknown;
  multiply?: unknown;
  cultureBonus?: unknown;
  careerBonus?: unknown;
  extraBonus?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The builder writes Characteristics in lower case, alongside the skill list. */
const CHARACTERISTIC_KEYS: Record<string, Characteristic> = {
  str: "STR",
  con: "CON",
  siz: "SIZ",
  dex: "DEX",
  int: "INT",
  pow: "POW",
  cha: "CHA",
};

/**
 * Armour slots, in the builder's spelling.
 *
 * `abdoment` is theirs, not a typo here. Matching their key rather than
 * correcting it is the whole job of an adapter.
 */
const ARMOR_SLOTS: Record<string, string> = {
  head: "head",
  chest: "chest",
  abdoment: "abdomen",
  abdomen: "abdomen",
  leftArm: "left-arm",
  rightArm: "right-arm",
  leftLeg: "left-leg",
  rightLeg: "right-leg",
};

/**
 * A skill's percentage from its formula.
 *
 * `base` names the Characteristics summed; `multiply` scales that sum, never the
 * bonuses; `add` and the three bonus pools are flat. The order matters and is
 * not stated anywhere — it was settled by arithmetic. *Customs* is INT with
 * `add: 40` and `multiply: 2`: at 13 INT, multiplying first gives 66, and adding
 * first gives 106, which no starting skill reaches.
 */
export function skillValue(raw: RawSkill, characteristics: Characteristics): number {
  const base = Array.isArray(raw.base)
    ? raw.base.reduce<number>((total, key) => {
        const mapped = typeof key === "string" ? CHARACTERISTIC_KEYS[key] : undefined;
        return total + (mapped ? characteristics[mapped] : 0);
      }, 0)
    : 0;

  return (
    base * num(raw.multiply, 1) +
    num(raw.add) +
    num(raw.cultureBonus) +
    num(raw.careerBonus) +
    num(raw.extraBonus)
  );
}

export interface SheetParseResult {
  value: SheetCharacter | null;
  problems: string[];
}

export function parseSheet(payload: unknown): SheetParseResult {
  if (!isRecord(payload)) return { value: null, problems: ["That is not a character file."] };

  const skillsBlock = isRecord(payload.skills) ? payload.skills : null;
  if (!skillsBlock) {
    return { value: null, problems: ["No skills block: this does not look like a character file."] };
  }

  const problems: string[] = [];
  const characteristics = {} as Characteristics;
  for (const [key, name] of Object.entries(CHARACTERISTIC_KEYS)) {
    const value = num(skillsBlock[key], 0);
    if (value <= 0) problems.push(`${name} is missing or zero.`);
    characteristics[name] = value;
  }

  const equipment = isRecord(payload.equipment) ? payload.equipment : {};
  const armor: Record<string, number> = {};
  let armorEnc = 0;
  for (const [slot, locationId] of Object.entries(ARMOR_SLOTS)) {
    const worn = equipment[slot];
    if (!isRecord(worn)) continue;
    const points = num(worn.ap);
    if (points > 0) armor[locationId] = points;
    armorEnc += num(worn.enc);
  }

  const skills: SheetSkill[] = [];
  const collect = (list: unknown, combatStyle: boolean) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      if (!isRecord(raw) || typeof raw.name !== "string") continue;
      skills.push({
        name: raw.name,
        value: skillValue(raw, characteristics),
        professional: raw.professional === true,
        combatStyle,
      });
    }
  };
  collect(skillsBlock.skills, false);
  collect(skillsBlock.specialized, false);
  collect(skillsBlock.combatstyles, true);

  if (skills.length === 0) problems.push("No skills found.");

  const name = typeof payload.name === "string" && payload.name.trim() !== "" ? payload.name : "Character";

  return {
    value: {
      name,
      player: typeof payload.player === "string" && payload.player !== "" ? payload.player : null,
      characteristics,
      armor,
      armorEnc,
      // Negative because it is a penalty; zero when nothing is worn.
      initiativeModifier: armorEnc > 0 ? -initiativePenaltyFor(armorEnc) : 0,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      movementRate: typeof payload.movementRate === "number" ? payload.movementRate : null,
      notes: typeof payload.concept === "string" && payload.concept !== "" ? payload.concept : null,
    },
    problems,
  };
}

/**
 * A parsed sheet as a combatant.
 *
 * Hit Points come from the book's table via the Characteristics, not from the
 * builder's own per-location formula: the two agree at human sizes, and the
 * table is the rule. Armour is laid over the top from what is actually worn.
 *
 * Initiative is left unrolled for the same reason as a MEG import — rolling
 * belongs to the GM's button, and a character who arrived pre-rolled would jump
 * an order nobody else has rolled for yet.
 */
export function combatantFromSheet(sheet: SheetCharacter, id: string): Combatant {
  const derived = deriveAttributes(sheet.characteristics);
  const locations: HitLocation[] = buildLocations(HUMANOID_PROFILE, derived.conPlusSiz).map(
    (location) => ({ ...location, armorPoints: sheet.armor[location.id] ?? 0 }),
  );

  return {
    id,
    name: sheet.name,
    initiative: 0,
    initiativeBonus: derived.initiativeBonus,
    initiativeModifier: sheet.initiativeModifier,
    actionPoints: derived.actionPoints,
    maxActionPoints: derived.actionPoints,
    characteristics: sheet.characteristics,
    skills: sheet.skills,
    locations,
    defeated: false,
    ...(sheet.notes ? { notes: sheet.notes } : {}),
  };
}
