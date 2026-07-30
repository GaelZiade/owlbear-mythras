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
 * **Packing alone was not enough.** 12.5 kB of 16 is not headroom, it is luck:
 * two more characters and a big fight would hit the ceiling mid-session, which
 * is precisely when nobody can do anything about it. Measured, the eighth
 * imported character crosses it.
 *
 * So the packed object is then deflated and base64'd. Same measurement, with
 * every number varied so identical copies do not flatter the compressor:
 *
 * | characters | packed JSON | deflated + base64 |
 * | ---------- | ----------- | ----------------- |
 * | 6          | 12 998      | 2 224             |
 * | 8          | 17 282 ✗    | 2 620             |
 * | 20         | 43 026 ✗    | 5 088             |
 * | 50         | 107 380 ✗   | 9 096             |
 *
 * Fifty full character sheets fit in 9 kB. The ceiling stops being something to
 * think about, which was the point.
 *
 * The compressor is the browser's own `CompressionStream`, so this costs no
 * dependency. Where it is missing the packed object is written as it was before
 * — smaller rooms still work, they just get the old budget. The smaller of the
 * two is always what is written, so a fight of three stays legible in the room
 * metadata and only a big one turns into base64.
 *
 * `CombatState` itself is unchanged. This is a wire format, not a model.
 */

/** Wire version. Separate from `SCHEMA_VERSION`, which versions the model. */
const WIRE_VERSION = 4;

/** Envelope version for a deflated payload. Bumped independently of `wire`. */
const COMPRESSED_VERSION = 5;

interface CompressedEnvelope {
  z: number;
  d: string;
}

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

/** Bytes a payload occupies in the metadata, counted the way the limit counts. */
export function payloadSize(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/**
 * Runs bytes through a compression stream.
 *
 * Written against `CompressionStream` alone rather than `Blob`/`Response`, so
 * the only thing that has to exist is the transform itself.
 */
async function pump(
  transform: TransformStream<BufferSource, Uint8Array>,
  input: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // Not awaited before reading: a stream can fill its buffer and block the
  // write until somebody drains the other end, so awaiting here would deadlock.
  const written = writer.write(input).then(() => writer.close());
  // A corrupt payload fails at both ends at once. The read below is what
  // reports it; marking this one handled stops the same failure from also
  // escaping as an unhandled rejection, which no `catch` around this call
  // would ever see. `await written` further down still rethrows it.
  void written.catch(() => undefined);

  const chunks: Uint8Array[] = [];
  const reader = transform.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  await written;

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

const CHUNK = 0x8000;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // In chunks because `String.fromCharCode(...bytes)` spreads every byte into an
  // argument, and a big fight would overflow the call stack.
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function canCompress(): boolean {
  return typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
}

/**
 * What actually goes into the room metadata, and what it costs.
 *
 * The caller gets the size back because the only way to know a write will be
 * accepted is to measure the thing being written: Owlbear refuses an oversized
 * write from its own message handler, so the promise never rejects and nothing
 * downstream ever hears about it.
 */
export async function encodeForRoom(
  state: CombatState,
): Promise<{ payload: unknown; size: number }> {
  const packed = encodeState(state);
  const plainSize = payloadSize(packed);
  if (!canCompress()) return { payload: packed, size: plainSize };

  try {
    const json = new TextEncoder().encode(JSON.stringify(packed));
    const deflated = await pump(new CompressionStream("deflate-raw"), json);
    const envelope: CompressedEnvelope = { z: COMPRESSED_VERSION, d: toBase64(deflated) };
    const size = payloadSize(envelope);
    // A short fight compresses to more than it started as; there is no reason to
    // make the room metadata unreadable for a loss.
    return size < plainSize ? { payload: envelope, size } : { payload: packed, size: plainSize };
  } catch {
    return { payload: packed, size: plainSize };
  }
}

function isCompressed(raw: unknown): raw is CompressedEnvelope {
  return isRecord(raw) && raw.z === COMPRESSED_VERSION && typeof raw.d === "string";
}

/**
 * Reads whatever the room holds: deflated, packed, or the verbose shape from
 * before either existed.
 *
 * A payload that cannot be inflated returns an empty fight rather than throwing.
 * Throwing here would leave the panel stuck on "Connecting…", and a fight nobody
 * can see is no better than one that is gone.
 */
export async function decodeFromRoom(raw: unknown): Promise<CombatState> {
  if (!isCompressed(raw)) return decodeState(raw);
  if (!canCompress()) return migrate(null);

  try {
    const inflated = await pump(new DecompressionStream("deflate-raw"), fromBase64(raw.d));
    return decodeState(JSON.parse(new TextDecoder().decode(inflated)));
  } catch {
    return migrate(null);
  }
}
