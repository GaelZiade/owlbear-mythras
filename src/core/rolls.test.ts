import { describe, expect, it } from "vitest";

import { fatigueRow } from "./fatigue";
import {
  criticalThreshold,
  DIFFICULTY_TABLE,
  gradeRoll,
  hardestGrade,
  modifiedSkill,
  rollSkill,
  type DifficultyGrade,
} from "./rolls";

/** Every roll on a d100, for the exhaustive sweeps below. */
const ALL_ROLLS = Array.from({ length: 100 }, (_, index) => index + 1);

describe("the Difficulty Grade table", () => {
  it("has the book's eight grades, easiest first", () => {
    expect(DIFFICULTY_TABLE.map(({ grade }) => grade)).toEqual([
      "automatic",
      "very-easy",
      "easy",
      "standard",
      "hard",
      "formidable",
      "herculean",
      "hopeless",
    ]);
  });

  it("carries the simplified modifiers the book prints", () => {
    const simplified = Object.fromEntries(
      DIFFICULTY_TABLE.map(({ grade, simplified: value }) => [grade, value]),
    );
    expect(simplified).toMatchObject({
      "very-easy": 40,
      easy: 20,
      standard: 0,
      hard: -20,
      formidable: -40,
      herculean: -80,
    });
  });

  it("marks the two grades that are not rolls at all", () => {
    const rollable = Object.fromEntries(
      DIFFICULTY_TABLE.map(({ grade, rollable: value }) => [grade, value]),
    );
    expect(rollable.automatic).toBe(false);
    expect(rollable.hopeless).toBe(false);
  });
});

describe("modifying a skill by grade", () => {
  /** Doubling, one and a half, a third off, half, a fifth. */
  it("applies the multiplier method as the book states it", () => {
    expect(modifiedSkill(60, "very-easy")).toBe(120);
    expect(modifiedSkill(60, "easy")).toBe(90);
    expect(modifiedSkill(60, "standard")).toBe(60);
    expect(modifiedSkill(60, "hard")).toBe(40);
    expect(modifiedSkill(60, "formidable")).toBe(30);
    expect(modifiedSkill(60, "herculean")).toBe(12);
  });

  it("applies the simplified method as flat percentages", () => {
    expect(modifiedSkill(60, "very-easy", "simplified")).toBe(100);
    expect(modifiedSkill(60, "easy", "simplified")).toBe(80);
    expect(modifiedSkill(60, "standard", "simplified")).toBe(60);
    expect(modifiedSkill(60, "hard", "simplified")).toBe(40);
    expect(modifiedSkill(60, "formidable", "simplified")).toBe(20);
    expect(modifiedSkill(60, "herculean", "simplified")).toBe(0);
  });

  /**
   * The reason the book offers both: they agree around 60 and diverge sharply
   * at high skill, which is what "ofrece una mejor simulación para escalar"
   * refers to.
   */
  it("shows why the two methods are not interchangeable at high skill", () => {
    expect(modifiedSkill(120, "formidable")).toBe(60);
    expect(modifiedSkill(120, "formidable", "simplified")).toBe(80);
  });

  it("rounds a fractional target down", () => {
    expect(modifiedSkill(33, "hard")).toBe(22);
    expect(modifiedSkill(35, "easy")).toBe(52);
  });

  it("never goes below zero", () => {
    expect(modifiedSkill(30, "herculean", "simplified")).toBe(0);
    expect(modifiedSkill(0, "formidable")).toBe(0);
  });
});

describe("picking a grade when several apply", () => {
  it("takes the hardest, as the book says", () => {
    expect(hardestGrade(["hard", "formidable"])).toBe("formidable");
    expect(hardestGrade(["herculean", "easy"])).toBe("herculean");
  });

  it("is Standard when nothing applies", () => {
    expect(hardestGrade([])).toBe("standard");
  });

  /** Exhausted makes every roll Formidable, which outranks a merely Hard task. */
  it("combines a Fatigue grade with the task's own", () => {
    const fromFatigue = fatigueRow("exhausted").difficulty as DifficultyGrade;
    expect(fromFatigue).toBe("formidable");
    expect(hardestGrade(["hard", fromFatigue])).toBe("formidable");
  });

  it("lets Hopeless win over everything", () => {
    expect(hardestGrade(["very-easy", "hopeless", "standard"])).toBe("hopeless");
  });
});

describe("the critical threshold", () => {
  /** The book's own example: 33 doubled to 66 criticals on 7 or less. */
  it("is a tenth of the modified value, rounded up", () => {
    expect(criticalThreshold(66)).toBe(7);
    expect(criticalThreshold(60)).toBe(6);
    expect(criticalThreshold(61)).toBe(7);
  });

  it("comes off the modified skill, not the base one", () => {
    expect(gradeRoll(7, 33, "very-easy").criticalOn).toBe(7);
    expect(gradeRoll(7, 33, "standard").criticalOn).toBe(4);
  });

  it("is at least 1, so any roll worth making can still crit", () => {
    expect(criticalThreshold(0)).toBe(1);
    expect(criticalThreshold(5)).toBe(1);
  });
});

