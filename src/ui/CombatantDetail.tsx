import { useState } from "react";

import { dispatch, type Session } from "../adapters/owlbear/store";
import type { Combatant, HitLocation, WoundLevel } from "../core/types";
import { applyHealing, previewDamage, woundLevel } from "../core/wounds";
import { BodyDiagram } from "./BodyDiagram";

const WOUND_LABEL: Record<WoundLevel, string> = {
  unharmed: "Unharmed",
  minor: "Minor wound",
  serious: "Serious wound",
  major: "Major wound",
};

interface Props {
  combatant: Combatant;
  session: Session;
  editable: boolean;
}

type Mode = "damage" | "heal";

interface Outcome {
  hitPointsAfter: number;
  woundAfter: WoundLevel;
  note: string | null;
}

function outcomeFor(
  location: HitLocation,
  mode: Mode,
  amount: number,
  ignoreArmor: boolean,
): Outcome {
  if (mode === "heal") {
    const healed = applyHealing(location, amount);
    return { hitPointsAfter: healed.hitPoints, woundAfter: woundLevel(healed), note: null };
  }

  const preview = previewDamage(location, amount, { ignoreArmor });
  return {
    hitPointsAfter: preview.hitPointsAfter,
    woundAfter: preview.woundAfter,
    note: preview.absorbed > 0 ? `${preview.absorbed} absorbed by armor` : null,
  };
}

/**
 * Expanded panel: where the blow landed, then how hard, then what it does.
 *
 * The outcome is shown before anything is applied. In Mythras the difference
 * between a scratch and a severed limb is a couple of points on one location,
 * so committing damage without seeing the result is how a table loses track of
 * who is still standing.
 */
export function CombatantDetail({ combatant, session, editable }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("damage");
  const [amount, setAmount] = useState(1);
  const [ignoreArmor, setIgnoreArmor] = useState(false);

  const isGm = session.role === "GM";
  const selected = combatant.locations.find(({ id }) => id === selectedId) ?? null;
  const outcome = selected ? outcomeFor(selected, mode, amount, ignoreArmor) : null;

  const apply = () => {
    if (!selected) return;
    dispatch(
      mode === "damage"
        ? {
            type: "location/damaged",
            combatantId: combatant.id,
            locationId: selected.id,
            amount,
            ignoreArmor,
          }
        : {
            type: "location/healed",
            combatantId: combatant.id,
            locationId: selected.id,
            amount,
          },
    );
  };

  return (
    <div className="detail">
      <BodyDiagram
        locations={combatant.locations}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <ul className="locations">
        {combatant.locations.map((location) => {
          const wound = woundLevel(location);
          const isSelected = location.id === selectedId;
          return (
            <li key={location.id}>
              <button
                type="button"
                className={`location location-${wound}${isSelected ? " location-selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(location.id)}
              >
                <span className="location-range">
                  {location.range[0] === location.range[1]
                    ? location.range[0]
                    : `${location.range[0]}–${location.range[1]}`}
                </span>
                <span className="location-name">{location.name}</span>
                <span className="location-armor" title="Armor Points">
                  {location.armorPoints}
                </span>
                <span className="location-hp">
                  {location.hitPoints}
                  <span className="dim">/{location.maxHitPoints}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="damage">
          <div className="segment" role="group" aria-label="Damage or heal">
            <button
              type="button"
              className={mode === "damage" ? "on" : ""}
              onClick={() => setMode("damage")}
            >
              Damage
            </button>
            <button
              type="button"
              className={mode === "heal" ? "on" : ""}
              onClick={() => setMode("heal")}
            >
              Heal
            </button>
          </div>

          <div className="damage-input">
            <input
              type="number"
              min={0}
              value={amount}
              aria-label="Amount"
              onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))}
            />
            {mode === "damage" && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={ignoreArmor}
                  onChange={(event) => setIgnoreArmor(event.target.checked)}
                />
                Ignore armor
              </label>
            )}
          </div>

          {selected && outcome ? (
            <div className={`preview preview-${outcome.woundAfter}`}>
              <span className="preview-line">
                <strong>{selected.name}</strong> {selected.hitPoints} → {outcome.hitPointsAfter}
                {" · "}
                {WOUND_LABEL[outcome.woundAfter]}
              </span>
              {outcome.note && <span className="preview-note">{outcome.note}</span>}
            </div>
          ) : (
            <p className="preview preview-empty">Pick a hit location above.</p>
          )}

          <button type="button" className="apply" disabled={!selected} onClick={apply}>
            {mode === "damage" ? "Apply damage" : "Apply healing"}
          </button>
        </div>
      )}

      {isGm && (
        <div className="settings">
          <label>
            Owner
            <select
              value={combatant.ownerId ?? ""}
              onChange={(event) =>
                dispatch({
                  type: "combatant/ownerChanged",
                  combatantId: combatant.id,
                  ownerId: event.target.value === "" ? undefined : event.target.value,
                })
              }
            >
              <option value="">Unassigned (GM)</option>
              {session.party.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
              {combatant.ownerId !== undefined &&
                !session.party.some((member) => member.id === combatant.ownerId) && (
                  <option value={combatant.ownerId}>Absent player</option>
                )}
            </select>
          </label>

          <label>
            Init. bonus
            <input
              type="number"
              value={combatant.initiativeBonus}
              onChange={(event) =>
                dispatch({
                  type: "combatant/initiativeBonusChanged",
                  combatantId: combatant.id,
                  initiativeBonus: Number(event.target.value),
                })
              }
            />
          </label>

          <label>
            Max AP
            <input
              type="number"
              min={0}
              value={combatant.maxActionPoints}
              onChange={(event) =>
                dispatch({
                  type: "combatant/actionPointsMaxChanged",
                  combatantId: combatant.id,
                  maxActionPoints: Number(event.target.value),
                })
              }
            />
          </label>

          {selected && (
            <label>
              {selected.name} armor
              <input
                type="number"
                min={0}
                value={selected.armorPoints}
                onChange={(event) =>
                  dispatch({
                    type: "location/armorChanged",
                    combatantId: combatant.id,
                    locationId: selected.id,
                    armorPoints: Number(event.target.value),
                  })
                }
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
