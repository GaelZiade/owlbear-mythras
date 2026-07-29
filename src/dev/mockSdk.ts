/**
 * Stand-in for the Owlbear SDK, used only by `npm run dev:mock`.
 *
 * The real extension cannot render outside Owlbear: it waits on `OBR.onReady`,
 * which only fires inside the host's iframe, so opening the dev server in a
 * browser shows a blank page. That made every interface change a deploy away
 * from being visible.
 *
 * Vite swaps `@owlbear-rodeo/sdk` for this module when MOCK_OBR is set. It fakes
 * only what the adapters actually call. It is a drawing board, not a simulator:
 * nothing here should be trusted to prove that the real integration works.
 *
 * By default it fakes a GM with a small party. Add `?as=player-1` to the URL to
 * see the panel as that player sees it instead — half the interface is decided
 * by role, and until this existed the player's half could only be looked at by
 * deploying and opening a second browser.
 */

import { reduce, type CombatEvent } from "../core/combat";
import { buildLocations, HUMANOID_PROFILE } from "../core/locations";
import { SCHEMA_VERSION, type Combatant, type CombatState } from "../core/types";
import {
  COMBAT_METADATA_KEY,
  isCombatRequest,
  isEventAllowedForPlayer,
} from "../adapters/owlbear/protocol";

export interface Item {
  id: string;
  name: string;
  createdUserId: string;
  layer: string;
}

export interface ThemeColor {
  main: string;
  contrastText: string;
}

export interface Theme {
  mode: "DARK" | "LIGHT";
  primary: ThemeColor;
  background: { default: string; paper: string };
  text: { primary: string; secondary: string; disabled: string };
}

const THEME: Theme = {
  mode: "DARK",
  primary: { main: "#bb99ff", contrastText: "#1c2033" },
  background: { default: "#1e2231", paper: "#2b3049" },
  text: { primary: "#f4f4f5", secondary: "#a5a5b2", disabled: "#71717f" },
};

const PLAYERS = [
  { id: "player-1", connectionId: "c1", role: "PLAYER" as const, name: "Anathaym", color: "#e06666" },
  { id: "player-2", connectionId: "c2", role: "PLAYER" as const, name: "Zamothis", color: "#6fa8dc" },
];

const ITEMS: Item[] = [
  { id: "token-1", name: "Anathaym", createdUserId: "player-1", layer: "CHARACTER" },
  { id: "token-2", name: "Zamothis", createdUserId: "player-2", layer: "CHARACTER" },
  { id: "token-3", name: "Centaur Raider", createdUserId: "gm", layer: "CHARACTER" },
  { id: "token-4", name: "Kratos the Sorcerer", createdUserId: "gm", layer: "CHARACTER" },
  // Scenery, so "add every token" has something it must leave alone.
  { id: "prop-1", name: "Totem Pole", createdUserId: "gm", layer: "PROP" },
];

/** Only some tokens are "selected", so selected and all behave differently. */
const SELECTION = ["token-1", "token-2"];

/**
 * Who to pretend to be, from `?as=` in the URL. Anything unrecognised is the GM,
 * so the default behaviour of `npm run dev:mock` is unchanged.
 */
const AS_PLAYER =
  PLAYERS.find(
    (player) => player.id === new URLSearchParams(window.location.search).get("as"),
  ) ?? null;

function mockCombatant(id: string, name: string, initiative: number, ownerId?: string): Combatant {
  return {
    id,
    name,
    initiative,
    initiativeBonus: 10,
    actionPoints: 2,
    maxActionPoints: 2,
    locations: buildLocations(HUMANOID_PROFILE, 23),
    defeated: false,
    ...(ownerId === undefined ? {} : { ownerId }),
  };
}

/**
 * A fight already under way, seeded only when impersonating a player.
 *
 * Players cannot start a fight or add anyone to it, so a player opening an empty
 * room sees "the GM has not set up the fight yet" and nothing else — which is
 * correct, and useless for looking at the interface.
 */
function seededFight(): CombatState {
  const combatants = [
    mockCombatant("c-anathaym", "Anathaym", 17, "player-1"),
    mockCombatant("c-zamothis", "Zamothis", 12, "player-2"),
    mockCombatant("c-centaur", "Centaur Raider", 14),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    status: "active",
    round: 1,
    cycle: 1,
    activeTurn: { initiative: 17, combatantIds: ["c-anathaym"] },
    combatants,
  };
}

