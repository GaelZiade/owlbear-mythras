import { parseCreatures, parseIndex, type MegCreature, type MegIndexEntry } from "./parse";

/**
 * Talking to the Mythras Enemy Generator.
 *
 * The terms this runs under are in DECISIONS §5, and they shape the code more
 * than the API does:
 *
 *   - The index may be read, once per user, and cached. Reading it is what
 *     makes a search box possible without asking the site anything per keystroke.
 *   - The statblocks behind it are never mirrored. One request, when somebody
 *     imports a creature they picked by name.
 *   - Nothing is fetched speculatively, in the background, or on panel open.
 *
 * The site is small computewise and run by one person who gave permission on
 * that understanding. Every request here is one a user asked for by clicking.
 */

const BASE = "https://mythras.skoll.xyz";

const CACHE_KEY = "rodeo.owlbear.mythras/meg-index";

/**
 * How long a cached index is used without asking again.
 *
 * A week. The MEG author asked for the index to be cached because the endpoint
 * is heavy, suggesting ten minutes as a floor; a week is far kinder to the
 * server than that and costs nothing but freshness, since new templates appear
 * steadily but nobody's session depends on having today's. The Refresh button
 * in the importer covers the case where somebody does.
 */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What gets cached, per entry.
 *
 * `notes` is deliberately excluded. It is most of the payload's ~2.9 MB — some
 * entries run to several paragraphs — and localStorage gives us a few megabytes
 * for everything. The notes come back with the creature on import anyway, so
 * caching them would spend the whole budget on text we fetch again regardless.
 */
type CachedEntry = Omit<MegIndexEntry, "notes">;

interface Cache {
  fetchedAt: number;
  entries: CachedEntry[];
}

export interface MegDeps {
  fetch: typeof globalThis.fetch;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  now: () => number;
}

function defaultDeps(): MegDeps {
  return {
    fetch: (...args) => globalThis.fetch(...args),
    storage: globalThis.localStorage,
    now: () => Date.now(),
  };
}

function readCache(deps: MegDeps): Cache | null {
  try {
    const raw = deps.storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as Cache).entries) ||
      typeof (parsed as Cache).fetchedAt !== "number"
    ) {
      return null;
    }
    return parsed as Cache;
  } catch {
    // A corrupt or unreadable cache is not worth reporting to the user; it just
    // means we fetch. Private browsing can also make localStorage throw outright.
    return null;
  }
}

function writeCache(deps: MegDeps, entries: MegIndexEntry[]): void {
  const stripped: CachedEntry[] = entries.map(({ notes: _notes, ...rest }) => rest);
  try {
    deps.storage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: deps.now(), entries: stripped }));
  } catch {
    // Over quota, or storage denied. The index still works for this session; it
    // simply gets fetched again next time. Failing the import over this would be
    // absurd.
  }
}

export function clearIndexCache(deps: MegDeps = defaultDeps()): void {
  try {
    deps.storage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to do: the cache is advisory.
  }
}

export interface IndexResult {
  entries: MegIndexEntry[];
  /** True when these came from storage rather than the network. */
  cached: boolean;
  /** Set when the network failed; entries may still be usable stale ones. */
  error: string | null;
}

/**
 * The catalogue, from cache when it is fresh enough and from MEG otherwise.
 *
 * A network failure falls back to a stale cache rather than emptying the search
 * box: an index from last month still finds *Kobold warrior*, and the import
 * itself will surface the real error if the id has since gone.
 */
/**
 * The fetch currently in flight, shared by every caller until it settles.
 *
 * Without this, two callers that start before either finishes both miss the
 * cache and both hit the site — which is exactly the traffic the cache exists
 * to prevent. React's StrictMode makes that the *normal* case in development by
 * mounting effects twice, so it is not a rare race.
 */
let inFlight: Promise<IndexResult> | null = null;

export async function loadIndex(
  options: { force?: boolean } = {},
  deps: MegDeps = defaultDeps(),
): Promise<IndexResult> {
  if (inFlight && !options.force) return inFlight;

  const request = loadIndexOnce(options, deps);
  inFlight = request;
  try {
    return await request;
  } finally {
    if (inFlight === request) inFlight = null;
  }
}

/** Exposed for tests, which must not inherit an in-flight request from another case. */
export function resetInFlight(): void {
  inFlight = null;
}

async function loadIndexOnce(
  { force = false }: { force?: boolean },
  deps: MegDeps,
): Promise<IndexResult> {
  const cache = readCache(deps);
  const fresh = cache !== null && deps.now() - cache.fetchedAt < CACHE_TTL_MS;

  if (cache && fresh && !force) {
    return { entries: cache.entries.map((entry) => ({ ...entry, notes: "" })), cached: true, error: null };
  }

  try {
    const response = await deps.fetch(`${BASE}/index_json/`);
    if (!response.ok) throw new Error(`MEG answered ${response.status}`);

    const { value, problems } = parseIndex(await response.json());
    if (!value) throw new Error(problems[0] ?? "The index could not be read.");

    writeCache(deps, value);
    return { entries: value, cached: false, error: null };
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Could not reach MEG.";
    if (cache) {
      return { entries: cache.entries.map((entry) => ({ ...entry, notes: "" })), cached: true, error };
    }
    return { entries: [], cached: false, error };
  }
}

/**
 * Rolls creatures from one template.
 *
 * `amount` is passed through rather than looped, so five goblins are one
 * request and five separate rolls — which is both fewer requests and what the
 * GM wanted, since identical goblins would defeat the point of rolling.
 */
export async function fetchCreatures(
  templateId: number,
  amount: number,
  deps: MegDeps = defaultDeps(),
): Promise<{ creatures: MegCreature[]; problems: string[] }> {
  const count = Math.max(1, Math.min(20, Math.floor(amount)));

  try {
    const response = await deps.fetch(
      `${BASE}/generate_enemies_json/?id=${templateId}&amount=${count}`,
    );
    if (!response.ok) throw new Error(`MEG answered ${response.status}`);

    const { value, problems } = parseCreatures(await response.json());
    return { creatures: value ?? [], problems };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not reach MEG.";
    return { creatures: [], problems: [message] };
  }
}
