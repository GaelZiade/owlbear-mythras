import { useState } from "react";

import { dispatch, undo } from "../adapters/owlbear/store";
import {
  combatantsFromScene,
  combatantsFromSelection,
  combatantsInSelection,
  createCombatant,
} from "../adapters/owlbear/tokens";
import { orderedCombatants, turnStatus } from "../core/combat";
import { rollInitiative } from "../core/dice";
import type { Combatant } from "../core/types";
import { CombatantRow } from "./CombatantRow";
import { AddAll, AddBlank, AddToken, Dice, Play, Stop, Undo } from "./icons";
import { useOwlbearTheme, useSession } from "./useSession";

export function App() {
  useOwlbearTheme();
  const session = useSession();
  const [hint, setHint] = useState<string | null>(null);
  const { state, role, gmPresent, canUndo, ready } = session;
  const isGm = role === "GM";

  if (!ready) {
    return <p className="notice">Connecting to Owlbear…</p>;
  }

  const combatants = orderedCombatants(state);
  const active = state.status === "active";

  /** One event, never one per combatant: separate writes can race and drop some. */
  const add = (incoming: Combatant[], emptyHint: string) => {
    if (incoming.length === 0) {
      setHint(emptyHint);
      return;
    }
    setHint(null);
    dispatch({ type: "combatants/added", combatants: incoming });
  };

  const rollForSelection = async () => {
    const targets = await combatantsInSelection(state.combatants);
    if (targets.length === 0) {
      setHint("Select the tokens you want to roll for.");
      return;
    }
    setHint(null);
    for (const combatant of targets) {
      dispatch({
        type: "combatant/initiativeChanged",
        combatantId: combatant.id,
        initiative: rollInitiative(combatant.initiativeBonus),
      });
    }
  };

  return (
    <main className="panel">
      <header className="header">
        <div className="header-top">
          <div className="readout">
            {active ? (
              <>
                <span className="readout-round">Round {state.round}</span>
                <span className="readout-cycle">Cycle {state.cycle}</span>
              </>
            ) : (
              <span className="readout-idle">No combat</span>
            )}
          </div>

          {isGm && (
            <button
              type="button"
              className={`state-toggle ${active ? "danger" : "primary"}`}
              title={active ? "End combat" : "Start combat"}
              aria-label={active ? "End combat" : "Start combat"}
              disabled={!active && state.combatants.length === 0}
              onClick={() => dispatch({ type: active ? "combat/ended" : "combat/started" })}
            >
              {active ? <Stop /> : <Play />}
            </button>
          )}
        </div>

        {isGm && (
          <div className="toolbar">
            <button
              type="button"
              title="Add selected tokens"
              onClick={() =>
                void combatantsFromSelection(state.combatants).then((found) =>
                  add(found, "Nothing new selected in the scene."),
                )
              }
            >
              <AddToken />
            </button>
            <button
              type="button"
              title="Add every token on the scene"
              onClick={() =>
                void combatantsFromScene(state.combatants).then((found) =>
                  add(found, "No tokens left to add."),
                )
              }
            >
              <AddAll />
            </button>
            <button
              type="button"
              title="Roll initiative for selected tokens"
              onClick={() => void rollForSelection()}
            >
              <Dice />
            </button>
            <button
              type="button"
              title="Add a combatant with no token"
              onClick={() => add([createCombatant("Combatant")], "")}
            >
              <AddBlank />
            </button>
          </div>
        )}
      </header>

      {!gmPresent && (
        <p className="notice notice-alert">No GM connected — changes will not apply.</p>
      )}
      {hint && <p className="notice notice-hint">{hint}</p>}

      {combatants.length === 0 ? (
        <p className="notice">
          {isGm
            ? "Select tokens in the scene and add them to the fight."
            : "The GM has not set up the fight yet."}
        </p>
      ) : (
        <ol className="list">
          {combatants.map((combatant) => (
            <CombatantRow
              key={combatant.id}
              combatant={combatant}
              session={session}
              status={turnStatus(state, combatant)}
            />
          ))}
        </ol>
      )}

      {isGm && (
        <footer className="footer">
          <button
            type="button"
            className="undo"
            title="Undo last change"
            aria-label="Undo last change"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo />
          </button>
          <button
            type="button"
            className="next-turn"
            disabled={!active}
            onClick={() => dispatch({ type: "turn/advanced" })}
          >
            Next turn
          </button>
        </footer>
      )}
    </main>
  );
}
