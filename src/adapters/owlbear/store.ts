import OBR from "@owlbear-rodeo/sdk";

import { reduce, type CombatEvent } from "../../core/combat";
import { createEmptyState, type CombatState } from "../../core/types";
import { migrate } from "./migrations";
import {
  COMBAT_METADATA_KEY,
  isCombatRequest,
  isEventAllowedForPlayer,
  REQUEST_CHANNEL,
} from "./protocol";

/**
 * Bridge between the combat engine and Owlbear Rodeo.
 *
 * State lives in the room metadata rather than the scene's, so a fight survives
 * a map change. It is stored as a single object: one change is one write and one
 * sync, instead of one per combatant.
 *
 * Only the GM's client writes. Players send requests over the broadcast channel
 * and the GM decides. See `protocol.ts`.
 */

export interface PartyMember {
  id: string;
  name: string;
  color: string;
}

export interface Session {
  state: CombatState;
  role: "GM" | "PLAYER";
  playerId: string;
  /** Whoever is asking, as a party member. `null` before the session connects. */
  self: PartyMember | null;
  /** Other connected players, for assigning who controls which combatant. */
  party: PartyMember[];
  /** False when no GM is connected: nobody can apply changes. */
  gmPresent: boolean;
  /** Whether there is a previous state to step back to. GM only. */
  canUndo: boolean;
  /**
   * Set when the last write to the room was refused, cleared when one lands.
   *
   * Non-null means the panel and the room disagree and a reload will lose
   * whatever is on screen.
   */
  writeError: string | null;
  ready: boolean;
}

/**
 * Undo history, kept only in memory on the GM's client.
 *
 * It is not persisted: a misclick needs undoing seconds later, not after a
 * reload, and writing every intermediate state to the room metadata would cost
 * a network round trip per click for something nobody would use.
 */
const HISTORY_LIMIT = 40;
let history: CombatState[] = [];

let session: Session = {
  state: createEmptyState(),
  role: "PLAYER",
  playerId: "",
  self: null,
  party: [],
  gmPresent: false,
  canUndo: false,
  writeError: null,
  ready: false,
};

const listeners = new Set<() => void>();

function setSession(update: Partial<Session>): void {
  session = { ...session, ...update };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession(): Session {
  return session;
}

/**
 * Serialised, coalescing writer.
 *
 * Every write carries the whole combat state, so two of them in flight at once
 * race: if the older one lands last, the room is left holding stale data and
 * whatever happened in between is silently lost. Firing one write per click made
 * that easy to hit — adding three tokens in a row would reliably drop one.
 *
 * So writes go one at a time, and anything queued while a write is in flight is
 * replaced rather than queued up: only the newest state is worth sending.
 */
let pendingWrite: CombatState | null = null;
let writing = false;

async function flushWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pendingWrite) {
      const next = pendingWrite;
      pendingWrite = null;
      await OBR.room.setMetadata({ [COMBAT_METADATA_KEY]: next });
      if (session.writeError !== null) setSession({ writeError: null });
    }
  } finally {
    writing = false;
  }
}

/**
 * Queues a write and reports whether it landed.
 *
 * The rejection used to be discarded — `void flushWrites()` with no catch — and
 * that hid the worst failure this extension can have. Owlbear caps how much a
 * room's metadata can hold, and an over-large write is refused; the panel went
 * on showing local state that the room had never accepted, so everything looked
 * right until a reload put the last successfully saved state back. Losing an
 * imported character that way is silent and total.
 *
 * A failed write now says so, loudly, because there is nothing this code can do
 * about it and the person at the keyboard can.
 */
function persist(state: CombatState): void {
  pendingWrite = state;
  void flushWrites().catch((cause: unknown) => {
    const detail = cause instanceof Error ? cause.message : String(cause);
    setSession({ writeError: detail });
    pendingWrite = null;
  });
}

/** True while our own writes are still settling, so incoming echoes are stale. */
function hasUnsettledWrites(): boolean {
  return writing || pendingWrite !== null;
}

/** Applies an event on the GM's client, recording the previous state for undo. */
function applyAsGm(event: CombatEvent): void {
  const previous = session.state;
  const next = reduce(previous, event);
  if (next === previous) return;

  history = [...history.slice(-(HISTORY_LIMIT - 1)), previous];
  setSession({ state: next, canUndo: true });
  persist(next);
}

/**
 * Applies an event.
 *
 * The GM reduces and persists immediately without waiting for the metadata to
 * come back, so the interface responds at once and the write only confirms.
 * A player sends it to the GM and waits for the state to return.
 */
