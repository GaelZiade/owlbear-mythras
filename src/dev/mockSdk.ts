/**
 * Stand-in for the Owlbear SDK, used only by `npm run dev:mock`.
 *
 * The real extension cannot render outside Owlbear: it waits on `OBR.onReady`,
 * which only fires inside the host's iframe, so opening the dev server in a
 * browser shows a blank page. That made every interface change a deploy away
 * from being visible.
 *
 * Vite swaps `@owlbear-rodeo/sdk` for this module when MOCK_OBR is set. It fakes
 * only what the adapters actually call, and it fakes a GM with a small party so
 * the whole panel is reachable. It is a drawing board, not a simulator: nothing
 * here should be trusted to prove that the real integration works.
 */

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

let roomMetadata: Record<string, unknown> = {};
const metadataListeners = new Set<(metadata: Record<string, unknown>) => void>();

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
  banner.textContent = "MOCK DATA — not connected to Owlbear";
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
    getRole: async () => "GM" as const,
    getId: async () => "gm",
    getSelection: async () => SELECTION,
  },
  party: {
    getPlayers: async () => PLAYERS,
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
    sendMessage: async () => {},
    onMessage: () => () => {},
  },
  theme: {
    getTheme: async () => THEME,
    onChange: () => () => {},
  },
};

export default OBR;
