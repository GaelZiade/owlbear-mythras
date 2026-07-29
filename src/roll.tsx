import OBR from "@owlbear-rodeo/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { RollWindow } from "./ui/RollWindow";
import "./ui/styles.css";

/**
 * The roll window's own entry point.
 *
 * Owlbear loads every surface of an extension as a separate iframe, so a
 * floating window is a second HTML page rather than a component inside the
 * panel. That is the whole reason this exists: a dialog rendered inside the
 * panel can never be wider than the panel, and the panel is a narrow column
 * already carrying a statblock.
 *
 * It reads nothing from the room. The panel hands it a name and a skill list
 * before opening it, because rolling against a number on a sheet has no business
 * waiting for an encounter to load — and a window that cannot open until the
 * whole fight does is a window that fails for reasons that are not its own.
 */
const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");

OBR.onReady(() => {
  createRoot(container).render(
    <StrictMode>
      <RollWindow />
    </StrictMode>,
  );
});
