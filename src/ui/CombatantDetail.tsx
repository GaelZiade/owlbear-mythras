import { useState } from "react";

import { dispatch, type Session } from "../adapters/owlbear/store";
import { effectiveInitiative, effectiveMaxActionPoints } from "../core/combat";
import {
  FATIGUE_TABLE,
  fatigueRow,
  recoverFatigue,
  worsenFatigue,
  type FatigueLevel,
} from "../core/fatigue";
import type { Combatant, HitLocation, WoundLevel } from "../core/types";
import { applyHealing, previewDamage, woundLevel } from "../core/wounds";
import { BodyDiagram } from "./BodyDiagram";

const DIFFICULTY_LABEL: Record<string, string> = {
  none: "—",
  hard: "Hard",
  formidable: "Formidable",
  herculean: "Herculean",
  impossible: "Impossible",
};

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
  const fatigue = fatigueRow(combatant.fatigue);
  const selected = combatant.locations.find(({ id }) => id === selectedId) ?? null;
  const outcome = selected ? outcomeFor(selected, mode, amount, ignoreArmor) : null;

  const setFatigue = (level: FatigueLevel) =>
    dispatch({ type: "combatant/fatigueChanged", combatantId: combatant.id, fatigue: level });

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

      {/*
        Above the locations, not tucked below the controls: for an imported
        creature this is where "Rabble" or a poison's rules live, and it is no
        use to a GM who has to scroll past the whole statblock to find it.
      */}
      {combatant.notes && <p className="combatant-notes">{combatant.notes}</p>}

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

      {/*
        A character's own numbers, editable by whoever owns the character. Only
        the owner dropdown is the GM's alone: who plays what is a decision about
        the table, not about the sheet.
      */}
      {editable && (
        <div className="settings">
          <span className="settings-caption">Character</span>

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

          {/*
            Stepped rather than picked. Fatigue moves one level at a time at the
            table — a failed Endurance roll costs you one — so the common action
            is a button, not hunting through ten options. The dropdown stays in
            the middle for the rare jump, and to name the level you are on.
          */}
          <div className="settings-wide fatigue-picker">
            <span className="settings-label">Fatigue</span>
            <div className="stepper">
              <button
                type="button"
                className="ghost step"
                disabled={fatigue.level === "fresh"}
                aria-label={`Recover a Fatigue level for ${combatant.name}`}
                onClick={() => setFatigue(recoverFatigue(combatant.fatigue))}
              >
                −
              </button>
              <select
                value={fatigue.level}
                aria-label="Fatigue level"
                onChange={(event) => setFatigue(event.target.value as FatigueLevel)}
              >
                {FATIGUE_TABLE.map((row) => (
                  <option key={row.level} value={row.level}>
                    {row.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ghost step"
                disabled={fatigue.level === "dead"}
                aria-label={`Worsen Fatigue for ${combatant.name}`}
                onClick={() => setFatigue(worsenFatigue(combatant.fatigue))}
              >
                +
              </button>
            </div>
          </div>

          {/*
            The table's five columns, split by what this tracker can enforce.
            Initiative and Action Points are applied to the numbers above; the
            other three are shown because a GM needs them at the table, and a
            penalty the tracker silently forgets is worse than one it prints.
          */}
          {fatigue.level !== "fresh" && (
            <div className="fatigue-effects">
              <span className="settings-caption">{fatigue.name}</span>

              {/*
                Past Incapacitated the table stops printing penalties, so both
                numbers read as zero. Showing "No penalty" there would say the
                combatant is fine; the dash defers to the halt line below.
              */}
              <dl className="fatigue-applied">
                <div>
                  <dt>Initiative</dt>
                  <dd>
                    {!fatigue.canAct
                      ? "—"
                      : fatigue.initiativeModifier === 0
                        ? "No penalty"
                        : `${fatigue.initiativeModifier} → ${effectiveInitiative(combatant)}`}
                  </dd>
                </div>
                <div>
                  <dt>Action Points</dt>
                  <dd>
                    {!fatigue.canAct
                      ? "—"
                      : fatigue.actionPointsModifier === 0
                        ? "No penalty"
                        : `${fatigue.actionPointsModifier} → ${effectiveMaxActionPoints(combatant)} max`}
                  </dd>
                </div>
              </dl>

              {!fatigue.canAct && <p className="fatigue-halt">No activity possible</p>}

              <dl className="fatigue-manual">
                <div>
                  <dt>Skills</dt>
                  <dd>{DIFFICULTY_LABEL[fatigue.difficulty] ?? fatigue.difficulty}</dd>
                </div>
                <div>
                  <dt>Movement</dt>
                  <dd>{fatigue.movement}</dd>
                </div>
                <div>
                  <dt>Recovery</dt>
                  <dd>{fatigue.recovery ?? "Never"}</dd>
                </div>
              </dl>
              <p className="fatigue-note">Skills, movement and recovery are yours to apply.</p>
            </div>
          )}

          {selected && (
            <div className="settings-location">
              <span className="settings-caption">{selected.name}</span>

              {/* Not floored at zero: below it is where Serious and Major wounds live. */}
              <label>
                HP
                <input
                  type="number"
                  max={selected.maxHitPoints}
                  value={selected.hitPoints}
                  onChange={(event) =>
                    dispatch({
                      type: "location/hitPointsChanged",
                      combatantId: combatant.id,
                      locationId: selected.id,
                      hitPoints: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                Max HP
                <input
                  type="number"
                  min={1}
                  value={selected.maxHitPoints}
                  onChange={(event) =>
                    dispatch({
                      type: "location/maxHitPointsChanged",
                      combatantId: combatant.id,
                      locationId: selected.id,
                      maxHitPoints: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                Armor
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
            </div>
          )}

          {isGm && (
            <>
              <span className="settings-caption">Table</span>
            <label className="settings-wide">
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
                {/*
                  "Unassigned" and picking yourself are not the same thing even
                  though the GM can edit either: unassigned means nobody claimed
                  it, which is what an NPC should read as. Labelling the first
                  one "(GM)" made the two look like duplicates.
                */}
                <option value="">Unassigned</option>
                {session.party.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.id === session.playerId ? `${member.name} (you)` : member.name}
                  </option>
                ))}
                {combatant.ownerId !== undefined &&
                  !session.party.some((member) => member.id === combatant.ownerId) && (
                    <option value={combatant.ownerId}>Absent player</option>
                  )}
              </select>
            </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
