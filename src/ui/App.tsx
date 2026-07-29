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
import { AddAll, AddBlank, AddToken, Dice, Info, Play, Search, Sheet, Stop, Undo } from "./icons";
import { MegSearch } from "./MegSearch";
import { combatantFromSheet, parseSheet } from "../adapters/sheet/parse";
import { Notices } from "./Notices";
import { useOwlbearTheme, useSession } from "./useSession";

export function App() {
  useOwlbearTheme();
  const session = useSession();
  const [hint, setHint] = useState<string | null>(null);
  const [showNotices, setShowNotices] = useState(false);
  const [showMeg, setShowMeg] = useState(false);
  const { state, role, gmPresent, canUndo, ready, writeError } = session;
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

          {/*
            Reachable by players too, not only the GM: the Mythras and Chaosium
            notices are a condition of using MEG content, so they cannot sit
            behind a role check.
          */}
          <button
            type="button"
            className="ghost notices-toggle"
            title="Notices"
            aria-label="Notices"
            aria-expanded={showNotices}
            onClick={() => setShowNotices((open) => !open)}
          >
            <Info />
          </button>

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

        {showNotices && <Notices onClose={() => setShowNotices(false)} />}

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
            {/*
              A file input rather than a paste box: the builder exports a file,
              and asking somebody to open it and copy its contents is a step that
              exists only because the interface could not be bothered.
            */}
            <label className="toolbar-file" title="Import a character sheet (.json)">
              <Sheet />
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void file.text().then((text) => {
                    let payload: unknown;
                    try {
                      payload = JSON.parse(text);
                    } catch {
                      setHint(`${file.name} is not valid JSON.`);
                      return;
                    }
                    const { value, problems } = parseSheet(payload);
                    if (!value) {
                      setHint(problems[0] ?? "That file could not be read.");
                      return;
                    }
                    add([combatantFromSheet(value, crypto.randomUUID())], "");
                    setHint(problems.length > 0 ? problems.join(" ") : null);
                  });
                }}
              />
            </label>

            <button
              type="button"
              title="Import from the Mythras Enemy Generator"
              aria-expanded={showMeg}
              className={showMeg ? "on" : ""}
              onClick={() => setShowMeg((open) => !open)}
            >
              <Search />
            </button>
          </div>
        )}

        {isGm && showMeg && (
          <MegSearch
            onClose={() => setShowMeg(false)}
            onAdd={(incoming, problems) => {
              add(incoming, "MEG returned nothing that could be imported.");
              // Problems are shown even when the import succeeded: a dropped hit
              // location leaves a creature the GM needs to look at, not a silent
              // gap in the d20 they find out about mid-fight.
              if (problems.length > 0) setHint(problems.join(" "));
              if (incoming.length > 0 && problems.length === 0) setShowMeg(false);
            }}
          />
        )}
      </header>

      {!gmPresent && (
        <p className="notice notice-alert">No GM connected — changes will not apply.</p>
      )}
      {/*
        Louder than a hint, because what is on screen is not what the room has:
        a reload will discard it. Usually the room's metadata limit, which an
        imported character with a long skill list can reach.
      */}
      {writeError && (
        <p className="notice notice-alert">
          Not saved: {writeError}. A reload will lose what is on screen.
        </p>
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