let roomMetadata: Record<string, unknown> = AS_PLAYER
  ? { [COMBAT_METADATA_KEY]: seededFight() }
  : {};
const metadataListeners = new Set<(metadata: Record<string, unknown>) => void>();

/**
 * Stands in for the GM's client receiving a player's request.
 *
 * The real flow is: player broadcasts, the GM validates against `protocol.ts`
 * and writes. With one browser there is no GM to receive anything, so the mock
 * runs the same check and the same reducer. It deliberately reuses the real
 * authorisation function rather than waving requests through, because a mock
 * that always says yes would hide exactly the bug worth catching here.
 */
function applyAsAbsentGm(data: unknown): void {
  if (!AS_PLAYER || !isCombatRequest(data)) return;

  const current = (roomMetadata[COMBAT_METADATA_KEY] as CombatState | undefined) ?? seededFight();
  if (!isEventAllowedForPlayer(data.event as CombatEvent, AS_PLAYER.id, current)) return;

  roomMetadata = { ...roomMetadata, [COMBAT_METADATA_KEY]: reduce(current, data.event) };
  for (const listener of metadataListeners) listener(roomMetadata);
}

/**
 * Says out loud that this is not Owlbear.
 *
 * The stub announces itself rather than the interface checking for it, so no
 * production component has to know the mock exists. Belt and braces alongside
 * the dev server refusing to serve a manifest: if these fake combatants ever
 * turn up somewhere unexpected, the banner explains why.
 */
function announceMock(): void {
  const banner = document.createElement("div");
  banner.textContent = AS_PLAYER
    ? `MOCK DATA — as ${AS_PLAYER.name}, player`
    : "MOCK DATA — not connected to Owlbear";
  banner.setAttribute(
    "style",
    [
      "position:fixed",
      "inset:0 0 auto 0",
      "z-index:9999",
      "padding:3px 6px",
      "font:600 10px/1.4 system-ui,sans-serif",
      "letter-spacing:.06em",
      "text-align:center",
      "color:#1b1b1b",
      "background:#e3b341",
    ].join(";"),
  );
  document.body.append(banner);
  document.body.style.paddingTop = "20px";
}

const OBR = {
  onReady: (callback: () => void) => {
    queueMicrotask(() => {
      announceMock();
      callback();
    });
  },
  room: {
    getMetadata: async () => roomMetadata,
    setMetadata: async (update: Record<string, unknown>) => {
      roomMetadata = { ...roomMetadata, ...update };
      for (const listener of metadataListeners) listener(roomMetadata);
    },
    onMetadataChange: (callback: (metadata: Record<string, unknown>) => void) => {
      metadataListeners.add(callback);
      return () => metadataListeners.delete(callback);
    },
  },
  player: {
    getRole: async () => (AS_PLAYER ? ("PLAYER" as const) : ("GM" as const)),
    getId: async () => AS_PLAYER?.id ?? "gm",
    getName: async () => AS_PLAYER?.name ?? "GM",
    getColor: async () => AS_PLAYER?.color ?? "#cccccc",
    getSelection: async () => SELECTION,
  },
  party: {
    /**
     * Everyone *except* you, which is what the real API returns.
     *
     * This used to include the impersonated player in their own party, which is
     * the opposite of Owlbear's behaviour and hid a real bug: the owner dropdown
     * is built from this list, so a combatant owned by whoever was looking
     * displayed as belonging to an "Absent player". A mock that is more generous
     * than the thing it stands in for is worse than no mock.
     */
    getPlayers: async () => {
      const GM = { id: "gm", connectionId: "c-gm", role: "GM" as const, name: "GM", color: "#cccccc" };
      const everyone = [...PLAYERS, GM];
      const selfId = AS_PLAYER?.id ?? "gm";
      return everyone.filter((player) => player.id !== selfId);
    },
    onChange: () => () => {},
  },
  scene: {
    items: {
      // The real API takes either a list of ids or a predicate; both are used.
      getItems: async (filter: string[] | ((item: Item) => boolean)) =>
        Array.isArray(filter)
          ? ITEMS.filter((item) => filter.includes(item.id))
          : ITEMS.filter(filter),
    },
  },
  broadcast: {
    sendMessage: async (_channel: string, data: unknown) => applyAsAbsentGm(data),
    onMessage: () => () => {},
  },
  theme: {
    getTheme: async () => THEME,
    onChange: () => () => {},
  },
};

export default OBR;
