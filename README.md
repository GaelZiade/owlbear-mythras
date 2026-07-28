# Mythras for Owlbear Rodeo

An open source extension that runs **Mythras** combat inside Owlbear Rodeo:
initiative by Cycles, Action Points, and wounds by hit location.

> Status: phase 1 in development. See [DECISIONS.md](DECISIONS.md) for the design
> and the decision log.

## What it does

- **Initiative** highest to lowest, with ties acting simultaneously, and
  `1d10 + Initiative Bonus` rolled for whichever tokens you have selected.
- **Round → Cycle → Turn**, the real structure of Mythras combat. When a Cycle
  runs out another opens for whoever still has Action Points; when nobody does,
  the Round ends and points are restored automatically.
- **Action Points** spendable at any moment, not only on your own turn, because
  parries and evades cost points too.
- **Hit Points and Armor Points per location**, with the wound level (minor,
  serious, major) derived from what is left.
- **A clickable body diagram** carrying each location's d20 range, so you pick
  where a blow landed by pointing at it.
- **Damage preview** before you commit: how many points would remain, what wound
  it would cause, and how much the armor absorbed.
- **Out of the fight** toggle that skips a combatant in the initiative order.
- **Undo**, sitting next to Next turn — which is the button people misclick.
- Each player edits their own combatant's Action Points, Hit Points and
  Initiative. The GM controls everything.

## Development

```bash
npm install
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server for use inside Owlbear |
| `npm run dev:mock` | Dev server with a stubbed SDK, viewable in a plain browser tab |
| `npm test` | Rules engine tests |
| `npm run typecheck` | Type checking |
| `npm run build` | Produces `dist/`, ready to publish |

`npm run dev` on its own shows a blank page in a browser: the extension waits on
`OBR.onReady`, which only fires inside Owlbear's iframe. That is expected. Use
`npm run dev:mock` to work on the interface without deploying — it fakes a GM
with a small party so the whole panel is reachable. It is a drawing board, not a
simulator: it proves nothing about the real integration.

## Test room

Owlbear accepts extensions served from `localhost`, so nothing needs deploying to
iterate.

1. **Make a room.** Go to [owlbear.rodeo](https://www.owlbear.rodeo), sign in and
   hit *Create Room*. Build a scene and drop two or three tokens on it: with no
   selectable tokens there is nothing to add to the fight.
2. **Start the server.** `npm run dev`. The port is pinned to 5173 with
   `strictPort` so the manifest URL never changes underneath you.
3. **Add the extension.** In Owlbear, *Profile* → **Add Extension** → paste
   `http://localhost:5173/manifest.json`.
4. **As GM.** Select tokens, add them, roll initiative, start combat.
5. **As a player.** Open the room's invite link in an incognito window; that
   session joins as `PLAYER`. You have to add the extension there too, because
   it installs per profile rather than per room.

Notes:

- The extension is served over HTTP and Owlbear over HTTPS. Browsers treat
  `localhost` as a trustworthy origin, so Chrome and Edge allow it; Firefox may
  be stricter.
- If something looks stale after a code change, close and reopen the panel: the
  iframe reloads wholesale.

## Installing in Owlbear

1. `npm run build` and publish `dist/` on any static HTTPS host.
2. *Profile* → **Add Extension** → the URL of your `manifest.json`.

## Architecture

```
src/
  core/       Mythras rules. No SDK import anywhere, testable in plain Node.
  adapters/   Owlbear integration: persistence, sync, tokens.
  ui/         React components.
  dev/        Stubbed SDK for `dev:mock`. Never shipped.
```

The rule everything else rests on: **`core/` does not know Owlbear exists**. The
combat engine is a pure `reduce(state, event) → state`, so a fight's behaviour is
verified without starting anything. The test suite replays the rulebook's own
Anathaym example step by step.

### Synchronisation

State lives in the room metadata and **only the GM's client writes**. Players
send requests over the broadcast channel; the GM validates and applies them. No
two writers ever compete for the same data.

The consequence is that **with no GM connected, changes do not apply**. The
interface says so. This is a deliberate trade: a frozen, visible fight beats two
clients holding different truths.

## Roadmap

1. **Combat** — initiative, Cycles, Action Points, wounds by location. *(current)*
2. **Rolls** — automatic success, failure, critical and fumble grading with
   selectable difficulty grades.
3. **Character sheets.**

## Licences

The **code** is MIT (see [LICENSE](LICENSE)).

The **rules content** derives from *Mythras Imperative*, published under the
[ORC License](https://paizo.com/orclicense). "Mythras", the logos and the artwork
of The Design Mechanism are *Reserved Material* and are neither included nor
reproduced here.

Any rulebook PDFs kept locally for reference are excluded in `.gitignore`. Do not
add them.
