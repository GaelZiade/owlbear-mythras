import OBR, { type Theme } from "@owlbear-rodeo/sdk";
import { useEffect, useSyncExternalStore } from "react";

import { getSession, subscribe, type Session } from "../adapters/owlbear/store";
import type { Combatant } from "../core/types";

export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession);
}

/**
 * Mirrors the Owlbear palette into CSS variables.
 *
 * The extension runs in an iframe and inherits nothing from the host, so
 * without this it looks like a foreign page embedded in the application.
 */
export function useOwlbearTheme(): void {
  useEffect(() => {
    const apply = (theme: Theme) => {
      const root = document.documentElement;
      root.dataset["mode"] = theme.mode.toLowerCase();
      root.style.setProperty("--bg", theme.background.default);
      root.style.setProperty("--surface", theme.background.paper);
      root.style.setProperty("--text", theme.text.primary);
      root.style.setProperty("--text-dim", theme.text.secondary);
      root.style.setProperty("--text-off", theme.text.disabled);
      root.style.setProperty("--accent", theme.primary.main);
      root.style.setProperty("--accent-text", theme.primary.contrastText);
    };

    void OBR.theme.getTheme().then(apply);
    return OBR.theme.onChange(apply);
  }, []);
}

/**
 * A user may edit the Action Points, Hit Points and Initiative of their own
 * combatant; the GM may edit everything.
 *
 * This decides which controls are shown. What actually gets applied is decided
 * on the GM's client (`protocol.ts`), because a check in the interface only
 * prevents accidents, not tampering.
 */
export function canEdit(session: Session, combatant: Combatant): boolean {
  return session.role === "GM" || combatant.ownerId === session.playerId;
}
