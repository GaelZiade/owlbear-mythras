# owlbear-mythras

An Owlbear Rodeo extension that runs **Mythras** combat: initiative by Cycles,
Action Points, Fatigue, and wounds tracked per hit location. TypeScript, React,
Vite. Built by and for one table, published free under MIT.

The project owner is a Spanish speaker and prefers replies in Spanish. Every
identifier, comment, commit message and string in the product is English.

## The rule that decides what gets built

> Does this replace **a number the player would otherwise write on paper**, or
> **a decision they would say out loud**?

Track the first. Never automate the second. This is the owner's rule and it has
already settled several proposals:

- **In:** Action Points, Fatigue, wounds per location, Luck and Magic Points,
  the sheet's values so nobody retypes them, a skill roll against a target.
- **Out:** opposed rolls, comparing levels of success, choosing Special Effects,
  automatic damage. Those happen above the table and the players read damage off
  their own printed sheets anyway.

This is not Foundry and is not trying to be. Owlbear abstracts a battlefield and
tracks resources; the rules live with the people playing.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Vitest. 329 tests, all of `core/` and the adapters |
| `npm run typecheck` | `tsc --noEmit`. `exactOptionalPropertyTypes` is on |
| `npm run dev` | Dev server for use inside Owlbear (port 5173, pinned) |
| `npm run dev:mock` | Stubbed SDK on 5174, viewable in a plain browser tab |
| `npm run build` | Produces `dist/` |

`main` deploys to GitHub Pages on every push. **The owner publishes straight to
`main`** — no pull requests unless asked.

## Architecture

```
src/
  core/       Mythras rules. No SDK import anywhere. Pure, testable in plain Node.
  adapters/   Owlbear (store, codec, protocol, tokens, windows), MEG, sheet import.
  ui/         React components + styles.css.
  dev/        Stubbed SDK for dev:mock. Never shipped.
reference/    The Imperative SRD. Every rule should trace to a line in it.
```

**`core/` does not know Owlbear exists.** The engine is a pure
`reduce(state, event) => state`, which is why a fight's behaviour can be verified
without starting anything.

## Where the rules come from

`reference/mythras-imperative-srd.md` is the ORC-licensed SRD, checked in
verbatim with its own notice. **Read it before implementing a rule — do not work
from memory.** Two recent examples of why: a Passion augment adds 20% *of the
Passion's value*, not a flat 20; and the eighth Difficulty Grade is called
*Hopeless*, which this code got wrong until the SRD arrived.

`reference/README.md` records what the SRD does **not** settle. Where it is
silent, say so rather than filling the gap from the core rules — those are
Reserved Material and cannot be reproduced.

The extension also carries MEG and Chaosium notices as a condition of importing
MEG content. They are in `src/ui/Notices.tsx`, reachable by players as well as
the GM, and must stay that way.

## Constraints learned the hard way

Each of these cost real debugging. `DECISIONS.md` has the full accounts.

1. **Room metadata caps at 16 kB, and the failure is invisible.** Owlbear
   refuses an oversized write from its own message handler, so the promise you
   await never rejects. State is packed *and* deflated before writing
   (`adapters/owlbear/codec.ts`); fifty sheets fit in 9 kB. Measure before
   writing, never after. §5f-bis, §5f-ter.
2. **Never write to the room during `connect`.** A read that answers before the
   room settles produces an empty fight, and writing it cements the empty fight
   over the real one. This presented as "nothing persists" when persistence was
   fine and the *load* was destroying it. §5g.
3. **Only the GM's client writes.** Players send requests over broadcast and the
   GM validates them against the player id Owlbear reports for the connection —
   never an id inside the message. `adapters/owlbear/protocol.ts`.
4. **`OBR.party.getPlayers()` excludes you.** The mock used to be more generous
   than the real API and hid a bug for weeks. Keep the mock strict.
5. **Writes coalesce.** Every write carries the whole state, so two in flight
   race. One at a time, newest wins.

## Conventions

- **Comments explain why, not what.** The codebase reads like prose and the
  interesting comments are the ones recording a decision or a trap. Match the
  surrounding density; do not add narration.
- **Never abbreviate "Action Points" or "Armor Points" to AP.** Mythras uses AP
  for both.
- **Tests sweep rather than sample** where the rule is small enough — all 100
  d100 results, every Fatigue level. That is what caught the fumble/96-00
  ordering.
- **Derive, do not restate.** `rollRanges` asks `gradeRoll` a hundred questions
  instead of reimplementing its arithmetic, so the two cannot drift.
- **Optional means absent, not `undefined`.** `exactOptionalPropertyTypes` is on;
  build objects with conditional spreads.
- **Additive optional fields need no migration.** `migrate()` passes unknown keys
  through and absent reads as the old default.

## Verifying

Tests are necessary and not sufficient. Several real bugs — a duplicated MEG
fetch under StrictMode, the owner dropdown, the persistence failure — were
invisible to Vitest and obvious in a browser.

Drive `npm run dev:mock` with playwright-core at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Add `?as=player-1` to see
the panel as a player. Screenshots are worth taking; the owner cares about the
interface and has rejected work for being "tosca".

## Where the project is

**Done:** the combat engine (Rounds/Cycles/Turns, Action Points, wounds by
location, undo); Characteristics and every derived Attribute; Fatigue; skill
rolls in a floating window with difficulty grades, criticals, fumbles and the
ranges shown before the die; Luck and Magic Points as spendable pools with
Desperate Effort; Movement Rate with Fatigue applied to it; weapons as reference
with breakable Hit Points; spell lists; import from MEG, from a sheet builder's
JSON, and by hand; token linking with sheets that survive leaving the fight;
compressed persistence.

**Planned, in order.** The owner asked for stages, not everything at once:

1. ~~Ranges before the die; Luck and Magic Points; derived Attributes readable
   without opening the editor.~~ Done.
2. ~~Import what is already parsed and thrown away — Movement Rate, weapon
   Armour and Hit Points, spell lists.~~ Done.
3. **Passions** — import them, then use one to augment a roll, updating the
   target and both ranges live. The augment adds **20% of the Passion's value**,
   not a flat 20, and the book does not say whether it lands before or after the
   Difficulty Grade — that is ours to decide and record.
4. **A glossary** of combat actions, Special Effects and situational modifiers,
   linked from the sheet where it is relevant and searchable where it is not.
   All ORC material, so legally fine; it is static content and does not touch the
   room's budget.

**Not planned:** opposed rolls, Special Effect resolution, automatic damage,
side initiative, the Delay action. See the rule at the top.

## Open questions

`DECISIONS.md` §6 is the live list. Most are closed. The ones that remain are
small: a token deleted mid-combat, automatic Fatigue accrual (deliberately not
done), and an inherited `uuid` advisory in the SDK with no fix available.

## This environment

Outbound network is on a restrictive allowlist: GitHub and package registries
resolve, everything else gets a 403 at the CONNECT. `cfi-srd.mythras.net` — the
web SRD the owner uses as a second opinion — and `mythras.skoll.xyz` are both
unreachable from here, as is Owlbear's own documentation. This never affects the
product, because the MEG client runs in the player's browser rather than here.

Do not try to work around it. Ask the owner to paste the passage, or to widen the
environment's network policy.