export function dispatch(event: CombatEvent): void {
  if (session.role === "GM") {
    applyAsGm(event);
    return;
  }

  void OBR.broadcast.sendMessage(REQUEST_CHANNEL, { event }, { destination: "REMOTE" });
}

/** Steps back to the state before the last change. GM only. */
export function undo(): void {
  if (session.role !== "GM") return;

  const previous = history[history.length - 1];
  if (!previous) return;

  history = history.slice(0, -1);
  setSession({ state: previous, canUndo: history.length > 0 });
  persist(previous);
}

/** Resolves the player id Owlbear associates with a connection. */
async function playerIdForConnection(connectionId: string): Promise<string | undefined> {
  const players = await OBR.party.getPlayers();
  return players.find((player) => player.connectionId === connectionId)?.id;
}

async function handlePlayerRequest(event: { data: unknown; connectionId: string }): Promise<void> {
  if (!isCombatRequest(event.data)) return;

  const playerId = await playerIdForConnection(event.connectionId);
  if (!playerId) return;
  if (!isEventAllowedForPlayer(event.data.event, playerId, session.state)) return;

  applyAsGm(event.data.event);
}

function readState(metadata: Record<string, unknown>): CombatState {
  return migrate(metadata[COMBAT_METADATA_KEY]);
}

/**
 * The party, including whoever is asking.
 *
 * `OBR.party.getPlayers()` returns *other* players and leaves you out, which is
 * why `gmPresent` below has to short-circuit on your own role. Left alone, that
 * omission reached the interface: a token the GM created is owned by the GM, the
 * GM was never in this list, and so their own combatant displayed as belonging
 * to an "Absent player" and could not be reassigned to themselves.
 *
 * Self is put first because it is the answer most of the time.
 */
function toPartyMembers(
  players: ReadonlyArray<{ id: string; name: string; color: string }>,
  self: PartyMember | null,
): PartyMember[] {
  const others = players.map(({ id, name, color }) => ({ id, name, color }));
  if (!self || others.some((member) => member.id === self.id)) return others;
  return [self, ...others];
}

/**
 * Connects to Owlbear. Returns the cleanup function.
 * Must be called inside `OBR.onReady`.
 */
export async function connect(): Promise<() => void> {
  const [role, playerId, playerName, playerColor, metadata, players] = await Promise.all([
    OBR.player.getRole(),
    OBR.player.getId(),
    OBR.player.getName(),
    OBR.player.getColor(),
    OBR.room.getMetadata(),
    OBR.party.getPlayers(),
  ]);

  const self: PartyMember = { id: playerId, name: playerName, color: playerColor };

  setSession({
    role,
    playerId,
    self,
    state: readState(metadata),
    party: toPartyMembers(players, self),
    gmPresent: role === "GM" || players.some((player) => player.role === "GM"),
    ready: true,
  });

  /**
   * Records who has been in the room, on a real party change only.
   *
   * This used to also run once during `connect`, and that was a write on load —
   * the single most dangerous thing this module can do. `getMetadata` can answer
   * before the room has settled; `readState` turns that into an empty fight; and
   * the write then cemented the empty fight over the real one. Everything went:
   * the roster, the wounds, the imported sheets. It looked like nothing was
   * persisting, when in fact the load was destroying what had persisted.
   *
   * Nothing is written until a user does something, or the party genuinely
   * changes — by which point the room has certainly loaded, because its own
   * events are what woke us.
   */
  const rememberPlayers = (seen: ReadonlyArray<{ id: string; name: string }>) => {
    if (session.role !== "GM") return;
    // A write still in flight means `session.state` is mid-change; adding to it
    // now would race the reducer.
    if (hasUnsettledWrites()) return;
    const players = [self, ...seen].map(({ id, name }) => ({ id, name }));
    const known = new Set(session.state.knownPlayers.map((player) => player.id));
    if (players.every((player) => known.has(player.id))) return;
    dispatch({ type: "players/seen", players });
  };

  const unsubscribers = [
    OBR.room.onMetadataChange((updated) => {
      // Our own writes come back through here. While any are still settling the
      // local state is the newer one, and adopting the echo would undo whatever
      // was clicked in the meantime.
      if (hasUnsettledWrites()) return;
      setSession({ state: readState(updated) });
    }),
    OBR.party.onChange((updated) => {
      setSession({
        party: toPartyMembers(updated, session.self),
        gmPresent: session.role === "GM" || updated.some((player) => player.role === "GM"),
      });
      rememberPlayers(updated);
    }),
  ];

  if (role === "GM") {
    unsubscribers.push(
      OBR.broadcast.onMessage(REQUEST_CHANNEL, (event) => {
        void handlePlayerRequest(event);
      }),
    );
  }

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
