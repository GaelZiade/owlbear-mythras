import OBR from "@owlbear-rodeo/sdk";

/**
 * Opening the roll window.
 *
 * `OBR.modal` floats a surface over the whole Owlbear canvas rather than inside
 * the extension's panel, which is the only way to give the skill list room: an
 * overlay rendered inside the panel is still bounded by the panel's width.
 *
 * The combatant travels in the URL because iframes cannot be passed props. The
 * window reads the room itself from there.
 */
const ROLL_WINDOW_ID = "rodeo.owlbear.mythras/roll";

export async function openRollWindow(combatantId: string, name: string): Promise<void> {
  // Built against the page's own location so it works under a subpath, which is
  // how GitHub Pages serves this (/owlbear-mythras/).
  const url = new URL("roll.html", window.location.href);
  url.searchParams.set("combatant", combatantId);

  await OBR.modal.open({
    id: ROLL_WINDOW_ID,
    url: url.toString(),
    // Wide enough for a skill name and its percentage on one line, tall enough
    // for the list not to be a two-row peephole.
    width: 420,
    height: 560,
  });
  void name;
}
