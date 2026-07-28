import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "../../core/types";
import { migrate } from "./migrations";

/**
 * These guard the promise that changing the model does not break a game already
 * in progress. A migration is only ever exercised against real data once, in
 * somebody's live session, so it has to be right the first time.
 */

/** A version 1 fight, mid-turn, exactly as it would sit in a room's metadata. */
const v1 = {
  schemaVersion: 1,
  status: "active",
  round: 2,
  cycle: 1,
  activeInitiative: 12,
  combatants: [
    { id: "a", name: "Swift", initiative: 18, actionPoints: 1, defeated: false },
    { id: "b", name: "Tied", initiative: 12, actionPoints: 2, defeated: false },
    { id: "c", name: "Spent", initiative: 12, actionPoints: 0, defeated: false },
    { id: "d", name: "Downed", initiative: 12, actionPoints: 2, defeated: true },
  ],
};

describe("migrations", () => {
  it("carries a version 1 fight up to the current schema", () => {
    const migrated = migrate(v1);

    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.status).toBe("active");
    expect(migrated.round).toBe(2);
    expect(migrated.combatants).toHaveLength(4);
  });

  it("rebuilds the active turn from the initiative that used to define it", () => {
    const { activeTurn } = migrate(v1);

    expect(activeTurn?.initiative).toBe(12);
    // Only those who could still act: not the spent one, not the defeated one.
    expect(activeTurn?.combatantIds).toEqual(["b"]);
    expect("activeInitiative" in migrate(v1)).toBe(false);
  });

  it("migrates a fight that had nobody holding the turn", () => {
    expect(migrate({ ...v1, activeInitiative: null }).activeTurn).toBeNull();
  });

  it("starts clean rather than trusting anything unrecognisable", () => {
    for (const bad of [null, "nonsense", 42, {}, { schemaVersion: 1 }]) {
      expect(migrate(bad).status).toBe("idle");
      expect(migrate(bad).combatants).toEqual([]);
    }
  });

  it("refuses state written by a newer build instead of guessing at it", () => {
    expect(migrate({ ...v1, schemaVersion: SCHEMA_VERSION + 1 }).status).toBe("idle");
  });

  it("passes through state already at the current version", () => {
    const current = migrate(v1);
    expect(migrate(current)).toEqual(current);
  });
});
