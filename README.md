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
- **Import from the Mythras Enemy Generator**: search the catalogue by name,
  race or tag and roll however many you need. The catalogue is fetched once and
  searched locally, so typing costs the site nothing.
- **Characteristics and derived Attributes** as Imperative defines them: enter
  the seven, and the Initiative Bonus, Action Points, Damage Modifier, Magic and
  Luck Points, Healing Rate, Experience Modifier and Hit Points per location all
  follow. Damage already taken is kept.
- **Import a character sheet** exported from the group's online builder: the
  seven Characteristics, the armour worn with its Initiative penalty, and every
  skill and combat style worked out from its formula.
- **Link a combatant to a token** so an imported character follows the token its
  player moves, and a redrawn token finds its sheet again.
- **Roll a skill** in a dialog, against any of the eight difficulty grades, with
  criticals, fumbles and the automatic success and failure ranges applied.
  Fatigue raises the grade on its own.
- **Sheets survive leaving the fight.** Remove somebody from the tracker and add
  their token again: Characteristics, armour, owner, wounds and notes come back.
- **Out of the fight** toggle that skips a combatant in the initiative order.
- **Fatigue** across the table's ten levels. The Initiative and Action Point
  penalties are applied to the order and the pips automatically; the difficulty
  grade, movement and recovery period are shown for you to apply, because a
  combat tracker has no skills, no distances and no clock. From Semi-Conscious
  down, the combatant is skipped entirely.
- **Undo**, sitting next to Next turn — which is the button people misclick.
- Each player edits their own combatant: Hit Points and Armor Points per
  location, Action Points, Initiative, Initiative Bonus and Fatigue. The GM
  controls everything, and everything about the fight itself — starting it,
  advancing the turn, who is in it — stays with the GM alone.

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

Add `?as=player-1` (or `player-2`) to the mock's URL to see the panel as a player
rather than the GM, in a fight already under way. Role decides half of what the
interface shows, so it is worth looking at both before calling a change done.

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

## Installing

In Owlbear Rodeo: *Profile* → **Add Extension** → paste

```
https://gaelziade.github.io/owlbear-mythras/manifest.json
```

That URL always serves whatever is on `main`; every push rebuilds and redeploys
it, with the typecheck and the test suite gating the deploy.

To host your own copy, `npm run build` and publish `dist/` on any static HTTPS
host. If it will live under a subpath rather than a domain root, build with
`vite build --base=/your-path/` so the manifest points at the right place.

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
2. **Creature import** from the [Mythras Encounter Generator](https://mythras.skoll.xyz/),
   fetched live so the catalogue stays current as people add to it. Feasibility
   and the rules for the integration are in [DECISIONS.md](DECISIONS.md#5-importing-from-the-mythras-encounter-generator-planned-phase-2).
3. **Rolls** — done for skills: `core/rolls.ts` plus the dialog that drives it.
   Opposed rolls and combat special effects are not modelled. *(current)*
4. **Character sheets.**

Bug reports and ideas are welcome in
[Issues](https://github.com/GaelZiade/owlbear-mythras/issues).

## Licences

The **code** is MIT (see [LICENSE](LICENSE)).

The **rules content** derives from *Mythras Imperative*, published under the
[ORC License](https://paizo.com/orclicense). "Mythras", the logos and the artwork
of The Design Mechanism are *Reserved Material* and are neither included nor
reproduced here.

Any rulebook PDFs kept locally for reference are excluded in `.gitignore`. Do not
add them.

### Mythras Enemy Generator

The MEG author granted permission to import MEG creatures into Owlbear Rodeo, on
conditions that bind this project: no scraping or bulk downloading of the site,
no charging for access, no iOS or Android port, and the notices below visible in
the tool. They are recorded in [DECISIONS.md](DECISIONS.md) §5 and shown in the
panel under **Notices**.

> Creatures, encounters and statistics imported into this package were created or
> adapted using MeG, the Mythras Enemy Generator (<https://mythras.skoll.xyz/>).
> "Mythras" is a Registered Trademark of The Design Mechanism Inc, and is used
> with permission. This generator uses trademarks and/or copyrights owned by
> Chaosium Inc/Moon Design Publications LLC, which are used under Chaosium Inc's
> Fan Material Policy. We are expressly prohibited from charging you to use or
> access this content. This generator is not published, endorsed, or specifically
> approved by Chaosium Inc. For more information about Chaosium Inc's products,
> please visit [www.chaosium.com](https://www.chaosium.com).
