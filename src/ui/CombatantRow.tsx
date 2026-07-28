import { useState } from "react";

import { dispatch, type Session } from "../adapters/owlbear/store";
import type { TurnStatus } from "../core/combat";
import { rollInitiative } from "../core/dice";
import type { Combatant, WoundLevel } from "../core/types";
import { worstWound } from "../core/wounds";
import { CombatantDetail } from "./CombatantDetail";
import { ChevronDown, ChevronRight, Dice, Skull, Trash } from "./icons";
import { canEdit } from "./useSession";

const WOUND_LABEL: Record<WoundLevel, string> = {
  unharmed: "",
  minor: "Minor",
  serious: "Serious",
  major: "Major",
};

interface Props {
  combatant: Combatant;
  session: Session;
  status: TurnStatus;
}

/**
 * Action Points as pips.
 *
 * The rulebook suggests tracking them with poker chips, and a row of filled and
 * empty pips reads at a glance in a way "2/3" does not. Past six the pips stop
 * being scannable and it falls back to numbers.
 */
function ActionPoints({ current, max }: { current: number; max: number }) {
  if (max > 6) {
    return (
      <span className="pips pips-numeric">
        {current}
        <span className="dim">/{max}</span>
      </span>
    );
  }

  return (
    <span className="pips" aria-hidden="true">
      {Array.from({ length: max }, (_, index) => (
        <i key={index} className={index < current ? "pip pip-on" : "pip"} />
      ))}
    </span>
  );
}

export function CombatantRow({ combatant, session, status }: Props) {
  const [expanded, setExpanded] = useState(false);
  const editable = canEdit(session, combatant);
  const isGm = session.role === "GM";
  const wound = worstWound(combatant.locations);

  const changeActionPoints = (delta: number) =>
    dispatch({ type: "actionPoints/changed", combatantId: combatant.id, delta });

  return (
    <li className={`row row-${status}${combatant.defeated ? " row-defeated" : ""}`}>
      <div className="row-main">
        <button
          type="button"
          className="ghost expand"
          aria-expanded={expanded}
          aria-label={expanded ? `Hide ${combatant.name} details` : `Show ${combatant.name} details`}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {editable ? (
          <input
            className="initiative"
            type="number"
            value={combatant.initiative}
            aria-label={`${combatant.name} initiative`}
            onChange={(event) =>
              dispatch({
                type: "combatant/initiativeChanged",
                combatantId: combatant.id,
                initiative: Number(event.target.value),
              })
            }
          />
        ) : (
          <span className="initiative initiative-static">{combatant.initiative}</span>
        )}

        <span className="identity">
          <span className="name">{combatant.name}</span>
          {wound !== "unharmed" && (
            <span className={`wound wound-${wound}`}>{WOUND_LABEL[wound]}</span>
          )}
        </span>

        <span className="action-points">
          <button
            type="button"
            className="ghost step"
            disabled={!editable || combatant.actionPoints === 0}
            aria-label={`Spend an Action Point for ${combatant.name}`}
            onClick={() => changeActionPoints(-1)}
          >
            −
          </button>
          <ActionPoints current={combatant.actionPoints} max={combatant.maxActionPoints} />
          <button
            type="button"
            className="ghost step"
            disabled={!editable || combatant.actionPoints >= combatant.maxActionPoints}
            aria-label={`Give back an Action Point to ${combatant.name}`}
            onClick={() => changeActionPoints(+1)}
          >
            +
          </button>
        </span>

        {editable && (
          <button
            type="button"
            className="ghost"
            title="Roll initiative"
            aria-label={`Roll initiative for ${combatant.name}`}
            onClick={() =>
              dispatch({
                type: "combatant/initiativeChanged",
                combatantId: combatant.id,
                initiative: rollInitiative(combatant.initiativeBonus),
              })
            }
          >
            <Dice size={14} />
          </button>
        )}

        <button
          type="button"
          className={combatant.defeated ? "ghost danger on" : "ghost"}
          disabled={!editable}
          title="Out of the fight — skipped in initiative"
          aria-pressed={combatant.defeated}
          aria-label={`Mark ${combatant.name} out of the fight`}
          onClick={() => dispatch({ type: "combatant/defeatedToggled", combatantId: combatant.id })}
        >
          <Skull size={14} />
        </button>

        {isGm && (
          <button
            type="button"
            className="ghost"
            title="Remove from combat"
            aria-label={`Remove ${combatant.name} from combat`}
            onClick={() => dispatch({ type: "combatant/removed", combatantId: combatant.id })}
          >
            <Trash size={14} />
          </button>
        )}
      </div>

      {expanded && (
        <CombatantDetail combatant={combatant} session={session} editable={editable} />
      )}
    </li>
  );
}
