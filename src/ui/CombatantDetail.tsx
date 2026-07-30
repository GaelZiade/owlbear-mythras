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
  gaitGradeShift,
} from "../core/combat";
import { deriveAttributes } from "../core/characteristics";
import { GAIT_TABLE, gaitRow, movementForGait, type Gait } from "../core/movement";
import { augmentFrom } from "../core/rolls";
import {
  FATIGUE_TABLE,
  fatigueRow,
  recoverFatigue,
  worsenFatigue,
  type FatigueLevel,
} from "../core/fatigue";
import type { Combatant, HitLocation, Weapon, WoundLevel } from "../core/types";
import { applyHealing, previewDamage, previewWeaponDamage, woundLevel } from "../core/wounds";
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
 * What the next hit lands on.
 *
 * A weapon is targeted by name and a location by id, because that is how each
 * one is addressed everywhere else — the archive keys weapons by name and
 * locations by id — and a single `string` would make the two interchangeable
 * exactly where they must not be.
 */
type Target = { kind: "location"; id: string } | { kind: "weapon"; name: string };

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

      {(derived || (movement !== null && movement !== combatant.movementRate)) && (
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
          {movement !== null && movement !== combatant.movementRate && (
            <div>
              <dt>Movement</dt>
              <dd>
                {movement === 0 ? "Immobile" : `${movement} m`}
                <span className="dim"> of {combatant.movementRate}</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {/*
        Run and Sprint as distances rather than multipliers, because ×3 of a
        halved rate is a sum somebody would otherwise do while a fight waits.
        Hidden when the character cannot move at all, where three zeroes say
        nothing the Movement line above has not already said.
      */}
      {movement !== null && movement > 0 && (
        <div className="gaits">
          {editable ? (
            <select
              aria-label="Gait"
              value={combatant.gait ?? "walk"}
              onChange={(event) =>
                dispatch({
                  type: "combatant/gaitChanged",
                  combatantId: combatant.id,
                  gait: event.target.value as Gait,
                })
              }
            >
              {GAIT_TABLE.map((row) => (
                <option key={row.gait} value={row.gait}>
                  {row.name} — {movementForGait(movement, row.gait)} m
                </option>
              ))}
            </select>
          ) : (
            <span className="gait-static">
              {gaitRow(combatant.gait).name} — {movementForGait(movement, combatant.gait ?? "walk")} m
            </span>
          )}

          {/*
            The other two distances stay on screen beside the picker: choosing a
            gait is a decision about what it costs, and comparing 6 with 30 is
            the decision. Hiding the alternatives behind the dropdown would make
            you open it to find out what you were choosing between.
          */}
          <span className="gait-others dim">
            {GAIT_TABLE.filter(({ gait }) => gait !== (combatant.gait ?? "walk"))
              .map((row) => `${row.name} ${movementForGait(movement, row.gait)} m`)
              .join(" · ")}
          </span>

          {gaitRow(combatant.gait).gradeShift > 0 && (
            <span className="gait-cost">
              rolls {gaitRow(combatant.gait).gradeShift} grade
              {gaitRow(combatant.gait).gradeShift > 1 ? "s" : ""} harder
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Passions and spells: reference, read and never edited.
 *
 * Weapons used to be here and are not any more. They earned a place up with the
 * hit locations instead, because a weapon is something a blow lands on rather
 * than something to look up.
 *
 * Spells are a list because Magic Points are already a pool above: knowing what
 * a caster can spend them on is the other half of tracking them.
 */
function Kit({ combatant }: { combatant: Combatant }) {
  const spells = combatant.spells ?? [];
  const passions = combatant.passions ?? [];
  if (spells.length === 0 && passions.length === 0) return null;

  const traditions = [...new Set(spells.map((spell) => spell.tradition ?? "Spells"))];

  return (
    <div className="kit">
      {/*
        With what each is worth as an augment, since that is what a Passion is
        for most of the time and 20% of 57 is not a sum anybody does mid-fight.
        The percentage is still shown, because a Passion is also rolled on its
        own — the roll window lists them for that.
      */}
      {passions.length > 0 && (
        <ul className="passions">
          <li className="settings-caption">Passions</li>
          {passions.map((passion) => (
            <li key={passion.name} className="passion">
              <span className="passion-name">{passion.name}</span>
              <span className="passion-augment dim">+{augmentFrom(passion.value)}</span>
              <span className="passion-value">{passion.value}%</span>
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
  /** `null` for a weapon: it is usable or broken, and has no wound levels. */
  woundAfter: WoundLevel | null;
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

/** The same, for a weapon: no wound levels, and broken at zero. */
function weaponOutcomeFor(
  weapon: Weapon,
  mode: Mode,
  amount: number,
  ignoreArmor: boolean,
): Outcome {
  const max = weapon.maxHitPoints ?? weapon.hitPoints ?? 0;
  if (mode === "heal") {
    return {
      hitPointsAfter: Math.min(max, (weapon.hitPoints ?? 0) + amount),
      woundAfter: null,
      note: null,
    };
  }

  const preview = previewWeaponDamage(weapon, amount, { ignoreArmor });
  return {
    hitPointsAfter: preview.hitPointsAfter,
    woundAfter: null,
    note: preview.broken
      ? "Broken"
      : preview.absorbed > 0
        ? `${preview.absorbed} absorbed by the weapon`
        : null,
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
  /**
   * What the next hit lands on: a hit location, or the weapon being parried
   * with. A weapon is a target like any other — it has Armour Points, it has
   * Hit Points and it breaks — so it is picked the same way rather than getting
   * a second set of controls of its own.
   */
  const [target, setTarget] = useState<Target | null>(null);
  /**
   * Which weapon is in hand, and therefore the one on the target row.
   *
   * Local rather than persisted: a dragon with six attacks made the panel
   * unreadable, and this is "which one am I looking at" rather than a fact about
   * the fight. Switching it costs nothing and changes nobody else's screen.
   */
  const [weaponName, setWeaponName] = useState<string | null>(null);
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
  const weapons = combatant.weapons ?? [];
  const weapon = weapons.find(({ name }) => name === weaponName) ?? weapons[0] ?? null;

  const selectedLocation =
    target?.kind === "location"
      ? (combatant.locations.find(({ id }) => id === target.id) ?? null)
      : null;
  const selectedWeapon = target?.kind === "weapon" ? weapon : null;

  const outcome = selectedLocation
    ? outcomeFor(selectedLocation, mode, amount, ignoreArmor)
    : selectedWeapon
      ? weaponOutcomeFor(selectedWeapon, mode, amount, ignoreArmor)
      : null;
  const targetName = selectedLocation?.name ?? selectedWeapon?.name ?? null;
  const targetHitPoints = selectedLocation?.hitPoints ?? selectedWeapon?.hitPoints ?? 0;

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
    if (selectedLocation) {
      dispatch(
        mode === "damage"
          ? {
              type: "location/damaged",
              combatantId: combatant.id,
              locationId: selectedLocation.id,
              amount,
              ignoreArmor,
            }
          : {
              type: "location/healed",
              combatantId: combatant.id,
              locationId: selectedLocation.id,
              amount,
            },
      );
      return;
    }

    if (selectedWeapon && outcome) {
      // A weapon has one number, so damage and repair are the same event with
      // the arithmetic already done by the preview the user is looking at.
      dispatch({
        type: "weapon/hitPointsChanged",
        combatantId: combatant.id,
        weapon: selectedWeapon.name,
        hitPoints: outcome.hitPointsAfter,
      });
    }
  };

  return (
    <div className="detail">
      <BodyDiagram
        locations={combatant.locations}
        selectedId={target?.kind === "location" ? target.id : null}
        onSelect={(id) => setTarget({ kind: "location", id })}
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
          const isSelected = target?.kind === "location" && location.id === target.id;
          return (
            <li key={location.id}>
              <button
                type="button"
                className={`location location-${wound}${isSelected ? " location-selected" : ""}`}
                aria-pressed={isSelected}
                onClick={() => setTarget({ kind: "location", id: location.id })}
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

      {/*
        The weapon in hand, targeted the same way a limb is.
        
        It sits in the locations block rather than in a section of its own,
        because during a fight it is one more thing a blow can land on: a parry
        puts the weapon in the way. A dragon with six attacks used to print six
        rows here and push everything else off the screen, so the list became a
        picker and only the chosen one is a target.
      */}
      {weapon && (
        <div className="weapon-target">
          {weapons.length > 1 ? (
            <select
              aria-label="Weapon in hand"
              value={weapon.name}
              onChange={(event) => {
                setWeaponName(event.target.value);
                setTarget({ kind: "weapon", name: event.target.value });
              }}
            >
              {weapons.map((entry) => (
                <option key={entry.name} value={entry.name}>
                  {entry.name}
                  {entry.maxHitPoints !== undefined &&
                    ` — ${entry.hitPoints ?? entry.maxHitPoints}/${entry.maxHitPoints}`}
                </option>
              ))}
            </select>
          ) : (
            <span className="weapon-only">{weapon.name}</span>
          )}

          <button
            type="button"
            className={`location weapon-hit${
              target?.kind === "weapon" ? " location-selected" : ""
            }${weapon.hitPoints === 0 ? " location-major" : ""}`}
            aria-pressed={target?.kind === "weapon"}
            onClick={() => setTarget({ kind: "weapon", name: weapon.name })}
          >
            <span className="location-name">
              {[weapon.damage, weapon.size, weapon.reach && `reach ${weapon.reach}`]
                .filter(Boolean)
                .join(" · ") || "Weapon"}
            </span>
            {weapon.armorPoints !== undefined && (
              <span className="location-armor" title="Armor Points">
                {weapon.armorPoints}
              </span>
            )}
            {weapon.maxHitPoints !== undefined && (
              <span className="location-hp">
                {weapon.hitPoints ?? weapon.maxHitPoints}
                <span className="dim">/{weapon.maxHitPoints}</span>
              </span>
            )}
          </button>

          {weapon.effects && <p className="weapon-effects">{weapon.effects}</p>}
        </div>
      )}

      {/*
        Three inputs and an outcome, in the order the decision is actually made:
        what you are doing, how much, what it will cost, then commit. The amount
        is stepped rather than typed because damage is nudged far more often than
        it is entered — a die roll lands once, then armour and effects adjust it.
      */}
      {editable && (
        <div className={`damage${target ? "" : " damage-idle"}`}>
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

          {outcome && targetName ? (
            <div className={`preview preview-${outcome.woundAfter ?? "unharmed"}`}>
              <span className="preview-line">
                <strong>{targetName}</strong> {targetHitPoints} → {outcome.hitPointsAfter}
                {outcome.woundAfter && ` · ${WOUND_LABEL[outcome.woundAfter]}`}
              </span>
              {outcome.note && <span className="preview-note">{outcome.note}</span>}
            </div>
          ) : (
            <p className="preview preview-empty">
              Pick a hit location{weapon ? " or the weapon" : ""} above.
            </p>
          )}

          <button type="button" className="apply" disabled={!target} onClick={apply}>
            {mode === "damage" ? "Apply damage" : "Apply healing"}
          </button>
        </div>
      )}

      <Resources combatant={combatant} editable={editable} />

      <Kit combatant={combatant} />

      {/*
        Fatigue in a block of its own, between what changes every Turn and
        the setup that changes once. It is touched a few times a fight — a
        failed Endurance roll costs a level — which is often enough that
        burying it under the token and owner dropdowns was wrong, and rare
        enough that it does not belong up with the Hit Points.
      */}
      {editable && (
        <div className="fatigue-block">
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
                  ...(combatant.gait && combatant.gait !== "walk"
                    ? { gaitName: gaitRow(combatant.gait).name, gaitShift: gaitGradeShift(combatant) }
                    : {}),
                  ...(combatant.passions ? { passions: combatant.passions } : {}),
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

          {selectedLocation && (
            <div className="settings-location">
              <span className="settings-caption">{selectedLocation.name}</span>

              {/* Not floored at zero: below it is where Serious and Major wounds live. */}
              <label>
                HP
                <input
                  type="number"
                  max={selectedLocation.maxHitPoints}
                  value={selectedLocation.hitPoints}
                  onChange={(event) =>
                    dispatch({
                      type: "location/hitPointsChanged",
                      combatantId: combatant.id,
                      locationId: selectedLocation.id,
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
                  value={selectedLocation.maxHitPoints}
                  onChange={(event) =>
                    dispatch({
                      type: "location/maxHitPointsChanged",
                      combatantId: combatant.id,
                      locationId: selectedLocation.id,
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
                  value={selectedLocation.armorPoints}
                  onChange={(event) =>
                    dispatch({
                      type: "location/armorChanged",
                      combatantId: combatant.id,
                      locationId: selectedLocation.id,
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
