import { useEffect, useState } from "react";

import { dispatch, type Session } from "../adapters/owlbear/store";
import {
  baseMaxActionPoints,
  canMakeDesperateEffort,
  currentLuckPoints,
  currentMagicPoints,
  effectiveInitiative,
  effectiveInitiativeBonus,
  effectiveMaxActionPoints,
  effectiveMaxLuckPoints,
  effectiveMaxMagicPoints,
  effectiveMovementRate,
} from "../core/combat";
import { deriveAttributes } from "../core/characteristics";
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
import { CharacteristicsPanel } from "./Characteristics";
import { sceneTokens } from "../adapters/owlbear/tokens";
import { openRollWindow } from "../adapters/owlbear/windows";

const DIFFICULTY_LABEL: Record<string, string> = {
  none: "—",
  hard: "Hard",
  formidable: "Formidable",
  herculean: "Herculean",
  hopeless: "Hopeless",
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

/**
 * Luck and Magic Points, and the Attributes worth reading mid-fight.
 *
 * Both pools are spendable and both replenish between sessions, so they are
 * tracked rather than derived on the spot: *"Once a Luck Point is spent, the
 * pool decreases… until the next game session."*
 *
 * The derived Attributes are here because they had nowhere else to be read. They
 * were computed and displayed, but only inside the Characteristics *editor* —
 * which meant a player wanting their Damage Modifier mid-fight had to open a
 * form full of the numbers it comes from. Nothing here is editable; it is the
 * sheet, printed.
 */
function Resources({ combatant, editable }: { combatant: Combatant; editable: boolean }) {
  const maxLuck = effectiveMaxLuckPoints(combatant);
  const maxMagic = effectiveMaxMagicPoints(combatant);
  const derived = combatant.characteristics ? deriveAttributes(combatant.characteristics) : null;
  const movement = effectiveMovementRate(combatant);

  // Nothing derived, no pools and no rate: a plain combatant with no sheet
  // behind it, where an empty block would be furniture.
  if (maxLuck === 0 && maxMagic === 0 && !derived && movement === null) return null;

  const spend = (type: "luckPoints/changed" | "magicPoints/changed", delta: number) =>
    dispatch({ type, combatantId: combatant.id, delta });

  return (
    <div className="resources">
      {maxLuck > 0 && (
        <div className="resource">
          <span className="resource-name">Luck</span>
          <span className="resource-value">
            {currentLuckPoints(combatant)}
            <span className="dim">/{maxLuck}</span>
          </span>
          {editable && (
            <span className="resource-steps">
              <button
                type="button"
                className="ghost step"
                aria-label={`Spend a Luck Point for ${combatant.name}`}
                disabled={currentLuckPoints(combatant) === 0}
                onClick={() => spend("luckPoints/changed", -1)}
              >
                −
              </button>
              <button
                type="button"
                className="ghost step"
                aria-label={`Restore a Luck Point for ${combatant.name}`}
                disabled={currentLuckPoints(combatant) === maxLuck}
                onClick={() => spend("luckPoints/changed", 1)}
              >
                +
              </button>
            </span>
          )}
        </div>
      )}

      {maxMagic > 0 && (
        <div className="resource">
          <span className="resource-name">Magic</span>
          <span className="resource-value">
            {currentMagicPoints(combatant)}
            <span className="dim">/{maxMagic}</span>
          </span>
          {editable && (
            <span className="resource-steps">
              <button
                type="button"
                className="ghost step"
                aria-label={`Spend a Magic Point for ${combatant.name}`}
                disabled={currentMagicPoints(combatant) === 0}
                onClick={() => spend("magicPoints/changed", -1)}
              >
                −
              </button>
              <button
                type="button"
                className="ghost step"
                aria-label={`Restore a Magic Point for ${combatant.name}`}
                disabled={currentMagicPoints(combatant) === maxMagic}
                onClick={() => spend("magicPoints/changed", 1)}
              >
                +
              </button>
            </span>
          )}
        </div>
      )}

      {/*
        Offered only when the rules allow it — out of Action Points, with a Luck
        Point left and a maximum above zero. A button that is always there would
        invite spending a point at full Action Points, where it buys a point over
        the maximum that nothing will honour, or while Incapacitated, where the
        Fatigue table takes it straight back.
      */}
      {editable && canMakeDesperateEffort(combatant) && (
        <button
          type="button"
          className="desperate"
          title="Spend a Luck Point for one Action Point"
          onClick={() => dispatch({ type: "luck/desperateEffort", combatantId: combatant.id })}
        >
          Desperate Effort
        </button>
      )}

      {(derived || movement !== null) && (
        <dl className="resource-derived">
          {derived && (
            <>
              <div>
                <dt>Damage mod.</dt>
                <dd>{derived.damageModifier}</dd>
              </div>
              <div>
                <dt>Healing rate</dt>
                <dd>{derived.healingRate}</dd>
              </div>
              <div>
                <dt>Exp. mod.</dt>
                <dd>
                  {derived.experienceModifier >= 0 ? "+" : ""}
                  {derived.experienceModifier}
                </dd>
              </div>
            </>
          )}
          {/*
            Shown after Fatigue has been applied, with the sheet value beside it
            when the two differ. An Exhausted character moving 3 rather than 6 is
            arithmetic the tracker can do; leaving "Halved" on screen next to a
            known rate would be making the player do it.
          */}
          {movement !== null && (
            <div>
              <dt>Movement</dt>
              <dd>
                {movement === 0 ? "Immobile" : `${movement} m`}
                {movement !== combatant.movementRate && (
                  <span className="dim"> of {combatant.movementRate}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/**
 * Weapons and spells: reference, with one number that moves.
 *
 * Damage, size and reach are printed and left alone — the dice are thrown in
 * physical form and read off the player's own sheet. Weapon Hit Points are the
 * exception, because parrying is how a weapon breaks, so those get a stepper.
 *
 * Spells are a list because Magic Points are already a pool above: knowing what
 * a caster can spend them on is the other half of tracking them.
 */
function Kit({ combatant, editable }: { combatant: Combatant; editable: boolean }) {
  const weapons = combatant.weapons ?? [];
  const spells = combatant.spells ?? [];
  if (weapons.length === 0 && spells.length === 0) return null;

  const traditions = [...new Set(spells.map((spell) => spell.tradition ?? "Spells"))];

  return (
    <div className="kit">
      {weapons.length > 0 && (
        <ul className="weapons">
          {weapons.map((weapon) => (
            <li key={weapon.name} className="weapon">
              <span className="weapon-name">{weapon.name}</span>
              <span className="weapon-stats">
                {[weapon.damage, weapon.size, weapon.reach && `reach ${weapon.reach}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {weapon.maxHitPoints !== undefined && (
                <span className="weapon-hp">
                  {weapon.armorPoints !== undefined && (
                    <span className="weapon-armor" title="Armor Points">
                      {weapon.armorPoints}
                    </span>
                  )}
                  {editable ? (
                    <span className="resource-steps">
                      <button
                        type="button"
                        className="ghost step"
                        aria-label={`Damage ${weapon.name}`}
                        disabled={(weapon.hitPoints ?? 0) === 0}
                        onClick={() =>
                          dispatch({
                            type: "weapon/hitPointsChanged",
                            combatantId: combatant.id,
                            weapon: weapon.name,
                            hitPoints: (weapon.hitPoints ?? 0) - 1,
                          })
                        }
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="ghost step"
                        aria-label={`Repair ${weapon.name}`}
                        disabled={weapon.hitPoints === weapon.maxHitPoints}
                        onClick={() =>
                          dispatch({
                            type: "weapon/hitPointsChanged",
                            combatantId: combatant.id,
                            weapon: weapon.name,
                            hitPoints: (weapon.hitPoints ?? 0) + 1,
                          })
                        }
                      >
                        +
                      </button>
                    </span>
                  ) : null}
                  <span className={weapon.hitPoints === 0 ? "weapon-broken" : ""}>
                    {weapon.hitPoints ?? weapon.maxHitPoints}
                    <span className="dim">/{weapon.maxHitPoints}</span>
                  </span>
                </span>
              )}
              {weapon.effects && <span className="weapon-effects">{weapon.effects}</span>}
            </li>
          ))}
        </ul>
      )}

      {traditions.map((tradition) => (
        <div key={tradition} className="spells">
          <span className="settings-caption">{tradition}</span>
          <p className="spell-list">
            {spells
              .filter((spell) => (spell.tradition ?? "Spells") === tradition)
              .map((spell) => spell.name)
              .join(", ")}
          </p>
        </div>
      ))}
    </div>
  );
}

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
  const [tokens, setTokens] = useState<{ id: string; name: string }[]>([]);

  const isGm = session.role === "GM";

  // Read once when the panel opens rather than kept in sync: the scene's token
  // list changes rarely and a subscription for a dropdown is not worth it.
  useEffect(() => {
    if (!isGm) return;
    let live = true;
    void sceneTokens().then((found) => {
      if (live) setTokens(found);
    });
    return () => {
      live = false;
    };
  }, [isGm]);

  const fatigue = fatigueRow(combatant.fatigue);
  const selected = combatant.locations.find(({ id }) => id === selectedId) ?? null;
  const outcome = selected ? outcomeFor(selected, mode, amount, ignoreArmor) : null;

  /**
   * Everyone who could own this combatant.
   *
   * Built from the room's record of players rather than from who is connected:
   * Owlbear only reports the party that is online, so a GM setting up before
   * anybody arrives had nobody to choose from but themselves.
   */
  const ownerOptions = (() => {
    const online = new Map(session.party.map((member) => [member.id, member.name]));
    const seen = new Map(session.state.knownPlayers.map((player) => [player.id, player.name]));
    for (const [id, name] of online) seen.set(id, name);
    if (combatant.ownerId !== undefined && !seen.has(combatant.ownerId)) {
      seen.set(combatant.ownerId, "Unknown player");
    }

    return [...seen].map(([id, name]) => ({
      id,
      label:
        id === session.playerId
          ? `${name} (you)`
          : online.has(id)
            ? name
            : `${name} — offline`,
    }));
  })();

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

      <Resources combatant={combatant} editable={editable} />

      <Kit combatant={combatant} editable={editable} />

      {/*
        Three inputs and an outcome, in the order the decision is actually made:
        what you are doing, how much, what it will cost, then commit. The amount
        is stepped rather than typed because damage is nudged far more often than
        it is entered — a die roll lands once, then armour and effects adjust it.
      */}
      {editable && (
        <div className={`damage${selected ? "" : " damage-idle"}`}>
          <div className="segment" role="group" aria-label="Damage or heal">
            <button
              type="button"
              className={mode === "damage" ? "on" : ""}
              aria-pressed={mode === "damage"}
              onClick={() => setMode("damage")}
            >
              Damage
            </button>
            <button
              type="button"
              className={mode === "heal" ? "on" : ""}
              aria-pressed={mode === "heal"}
              onClick={() => setMode("heal")}
            >
              Heal
            </button>
          </div>

          <div className="damage-row">
            <div className="stepper amount">
              <button
                type="button"
                className="ghost step"
                disabled={amount === 0}
                aria-label="One less"
                onClick={() => setAmount((value) => Math.max(0, value - 1))}
              >
                −
              </button>
              <input
                type="number"
                min={0}
                value={amount}
                aria-label="Amount"
                onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))}
              />
              <button
                type="button"
                className="ghost step"
                aria-label="One more"
                onClick={() => setAmount((value) => value + 1)}
              >
                +
              </button>
            </div>

            {/*
              A chip rather than a checkbox: it is a mode the next roll is in,
              and it needs to be readable at a glance while the GM is looking at
              the preview rather than at the control.
            */}
            {mode === "damage" && (
              <button
                type="button"
                className={`chip${ignoreArmor ? " on" : ""}`}
                aria-pressed={ignoreArmor}
                onClick={() => setIgnoreArmor((on) => !on)}
              >
                Ignore armor
              </button>
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

          <div className="settings-wide">
            <CharacteristicsPanel combatant={combatant} />
          </div>

          {(combatant.skills?.length ?? 0) > 0 && (
            <button
              type="button"
              className="settings-wide roll-open"
              onClick={() =>
                void openRollWindow({
                  name: combatant.name,
                  skills: combatant.skills ?? [],
                  fatigueGrade: fatigue.difficulty === "none" ? null : fatigue.difficulty,
                  fatigueName: fatigue.name,
                })
              }
            >
              Roll a skill
              <span className="dim">{combatant.skills!.length}</span>
            </button>
          )}

          {/*
            Base and adjustment, not one number. With the base derived from the
            Characteristics, a single field could not hold both "what DEX and
            INT say" and "what this armour costs" — and armour is the common
            case, so it needs somewhere of its own to live.
          */}
          {/*
            The base is editable only when there is nothing to derive it from.
            A creature out of MEG has a final strike_rank and no Characteristics,
            so its base has to stay typeable; a character with Characteristics
            would only be able to disagree with them.
          */}
          {!combatant.characteristics && (
            <>
              <label>
                Init. base
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
                AP base
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
                The two pools, for the same reason: with no POW to derive from,
                somebody has to say what they are. MEG fills Magic in on import
                and leaves Luck at nothing, which is right — creatures do not
                have Luck Points.
              */}
              <label>
                Luck max
                <input
                  type="number"
                  min={0}
                  value={combatant.maxLuckPoints ?? 0}
                  onChange={(event) =>
                    dispatch({
                      type: "combatant/maxLuckPointsChanged",
                      combatantId: combatant.id,
                      maxLuckPoints: Number(event.target.value),
                    })
                  }
                />
              </label>

              <label>
                Magic max
                <input
                  type="number"
                  min={0}
                  value={combatant.maxMagicPoints ?? 0}
                  onChange={(event) =>
                    dispatch({
                      type: "combatant/maxMagicPointsChanged",
                      combatantId: combatant.id,
                      maxMagicPoints: Number(event.target.value),
                    })
                  }
                />
              </label>
            </>
          )}

          <label>
            Init. mod.
            <input
              type="number"
              value={combatant.initiativeModifier ?? 0}
              onChange={(event) =>
                dispatch({
                  type: "combatant/initiativeModifierChanged",
                  combatantId: combatant.id,
                  initiativeModifier: Number(event.target.value),
                })
              }
            />
          </label>

          <label>
            AP mod.
            <input
              type="number"
              value={combatant.actionPointsModifier ?? 0}
              onChange={(event) =>
                dispatch({
                  type: "combatant/actionPointsModifierChanged",
                  combatantId: combatant.id,
                  actionPointsModifier: Number(event.target.value),
                })
              }
            />
          </label>

          {/* What the two above actually add up to, so the modifier is not read blind. */}
          <dl className="settings-total">
            <div>
              <dt>Init. Bonus</dt>
              <dd>{effectiveInitiativeBonus(combatant)}</dd>
            </div>
            <div>
              <dt>Max AP</dt>
              <dd>{baseMaxActionPoints(combatant)}</dd>
            </div>
          </dl>

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
                  <dd>{fatigue.recovery ?? "—"}</dd>
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

              {/*
                The link is what makes the sheet durable — the archive is keyed
                by token id — so it has to be settable after the fact. A
                character imported from a file has no token at all, and a token
                deleted and redrawn comes back with an id nothing points at.
              */}
              <label className="settings-wide">
                Token
                <select
                  value={combatant.tokenId ?? ""}
                  onChange={(event) =>
                    dispatch({
                      type: "combatant/tokenChanged",
                      combatantId: combatant.id,
                      tokenId: event.target.value === "" ? undefined : event.target.value,
                    })
                  }
                >
                  <option value="">Not linked</option>
                  {tokens.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.name}
                    </option>
                  ))}
                  {combatant.tokenId !== undefined &&
                    !tokens.some((token) => token.id === combatant.tokenId) && (
                      <option value={combatant.tokenId}>Token no longer in the scene</option>
                    )}
                </select>
              </label>
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
                {ownerOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
