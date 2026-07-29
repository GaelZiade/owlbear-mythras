import type { Combatant, HitLocation } from "../../core/types";

/**
 * Reading Mythras Enemy Generator payloads.
 *
 * Two endpoints, two shapes. `index_json/` is the catalogue the search box runs
 * over; `generate_enemies_json/` returns rolled creatures, always as an array
 * because it takes an `amount`.
 *
 * Everything here is defensive. The endpoints are undocumented and unversioned
 * (DECISIONS §5), so a field going missing must degrade the import rather than
 * throw somewhere up in React. Anything unparseable is reported, not guessed at.
 *
 * Skills and combat styles are kept, as final percentages. They were dropped on
 * the first pass as "not modelled by the engine", which was true and beside the
 * point: without them a GM cannot roll the creature they have just imported.
 *
 * What is still dropped: characteristics, spells, cults and spirits. MEG's own
 * numbers are final, so we never re-derive anything from STR/CON via §1.4.
 * `notes` is kept because for many entries the mechanics live there ("Rabble",
 * "***Total 5 Hitpoints***", ability descriptions) rather than in the statblock.
 */

export interface MegIndexEntry {
  id: number;
  name: string;
  race: string;
  rank: number;
  owner: string;
  tags: string[];
  notes: string;
}

export interface MegCreature {
  name: string;
  hit_locations: { name: string; range: string; hp: number; ap: number }[];
  attributes: { action_points?: number; strike_rank?: string; movement?: string };
  notes?: string;
  /** Percentages, already rolled. Combat styles are flagged so they sort apart. */
  skills: { name: string; value: number; combatStyle: boolean }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * A hit location's d20 range, as `"01-03"` or occasionally a single `"20"`.
 *
 * Zero-padded, so `parseInt` is used rather than `Number`, and reversed ranges
 * are sorted rather than rejected: a swapped pair is still a usable location.
 */
export function parseRange(range: string): readonly [number, number] | null {
  const parts = range.split("-").map((part) => Number.parseInt(part.trim(), 10));
  if (parts.some((part) => !Number.isFinite(part))) return null;

  if (parts.length === 1) return [parts[0]!, parts[0]!] as const;
  if (parts.length !== 2) return null;

  const [a, b] = parts as [number, number];
  return a <= b ? ([a, b] as const) : ([b, a] as const);
}

/**
 * The Initiative Bonus out of `strike_rank`.
 *
 * MEG writes `"10(13-3)"`: the total first, then the working. The leading
 * number already has the armour penalty applied, which is exactly our
 * `initiativeBonus`, so the parenthesised part is discarded. A bare `"11"`
 * also appears and means the same thing.
 */
export function parseStrikeRank(strikeRank: string): number | null {
  const leading = /^\s*(-?\d+)/.exec(strikeRank);
  return leading ? Number.parseInt(leading[1]!, 10) : null;
}

/** `"Right hind Leg"` -> `"right-hind-leg"`, deduplicated against ids already taken. */
function locationId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "location";

  let id = base;
  let suffix = 2;
  while (taken.has(id)) id = `${base}-${suffix++}`;
  taken.add(id);
  return id;
}

export interface ParseResult<T> {
  value: T | null;
  /** Human-readable reasons the payload could not be used, or was used partially. */
  problems: string[];
}

export function parseIndex(payload: unknown): ParseResult<MegIndexEntry[]> {
  if (!Array.isArray(payload)) {
    return { value: null, problems: ["The index was not a list."] };
  }

  const problems: string[] = [];
  const entries: MegIndexEntry[] = [];

  for (const raw of payload) {
    if (!isRecord(raw) || typeof raw.id !== "number" || typeof raw.name !== "string") {
      problems.push("Skipped an index entry with no id or name.");
      continue;
    }
    entries.push({
      id: raw.id,
      name: raw.name,
      race: asString(raw.race),
      rank: asNumber(raw.rank, 0),
      owner: asString(raw.owner),
      tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === "string") : [],
      notes: asString(raw.notes),
    });
  }

  return { value: entries, problems };
}

/**
 * Ranks a query against the catalogue.
 *
 * Name matches beat race matches beat tag matches, and a prefix beats a match
 * in the middle, because someone typing "kob" wants *Kobold warrior* before
 * *Zombie, kobold warrior*. Search runs over a list already in memory, so this
 * costs the site nothing however much the user types.
 */
export function searchIndex(entries: MegIndexEntry[], query: string, limit = 40): MegIndexEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const scored: { entry: MegIndexEntry; score: number }[] = [];

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    let score = -1;

    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (entry.race.toLowerCase().includes(needle)) score = 2;
    else if (entry.tags.some((tag) => tag.toLowerCase().includes(needle))) score = 3;

    if (score >= 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map(({ entry }) => entry);
}

/**
 * Rolled creatures out of `generate_enemies_json/`.
 *
 * Always an array: the endpoint takes an `amount`, and asking for five goblins
 * returns five separately rolled goblins rather than one repeated five times.
 */
