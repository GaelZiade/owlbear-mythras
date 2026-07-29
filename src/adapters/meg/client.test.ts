import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearIndexCache, fetchCreatures, loadIndex, resetInFlight, type MegDeps } from "./client";
import indexFixture from "./fixtures/index-slice.json";
import creatureFixture from "./fixtures/creature.json";

const DAY_MS = 24 * 60 * 60 * 1000;

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function deps(overrides: Partial<MegDeps> = {}): MegDeps & { storage: ReturnType<typeof fakeStorage> } {
  const storage = (overrides.storage as ReturnType<typeof fakeStorage>) ?? fakeStorage();
  return {
    fetch: vi.fn(async () => ok(indexFixture)) as unknown as typeof globalThis.fetch,
    now: () => 1_000_000,
    ...overrides,
    storage,
  };
}

// Each case starts with no shared request pending, or it would be handed the
// previous case's result and its fetch count would mean nothing.
beforeEach(() => resetInFlight());

describe("loading the MEG index", () => {
  it("fetches it once and caches the result", async () => {
    const d = deps();
    const first = await loadIndex({}, d);

    expect(first.cached).toBe(false);
    expect(first.entries).toHaveLength(6);
    expect(d.fetch).toHaveBeenCalledTimes(1);

    const second = await loadIndex({}, d);
    expect(second.cached).toBe(true);
    expect(second.entries).toHaveLength(6);
    // The whole point: a second search costs the site nothing.
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  /**
   * React's StrictMode mounts effects twice in development, so two calls
   * starting before either finishes is the normal case, not a rare race. Both
   * would miss the cache and both would hit the site.
   */
  it("sends one request when several callers start at once", async () => {
    const d = deps();
    const results = await Promise.all([loadIndex({}, d), loadIndex({}, d), loadIndex({}, d)]);

    expect(d.fetch).toHaveBeenCalledTimes(1);
    for (const result of results) expect(result.entries).toHaveLength(6);
  });

  it("asks the site once per user, not once per keystroke", async () => {
    const d = deps();
    await loadIndex({}, d);
    await loadIndex({}, d);
    await loadIndex({}, d);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("hits exactly the documented index endpoint", async () => {
    const d = deps();
    await loadIndex({}, d);
    expect(d.fetch).toHaveBeenCalledWith("https://mythras.skoll.xyz/index_json/");
  });

  /**
   * The notes are most of the 2.9 MB and come back with the creature anyway, so
   * spending the storage budget on them would be spending it twice.
   */
  it("leaves the long notes out of the cache", async () => {
    const d = deps();
    await loadIndex({}, d);

    const cached = JSON.parse(d.storage.store.get("rodeo.owlbear.mythras/meg-index")!);
    expect(cached.entries[0]).not.toHaveProperty("notes");
    expect(cached.entries[0]).toHaveProperty("name");
    expect(JSON.stringify(cached)).not.toContain("black horse-demons obey");
  });

  it("refetches once the cache has gone stale", async () => {
    const d = deps();
    await loadIndex({}, d);

    const later = { ...d, now: () => 1_000_000 + 8 * DAY_MS };
    const result = await loadIndex({}, later);
    expect(result.cached).toBe(false);
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps using a cache that is still fresh", async () => {
    const d = deps();
    await loadIndex({}, d);

    const later = { ...d, now: () => 1_000_000 + 6 * DAY_MS };
    expect((await loadIndex({}, later)).cached).toBe(true);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches when asked to, ignoring a fresh cache", async () => {
    const d = deps();
    await loadIndex({}, d);
    await loadIndex({ force: true }, d);
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to a stale cache when the network is down", async () => {
    const d = deps();
    await loadIndex({}, d);

    const offline = {
      ...d,
      now: () => 1_000_000 + 30 * DAY_MS,
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    };

    const result = await loadIndex({}, offline);
    expect(result.entries).toHaveLength(6);
    expect(result.cached).toBe(true);
    expect(result.error).toBe("offline");
  });

  it("reports an empty index when the network fails with nothing cached", async () => {
    const d = deps({
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    });
    const result = await loadIndex({}, d);
    expect(result.entries).toEqual([]);
    expect(result.error).toBe("offline");
  });

  it("treats an HTTP error as a failure, not as an empty catalogue", async () => {
    const d = deps({
      fetch: vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof globalThis.fetch,
    });
    expect((await loadIndex({}, d)).error).toContain("503");
  });

  it("survives a corrupt cache by fetching", async () => {
    const storage = fakeStorage({ "rodeo.owlbear.mythras/meg-index": "{{{not json" });
    const d = deps({ storage });
    expect((await loadIndex({}, d)).cached).toBe(false);
  });

  it("does not fail when storage refuses to be written", async () => {
    const storage = {
      ...fakeStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const d = deps({ storage: storage as unknown as ReturnType<typeof fakeStorage> });
    const result = await loadIndex({}, d);
    expect(result.entries).toHaveLength(6);
    expect(result.error).toBeNull();
  });

  it("forgets the cache when asked", async () => {
    const d = deps();
    await loadIndex({}, d);
    clearIndexCache(d);
    expect(d.storage.store.size).toBe(0);
  });
});

describe("rolling creatures from a template", () => {
  it("asks for the template and amount the GM chose, in one request", async () => {
    const d = deps({ fetch: vi.fn(async () => ok(creatureFixture)) as unknown as typeof globalThis.fetch });
    const { creatures } = await fetchCreatures(42, 3, d);

    expect(d.fetch).toHaveBeenCalledWith(
      "https://mythras.skoll.xyz/generate_enemies_json/?id=42&amount=3",
    );
    expect(creatures[0]!.name).toBe("Vinkolt (Acolyte, Dragon Queen 1)");
  });

  it("clamps a nonsense amount rather than asking MEG for it", async () => {
    const d = deps({ fetch: vi.fn(async () => ok(creatureFixture)) as unknown as typeof globalThis.fetch });
    await fetchCreatures(42, 9999, d);
    expect(d.fetch).toHaveBeenCalledWith(expect.stringContaining("amount=20"));

    await fetchCreatures(42, 0, d);
    expect(d.fetch).toHaveBeenLastCalledWith(expect.stringContaining("amount=1"));
  });

  it("reports a network failure instead of throwing at the panel", async () => {
    const d = deps({
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    });
    const { creatures, problems } = await fetchCreatures(42, 1, d);
    expect(creatures).toEqual([]);
    expect(problems).toEqual(["offline"]);
  });

  it("reports an HTTP error with its status", async () => {
    const d = deps({
      fetch: vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof globalThis.fetch,
    });
    expect((await fetchCreatures(999, 1, d)).problems[0]).toContain("404");
  });
});
