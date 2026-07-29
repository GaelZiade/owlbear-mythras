import { useState } from "react";

import { dispatch } from "../adapters/owlbear/store";
import {
  CHARACTERISTICS,
  deriveAttributes,
  emptyCharacteristics,
  HUMAN_MOVEMENT_RATE,
  type Characteristic,
} from "../core/characteristics";
import type { Combatant } from "../core/types";

/**
 * The seven Characteristics, and everything Imperative derives from them.
 *
 * Collapsed by default. These are set once at creation and then rarely touched,
 * so they must not take space from the numbers that change every Round.
 *
 * Applying them rewrites the Initiative Bonus, the Action Points and the Hit
 * Points of every recognised location — which is the point, but is also why it
 * is a button rather than something that happens as you type: half-entered
 * Characteristics would otherwise rewrite a live combatant's Hit Points on
 * every keystroke.
 */

interface Props {
  combatant: Combatant;
}

export function CharacteristicsPanel({ combatant }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => combatant.characteristics ?? emptyCharacteristics());

  const derived = deriveAttributes(draft);
  const complete = CHARACTERISTICS.every((key) => draft[key] > 0);
  const saved = combatant.characteristics;
  const dirty =
    saved === undefined || CHARACTERISTICS.some((key) => saved[key] !== draft[key]);

  const set = (key: Characteristic, value: number) =>
    setDraft((current) => ({ ...current, [key]: Math.max(0, value) }));

  return (
    <div className="chars">
      <button
        type="button"
        className="chars-toggle"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span>Characteristics</span>
        <span className="dim">
          {saved ? CHARACTERISTICS.map((key) => saved[key]).join(" · ") : "not set"}
        </span>
      </button>

      {open && (
        <>
          <div className="chars-grid">
            {CHARACTERISTICS.map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  min={0}
                  value={draft[key]}
                  onChange={(event) => set(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>

          {/*
            Shown live from the draft, so the effect of a change is visible
            before it is committed — the same reason the damage panel previews a
            wound instead of just applying it.
          */}
          <dl className="chars-derived">
            <div>
              <dt>Action Points</dt>
              <dd>{derived.actionPoints}</dd>
            </div>
            <div>
              <dt>Init. Bonus</dt>
              <dd>{derived.initiativeBonus}</dd>
            </div>
            <div>
              <dt>Damage Mod.</dt>
              <dd>{derived.damageModifier}</dd>
            </div>
            <div>
              <dt>Magic Points</dt>
              <dd>{derived.magicPoints}</dd>
            </div>
            <div>
              <dt>Luck Points</dt>
              <dd>{derived.luckPoints}</dd>
            </div>
            <div>
              <dt>Healing Rate</dt>
              <dd>{derived.healingRate}</dd>
            </div>
            <div>
              <dt>Exp. Mod.</dt>
              <dd>
                {derived.experienceModifier >= 0 ? "+" : ""}
                {derived.experienceModifier}
              </dd>
            </div>
            <div>
              <dt>Movement</dt>
              <dd>{HUMAN_MOVEMENT_RATE} m</dd>
            </div>
          </dl>

          <p className="chars-note">
            Applying sets the Initiative Bonus, Action Points and Hit Points per location. Damage
            already taken is kept.
          </p>

          <button
            type="button"
            className="apply"
            disabled={!complete || !dirty}
            onClick={() =>
              dispatch({
                type: "combatant/characteristicsChanged",
                combatantId: combatant.id,
                characteristics: draft,
              })
            }
          >
            {complete ? "Apply characteristics" : "Fill in all seven"}
          </button>
        </>
      )}
    </div>
  );
}
