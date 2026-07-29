import type { Combatant, CombatState, HitLocation, Skill, StoredCharacter } from "../../core/types";
import { migrate } from "./migrations";

/**
 * Packing the combat state for Owlbear's room metadata.
 *
 * **Owlbear caps room metadata at 16 kB.** That is a hard limit — the write is
 * refused outright, and the SDK reports it from its own message handler rather
 * than by rejecting the promise we await, so the failure does not reach a
 * `catch`. A party with imported sheets went past it and every write from then
 * on was silently discarded, which read as "nothing persists".
 *
 * JSON spends that budget badly. A skill is `{"name":…,"value":…,
 * "professional":…,"combatStyle":…}` — four keys repeated for every one of them,
 * and a character has thirty. Skills and hit locations alone were 2.7 kB of a
 * 3.0 kB character.
 *
 * So those two arrays travel as tuples and everything else keeps its shape. That
 * takes a character from 3033 bytes to 1033, and six of them with archived
 * sheets from 36 kB to 12.5 — under the ceiling with room to spare. Packing the
 * whole combatant positionally would save a little more and would be much easier
 * to get wrong; the two big arrays are where the money is.
 *
 * `CombatState` itself is unchanged. This is a wire format, not a model.
 */

/** Wire version. Separate from `SCHEMA_VERSION`, which versions the model. */
const WIRE_VERSION = 4;

type PackedSkill = [name: string, value: number, flags: number];
type PackedLocation = [
  id: string,
  name: string,
  min: number,
  max: number,
  hitPoints: number,
  maxHitPoints: number,
  armorPoints: number,
];

const PROFESSIONAL = 1;
const COMBAT_STYLE = 2;

function packSkills(skills: readonly Skill[]): PackedSkill[] {
  return skills.map(({ name, value, professional, combatStyle }) => [
    name,
    value,
    (professional ? PROFESSIONAL : 0) | (combatStyle ? COMBAT_STYLE : 0),
  ]);
}

function unpackSkills(packed: unknown): Skill[] {
  if (!Array.isArray(packed)) return [];
  return packed.flatMap((entry): Skill[] => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return [];
    const flags = typeof entry[2] === "number" ? entry[2] : 0;
    return [
      {
        name: entry[0],
        value: typeof entry[1] === "number" ? entry[1] : 0,
        professional: (flags & PROFESSIONAL) !== 0,
        combatStyle: (flags & COMBAT_STYLE) !== 0,
      },
    ];
  });
}

function packLocations(locations: readonly HitLocation[]): PackedLocation[] {
  return locations.map((location) => [
    location.id,
    location.name,
    location.range[0],
    location.range[1],
    location.hitPoints,
    location.maxHitPoints,
    location.armorPoints,
  ]);
}

function unpackLocations(packed: unknown): HitLocation[] {
  if (!Array.isArray(packed)) return [];
  return packed.flatMap((entry): HitLocation[] => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return [];
    const number = (value: unknown, fallback: number) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return [
      {
        id: entry[0],
        name: typeof entry[1] === "string" ? entry[1] : entry[0],
        range: [number(entry[2], 1), number(entry[3], 1)] as const,
        hitPoints: number(entry[4], 1),
        maxHitPoints: number(entry[5], 1),
        armorPoints: number(entry[6], 0),
      },
    ];
  });
}

/** Packs one combatant or archived sheet, whichever carries the two big arrays. */
function packSheet<T extends { locations: HitLocation[]; skills?: Skill[] }>(
  sheet: T,
): Record<string, unknown> {
  const { locations, skills, ...rest } = sheet;
  return {
    ...rest,
    l: packLocations(locations),
    ...(skills && skills.length > 0 ? { k: packSkills(skills) } : {}),
  };
}

function unpackCombatant(raw: Record<string, unknown>): Combatant {
  const { l, k, ...rest } = raw;
  const skills = unpackSkills(k);
  return {
    ...(rest as Omit<Combatant, "locations" | "skills">),
    locations: unpackLocations(l),
    ...(skills.length > 0 ? { skills } : {}),
  };
}

function unpackCharacter(raw: Record<string, unknown>): StoredCharacter {
  const { l, k, ...rest } = raw;
  const skills = unpackSkills(k);
  return {
    ...(rest as Omit<StoredCharacter, "locations" | "skills">),
    locations: unpackLocations(l),
    ...(skills.length > 0 ? { skills } : {}),
  };
}

export function encodeState(state: CombatState): Record<string, unknown> {
  return {
    wire: WIRE_VERSION,
    schemaVersion: state.schemaVersion,
    status: state.status,
    round: state.round,
    cycle: state.cycle,
    activeTurn: state.activeTurn,
    knownPlayers: state.knownPlayers,
    combatants: state.combatants.map(packSheet),
    characters: Object.fromEntries(
      Object.entries(state.characters).map(([token, sheet]) => [token, packSheet(sheet)]),
    ),
  };
}

/**
 * Reads whatever is in the metadata, packed or not.
 *
 * Rooms written before this existed hold the verbose shape, and they are still
 * readable — `migrate` handles those. Only the presence of `wire` says the two
 * big arrays are tuples.
 */
export function decodeState(raw: unknown): CombatState {
  if (typeof raw !== "object" || raw === null) return migrate(raw);

  const record = raw as Record<string, unknown>;
  if (record.wire !== WIRE_VERSION) return migrate(raw);

  const combatants = Array.isArray(record.combatants)
    ? record.combatants.filter(isRecord).map(unpackCombatant)
    : [];

  const characters = isRecord(record.characters)
    ? Object.fromEntries(
        Object.entries(record.characters)
          .filter(([, sheet]) => isRecord(sheet))
          .map(([token, sheet]) => [token, unpackCharacter(sheet as Record<string, unknown>)]),
      )
    : {};

  // Rebuilt through `migrate` so the same validation and repair applies to a
  // packed state as to a verbose one; there is no second definition of valid.
  return migrate({
    ...record,
    wire: undefined,
    combatants,
    characters,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Owlbear's own ceiling. Writing past it is refused, not truncated. */
export const METADATA_LIMIT_BYTES = 16 * 1024;

/** Bytes a state would occupy, so a doomed write can be refused before it is sent. */
export function encodedSize(state: CombatState): number {
  return new TextEncoder().encode(JSON.stringify(encodeState(state))).length;
}