export function parseCreatures(payload: unknown): ParseResult<MegCreature[]> {
  const list = Array.isArray(payload) ? payload : [payload];
  const problems: string[] = [];
  const creatures: MegCreature[] = [];

  for (const raw of list) {
    if (!isRecord(raw) || typeof raw.name !== "string") {
      problems.push("Skipped a creature with no name.");
      continue;
    }

    const locations = Array.isArray(raw.hit_locations) ? raw.hit_locations : [];
    const attributes = isRecord(raw.attributes) ? raw.attributes : {};

    creatures.push({
      name: raw.name,
      hit_locations: locations.filter(isRecord).map((location) => ({
        name: asString(location.name),
        range: asString(location.range),
        hp: asNumber(location.hp, 0),
        ap: asNumber(location.ap, 0),
      })),
      // Built by spreading rather than assigning `undefined`: the project runs
      // with `exactOptionalPropertyTypes`, where a missing key and a key set to
      // `undefined` are not the same thing.
      attributes: {
        ...(typeof attributes.action_points === "number"
          ? { action_points: attributes.action_points }
          : {}),
        ...(typeof attributes.strike_rank === "string"
          ? { strike_rank: attributes.strike_rank }
          : {}),
        ...(typeof attributes.movement === "string" ? { movement: attributes.movement } : {}),
      },
      ...(typeof raw.notes === "string" ? { notes: raw.notes } : {}),
      skills: skillsFromCreature(raw),
    });
  }

  if (creatures.length === 0) problems.push("No creatures in the payload.");
  return { value: creatures, problems };
}

/**
 * Skills and combat styles out of a rolled creature.
 *
 * MEG writes skills as an array of single-key objects — `[{"Athletics": 46}]` —
 * and combat styles as records with a `name` and a `value`. Both are already
 * final percentages, so unlike the sheet builder there is nothing to compute.
 *
 * These were dropped on the first pass as "not modelled", which was true of the
 * engine and wrong for the table: without them a GM cannot roll the creature
 * they just imported.
 */
function skillsFromCreature(raw: Record<string, unknown>): MegCreature["skills"] {
  const skills: MegCreature["skills"] = [];

  if (Array.isArray(raw.skills)) {
    for (const entry of raw.skills) {
      if (!isRecord(entry)) continue;
      for (const [name, value] of Object.entries(entry)) {
        if (typeof value === "number") skills.push({ name, value, combatStyle: false });
      }
    }
  }

  if (Array.isArray(raw.combat_styles)) {
    for (const style of raw.combat_styles) {
      if (!isRecord(style) || typeof style.name !== "string") continue;
      if (typeof style.value !== "number") continue;
      skills.push({ name: style.name, value: style.value, combatStyle: true });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A MEG creature as one of our combatants.
 *
 * `initiative` is left at zero rather than rolled here. Rolling belongs to the
 * GM's "Roll initiative" button (F6), and a creature that arrives pre-rolled
 * would quietly join the order ahead of combatants nobody has rolled yet.
 *
 * A location with no usable `range` is dropped rather than guessed at: an
 * invented d20 range would send hits to the wrong limb, which is worse than a
 * gap the GM can see and fill in.
 */
export function combatantFromCreature(
  creature: MegCreature,
  id: string,
): ParseResult<Combatant> {
  const problems: string[] = [];
  const taken = new Set<string>();
  const locations: HitLocation[] = [];

  for (const location of creature.hit_locations) {
    const range = parseRange(location.range);
    if (!range) {
      problems.push(`Dropped “${location.name || "unnamed location"}”: unreadable range “${location.range}”.`);
      continue;
    }
    const maxHitPoints = Math.max(1, location.hp);
    locations.push({
      id: locationId(location.name, taken),
      name: location.name || "Location",
      range,
      hitPoints: maxHitPoints,
      maxHitPoints,
      armorPoints: Math.max(0, location.ap),
    });
  }

  if (locations.length === 0) {
    return { value: null, problems: [...problems, `“${creature.name}” has no usable hit locations.`] };
  }

  const strikeRank = creature.attributes.strike_rank;
  const initiativeBonus = strikeRank === undefined ? null : parseStrikeRank(strikeRank);
  if (initiativeBonus === null) {
    problems.push(`No Initiative Bonus for “${creature.name}”; set to 0.`);
  }

  const maxActionPoints = creature.attributes.action_points;
  if (maxActionPoints === undefined) {
    problems.push(`No Action Points for “${creature.name}”; set to 1.`);
  }

  const actionPoints = Math.max(0, maxActionPoints ?? 1);

  const notes = creature.notes?.trim();
  const skills = (creature.skills ?? []).map(({ name, value, combatStyle }) => ({
    name,
    value,
    // MEG does not label a creature's skills basic or professional, and for a
    // creature the distinction does not do anything: they are what it has.
    professional: false,
    combatStyle,
  }));

  return {
    value: {
      id,
      name: creature.name,
      initiative: 0,
      initiativeBonus: initiativeBonus ?? 0,
      actionPoints,
      maxActionPoints: actionPoints,
      locations,
      defeated: false,
      ...(notes ? { notes } : {}),
      ...(skills.length > 0 ? { skills } : {}),
    },
    problems,
  };
}
