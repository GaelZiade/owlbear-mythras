import OBR from "@owlbear-rodeo/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { connect } from "./adapters/owlbear/store";
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
 * It connects to the room in its own right, which is what lets it read the
 * combatant it was opened for and stay in step if the sheet changes underneath.
 */
const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");

const combatantId = new URLSearchParams(window.location.search).get("combatant") ?? "";

OBR.onReady(() => {
  void connect();
  createRoot(container).render(
    <StrictMode>
      <RollWindow combatantId={combatantId} />
    </StrictMode>,
  );
});
