import { describe, expect, it } from "vitest";

import { applyMovementEffect, fatigueRow } from "./fatigue";
import { gaitRow, GAIT_TABLE, harderBy, movementForGait } from "./movement";

/**
 * Gaits come from the Community Errata rather than the SRD — the published
 * Imperative refers to Walk, Run and Sprint without ever printing the table.
 * See `movement.ts` and `reference/README.md`.
 */
describe("gaits", () => {
  it("multiplies the Movement Rate by the errata's figures", () => {
    expect(movementForGait(6, "walk")).toBe(6);
    expect(movementForGait(6, "run")).toBe(18);
    expect(movementForGait(6, "sprint")).toBe(30);
  });

  it("makes an action harder the faster you are going", () => {
    expect(gaitRow("walk").gradeShift).toBe(0);
    expect(gaitRow("run").gradeShift).toBe(1);
    expect(gaitRow("sprint").gradeShift).toBe(2);
  });

  it("says proactive actions are off the table above a walk", () => {
    expect(GAIT_TABLE.filter((row) => row.proactiveActions).map((row) => row.gait)).toEqual([
      "walk",
    ]);
  });

  it("falls back to Walk rather than throwing on a gait it does not know", () => {
    expect(gaitRow(undefined).gait).toBe("walk");
  });

  /**
   * Fatigue halves a *Movement Rate*, so it is applied before the multiplier.
   * The other order would let an Exhausted character sprint 30 rather than 15.
   */
  it("multiplies the rate Fatigue has already reduced", () => {
    const exhausted = applyMovementEffect(6, fatigueRow("exhausted").movementEffect);
    expect(exhausted).toBe(3);
    expect(movementForGait(exhausted, "sprint")).toBe(15);
  });

  it("leaves an immobile character covering nothing at any gait", () => {
    const immobile = applyMovementEffect(6, fatigueRow("incapacitated").movementEffect);
    for (const { gait } of GAIT_TABLE) expect(movementForGait(immobile, gait)).toBe(0);
  });
});

describe("shifting a Difficulty Grade", () => {
  it("moves along the table by the steps given", () => {
    expect(harderBy("standard", 1)).toBe("hard");
    expect(harderBy("standard", 2)).toBe("formidable");
    expect(harderBy("easy", 2)).toBe("hard");
  });

  it("leaves a grade alone at zero steps", () => {
    expect(harderBy("formidable", 0)).toBe("formidable");
  });

  /** Two steps past Herculean is as impossible as one, and the book names it. */
  it("stops at Hopeless rather than running off the end", () => {
    expect(harderBy("herculean", 1)).toBe("hopeless");
    expect(harderBy("herculean", 2)).toBe("hopeless");
    expect(harderBy("hopeless", 2)).toBe("hopeless");
  });

  /**
   * Not the same operation as `hardestGrade`, which picks the worst of several
   * grades in play. Sprinting while Exhausted is Formidable shifted twice, not
   * the worse of Formidable and something else.
   */
  it("shifts from wherever the situation had already landed", () => {
    expect(harderBy("formidable", 2)).toBe("hopeless");
    expect(harderBy("hard", 1)).toBe("formidable");
  });
});