describe("grading a roll", () => {
  it("succeeds at or under the target and fails above it", () => {
    expect(gradeRoll(50, 50).outcome).toBe("success");
    expect(gradeRoll(51, 50).outcome).toBe("failure");
  });

  it("criticals inside the tenth", () => {
    expect(gradeRoll(5, 50).outcome).toBe("critical");
    expect(gradeRoll(6, 50).outcome).toBe("success");
  });

  it("fumbles on 99 and 00", () => {
    expect(gradeRoll(99, 50).outcome).toBe("fumble");
    expect(gradeRoll(100, 50).outcome).toBe("fumble");
  });

  /** "Las Habilidades con un valor mayor a 100% Pifian únicamente con 00." */
  it("only fumbles on 00 once the target passes 100", () => {
    expect(gradeRoll(99, 110).outcome).toBe("failure");
    expect(gradeRoll(100, 110).outcome).toBe("fumble");
  });

  it("still fumbles on 99 at exactly 100, which is not over 100", () => {
    expect(gradeRoll(99, 100).outcome).toBe("fumble");
  });

  it("fails on 96-00 however high the skill", () => {
    for (const roll of [96, 97, 98]) {
      expect(gradeRoll(roll, 95).outcome).toBe("failure");
    }
  });

  it("succeeds on 01-05 however low the skill", () => {
    for (const roll of [1, 2, 3, 4, 5]) {
      expect(gradeRoll(roll, 1).outcome).not.toBe("failure");
    }
  });

  /**
   * The two rules meet at a skill of 0: nothing can be rolled under, but 01-05
   * still saves it, and a 1 is also inside the minimum critical range.
   */
  it("lets a hopeless skill still crit on a 1", () => {
    expect(gradeRoll(1, 0).outcome).toBe("critical");
    expect(gradeRoll(5, 0).outcome).toBe("success");
    expect(gradeRoll(6, 0).outcome).toBe("failure");
  });

  it("reports the target it actually used", () => {
    const result = gradeRoll(30, 60, "formidable");
    expect(result.target).toBe(30);
    expect(result.outcome).toBe("success");
  });
});

describe("the grades that are not rolls", () => {
  it("succeeds Automatic without consulting the die", () => {
    for (const roll of [1, 50, 99, 100]) {
      const result = gradeRoll(roll, 40, "automatic");
      expect(result.outcome).toBe("success");
      expect(result.note).toContain("no roll needed");
    }
  });

  it("fails Hopeless without consulting the die", () => {
    for (const roll of [1, 50, 100]) {
      const result = gradeRoll(roll, 90, "hopeless");
      expect(result.outcome).toBe("failure");
      expect(result.note).toContain("cannot be made");
    }
  });
});

describe("every roll on the die, at once", () => {
  /**
   * The special ranges are stated as absolutes and must hold at any skill, so
   * this sweeps the whole die rather than sampling. It is what caught the
   * ordering question between "96-00 always fails" and "99-00 fumbles": a 99 is
   * both, and fumble is the more specific answer.
   */
  it("never contradicts the always-rules at any skill", () => {
    for (const skill of [0, 1, 40, 95, 100, 150]) {
      for (const roll of ALL_ROLLS) {
        const { outcome } = gradeRoll(roll, skill);

        if (roll <= 5) expect(outcome).not.toBe("failure");
        if (roll >= 96) expect(["failure", "fumble"]).toContain(outcome);
        if (roll === 100) expect(outcome).toBe("fumble");
      }
    }
  });

  it("gives exactly one outcome per roll, with no gaps", () => {
    const outcomes = ALL_ROLLS.map((roll) => gradeRoll(roll, 55).outcome);
    expect(outcomes).toHaveLength(100);
    expect(new Set(outcomes)).toEqual(new Set(["critical", "success", "failure", "fumble"]));
  });

  it("counts the expected successes at a skill of 55", () => {
    const tally = { critical: 0, success: 0, failure: 0, fumble: 0 };
    for (const roll of ALL_ROLLS) tally[gradeRoll(roll, 55).outcome] += 1;

    // 1-6 crit, 7-55 succeed, 56-95 fail, 96-98 fail, 99-00 fumble.
    expect(tally).toEqual({ critical: 6, success: 49, failure: 43, fumble: 2 });
  });
});

describe("rolling for real", () => {
  it("uses the injected generator", () => {
    const result = rollSkill(50, "standard", "multiplier", () => 0.49);
    expect(result.roll).toBe(50);
    expect(result.outcome).toBe("success");
  });

  it("stays inside 1-100 across the generator's whole range", () => {
    for (const value of [0, 0.001, 0.5, 0.999999]) {
      const { roll } = rollSkill(50, "standard", "multiplier", () => value);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);
    }
  });
});
