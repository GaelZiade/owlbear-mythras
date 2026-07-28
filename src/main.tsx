import OBR from "@owlbear-rodeo/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { connect } from "./adapters/owlbear/store";
import { App } from "./ui/App";
import "./ui/styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor #root");

// La extensión corre dentro de un iframe de Owlbear: no hay nada con lo que
// hablar hasta que el anfitrión avisa de que está listo.
OBR.onReady(() => {
  void connect();
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
