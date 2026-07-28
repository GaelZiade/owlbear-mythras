/**
 * Dice rolls.
 *
 * Only Initiative for now. The generator is a parameter so tests stay
 * deterministic and so the success, critical and fumble grading of the next
 * phase can build on the same base.
 */

export type RandomSource = () => number;

export function rollDie(sides: number, random: RandomSource = Math.random): number {
  return Math.floor(random() * sides) + 1;
}

/** Mythras initiative: 1d10 + Initiative Bonus. */
export function rollInitiative(bonus: number, random: RandomSource = Math.random): number {
  return rollDie(10, random) + bonus;
}
