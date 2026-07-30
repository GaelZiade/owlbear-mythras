import OBR from "@owlbear-rodeo/sdk";

import type { Passion, Skill } from "../../core/types";

/**
 * Opening the roll window.
 *
 * `OBR.modal` floats a surface over the whole Owlbear canvas rather than inside
 * the extension's panel, which is the only way to give the skill list room: an
 * overlay rendered inside the panel is still bounded by the panel's width.
 *
 * The window is handed exactly what it needs — a name and a list of skills — and
 * reads nothing else. It used to look the combatant up in the room by id, which
 * meant a window whose only job is "roll against a number on this sheet" could
 * not open unless the whole fight loaded first. That was both fragile and wrong
 * about what rolling is: you roll a character's skill, not the encounter's.
 *
 * The handoff goes through sessionStorage rather than the URL because a full
 * skill list runs to a couple of kilobytes and belongs nowhere near a query
 * string. Both surfaces are the same origin, so it is simply shared memory.
 */
const ROLL_WINDOW_ID = "rodeo.owlbear.mythras/roll";

const HANDOFF_KEY = "rodeo.owlbear.mythras/roll-context";

export interface RollContext {
  name: string;
  skills: Skill[];
  /**
   * Passions, which augment a roll rather than being one.
   *
   * Handed over with the skills because the augment has to update the target
   * live, and a window that had to go and look them up would be back to reading
   * the room — which is what §5h took it out of.
   */
  passions?: Passion[];
  /** Fatigue's own difficulty grade, so the window need not know about combat. */
  fatigueGrade: string | null;
  fatigueName: string;
}

export function writeRollContext(context: RollContext): void {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(context));
  } catch {
    // Private browsing. The window will say it has nothing to roll, which is
    // true and better than a blank page.
  }
}

export function readRollContext(): RollContext | null {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as RollContext) : null;
  } catch {
    return null;
  }
}

export async function openRollWindow(context: RollContext): Promise<void> {
  writeRollContext(context);

  // Built against the page's own location so it works under a subpath, which is
  // how GitHub Pages serves this (/owlbear-mythras/).
  const url = new URL("roll.html", window.location.href);

  await OBR.modal.open({
    id: ROLL_WINDOW_ID,
    url: url.toString(),
    // Wide enough for a skill name and its percentage on one line, tall enough
    // for the list not to be a two-row peephole.
    width: 420,
    height: 560,
  });
}
