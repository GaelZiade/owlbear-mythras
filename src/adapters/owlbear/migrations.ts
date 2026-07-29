import { createEmptyState, SCHEMA_VERSION, type CombatState } from "../../core/types";

/**
 * Migrations for the persisted state.
 *
 * Any change to the shape of `CombatState` means bumping `SCHEMA_VERSION` and
 * adding the matching migration here. The alternative is breaking combat for
 * games already in progress, which is exactly what this module exists to avoid.
 *
 * Each migration takes the state at the previous version and returns the next.
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  /**
   * 1 → 2: `activeInitiative` becomes `activeTurn`.
   *
   * Version 1 recorded only the initiative value holding the turn and worked out
   * who was taking it on every read, which lit up tied combatants who had no
   * Action Points and were about to be skipped. Version 2 records the turn's
   * membership when it opens.
   *
   * Reconstructing that membership for a fight already in progress is a guess,
   * so this takes the conservative one: everyone on that initiative who can
   * still act. A GM mid-combat sees the marker settle onto the right people from
   * the next turn onward rather than losing the fight.
   */
  1: (state) => {
    const initiative = state["activeInitiative"];
    const combatants = Array.isArray(state["combatants"]) ? state["combatants"] : [];
    const { activeInitiative: _replaced, ...rest } = state;

    const activeTurn =
      typeof initiative === "number"
        ? {
            initiative,
            combatantIds: combatants
              .filter(
                (combatant: Record<string, unknown>) =>
                  combatant["initiative"] === initiative &&
                  combatant["defeated"] !== true &&
                  typeof combatant["actionPoints"] === "number" &&
                  combatant["actionPoints"] > 0,
              )
              .map((combatant: Record<string, unknown>) => combatant["id"]),
          }
        : null;

    return { ...rest, activeTurn, schemaVersion: 2 };
  },

  /**
   * 2 → 3: character sheets outlive the roster, and the room remembers players.
   *
   * Both are additive, so an existing fight carries over untouched — it simply
   * starts with an empty archive. Nothing can be reconstructed for combatants
   * removed before this version: their sheets were genuinely gone.
   */
  2: (state) => ({ ...state, characters: {}, knownPlayers: [], schemaVersion: 3 }),
};

/**
 * Normalises whatever is in the metadata up to the current schema.
 *
 * Returns an empty state for anything unrecognisable or from the future. Losing
 * a fight in progress is annoying; carrying a corrupt state through a whole
 * session is worse.
 */
export function migrate(raw: unknown): CombatState {
  if (typeof raw !== "object" || raw === null) return createEmptyState();

  let state = raw as Record<string, unknown>;
  let version = typeof state["schemaVersion"] === "number" ? state["schemaVersion"] : 0;

  if (version > SCHEMA_VERSION) {
    // Written by a newer build of the extension: we cannot read it safely.
    return createEmptyState();
  }

  while (version < SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) return createEmptyState();
    state = migration(state);
    version += 1;
  }

  if (!isCombatState(state)) return createEmptyState();

  // Belt and braces: a state written at the current version by a build that
  // crashed mid-write could still be missing an additive field.
  return {
    ...state,
    characters: isRecord(state.characters) ? state.characters : {},
    knownPlayers: Array.isArray(state.knownPlayers) ? state.knownPlayers : [],
  };
}

function isRecord(value: unknown): value is Record<string, never> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCombatState(
  value: Record<string, unknown>,
): value is CombatState & Record<string, unknown> {
  return (
    (value["status"] === "idle" || value["status"] === "active") &&
    typeof value["round"] === "number" &&
    typeof value["cycle"] === "number" &&
    Array.isArray(value["combatants"])
  );
}
