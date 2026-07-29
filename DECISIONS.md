# Design decisions

Living document. Records what was decided, why, and what is still open.
Rules citations come from *Mythras* core rules and *Mythras Imperative* (ORC).

---

## 1. Rules findings that shape the architecture

### 1.1 Combat has three levels, not two

> **Round** (five seconds) contains several **Cycles** → each Cycle is an
> initiative countdown in which every participant takes a **Turn**.

When a Cycle ends, a new one starts for whoever still has Action Points. The
Round ends when nobody does, and Action Points are then restored.

The book's worked example: Anathaym parries three arrows, spending all three of
her Action Points reactively, so when her Turn arrives she cannot act. In the
second Cycle the centaurs reload, and the Round ends.

**Consequence:** a conventional initiative tracker cannot represent this. The
engine is built on `Round → Cycle → Turn`.

### 1.2 Proactive vs reactive actions

- **Proactive**: only on your own Turn. One per Cycle. Costs 1 Action Point.
- **Reactive**: any time, against a threat. One reaction per threat, any number
  per Cycle while points remain.

**Consequence:** Action Points must be spendable at any moment, not only during
the owner's turn. Spending is independent of the turn pointer.

### 1.3 Initiative

- `1d10 + Initiative Bonus`, rolled at the start of the fight.
- **Persists** between Rounds until something forces a reroll.
- **Ties act simultaneously.** The tracker must not break them arbitrarily.
- `Initiative Bonus = (INT + DEX) / 2`, less `armor ENC / 5` rounded up.

### 1.4 Derived attributes (verified tables)

**Action Points** from `INT + DEX`: ≤12 → 1; 13–24 → 2; 25–36 → 3; +1 per further 12.

**Hit Points per location** from `CON + SIZ`:

| Location | 1-5 | 6-10 | 11-15 | 16-20 | 21-25 | 26-30 | 31-35 | 36-40 | +5 pts |
|---|---|---|---|---|---|---|---|---|---|
| Each Leg | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | +1 |
| Abdomen | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | +1 |
| Chest | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | +1 |
| Each Arm | 1 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | +1 |
| Head | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | +1 |

Both verified against the book's Anathaym example (INT 14 + DEX 16 = 30 → 3 AP;
CON 13 + SIZ 10 = 23 → 5 head/legs, 7 chest, 6 abdomen, 4 arms). Exact match.

### 1.5 Wound levels are derived

| Level | Condition |
|---|---|
| Minor | location Hit Points > 0 |
| Serious | ≤ 0 |
| Major | ≤ −(starting Hit Points) |

Being knocked out, however, comes from opposed Endurance rolls the extension
cannot know about. The model therefore needs both a **derived** wound level and
a **declared** `defeated` flag.

### 1.6 Hit locations are not a fixed enum

Humanoids use seven locations on a d20, but the bestiary has wings, tails, claws
and forequarters, each creature with its own table in `AP/HP` form. Locations are
a **data-driven profile**, never `type HitLocation = 'head' | 'chest' | …`.

### 1.7 "AP" is ambiguous

Mythras abbreviates both Action Points and Armor Points as AP. **Rule: never
abbreviate.** `actionPoints` and `armorPoints`, always.

### 1.8 Fatigue is applied, not stored

The Fatigue table has five columns. Only two of them touch numbers this tracker
models, and they are the only two the engine applies:

| Column | Status |
| --- | --- |
| Momento de Reacción / Initiative | **Applied** — `effectiveInitiative` |
| Puntos de Acción / Action Points | **Applied** — `effectiveMaxActionPoints` |
| Grado de Dificultad | Shown only — there are no skills to grade |
| Movimiento | Shown only — there is no map distance in the state |
| Período de Recuperación | Shown only — measured in hours, and a Round-based tracker has no clock |

The three unenforced columns are still carried as data on every level and printed
in the panel. Dropping them would quietly lose three fifths of a rule the GM is
still expected to apply; printing them next to the two that *are* automatic, with
the manual half visibly dimmed, keeps the split honest.

Penalties are **derived at read time, never written into the combatant**. Storing
a reduced `maxActionPoints` would destroy the sheet value, and recovery has to
give the full total back. The same reasoning as §1.6: the rule is data applied to
the model, not a mutation of it.

Two consequences worth naming:

- From Semi-Conscious down the table stops giving penalties and says no activity
  is possible, so those levels are a `canAct` flag rather than a large modifier.
- A combatant who becomes unable to act *during* their own turn keeps the marker
  until the GM advances, exactly as one who spends their last Action Point does
  (§1.1). Dropping them mid-turn reads as "it was never your turn", which is
  wrong in both cases.

`fatigue` is optional on `Combatant` and absent means Fresh, so a fight saved by
an earlier build still loads and the schema version stays where it is.

---

## 2. Functional decisions (made by the project owner)

| # | Decision | Choice |
|---|---|---|
| F1 | Turn model fidelity | **Full Cycles** (Round → Cycle → Turn) |
| F2 | Edit permissions | **Players edit their own**; the GM controls NPCs and can override |
| F3 | Where combatants come from | **Scene tokens, with the option to add loose ones** |
| F4 | Location presentation | **Compact row + expandable panel** |
| F5 | Does advancing a turn spend an Action Point? | **No — always spent by hand** |
| F6 | Who does "Roll initiative" roll for? | **Combatants whose tokens are selected in the scene** |
| F7 | Skipping combatants with no Action Points | **Skip them, including in the first Cycle** |
| F8 | Interface language | **English only**, no locale selector |

### 2.1 Documented departure from the rules (F7)

The book gives a spent character a Turn they cannot use. Stopping the tracker on
someone with no available move is friction at the table, so anyone at zero
Action Points is skipped outright. Their points still return at the end of the
Round, so nothing is lost. See `canAct` in `core/combat.ts`.

### 2.2 Where the player's authority actually ends (F2)

F2 was implemented as "a player may act during the fight", which is narrower than
what it says. Players could spend Action Points, roll initiative, apply damage and
healing — but their Hit Points, Armor Points, Initiative Bonus and maximum Action
Points were all locked behind the GM's client, so setting up a character meant
reading numbers aloud and having the GM type them in.

The line is now drawn between **a character** and **the fight**:

| The owner may set | The GM alone may |
|---|---|
| Hit Points and maximum Hit Points, per location | Start and end combat |
| Armor Points, per location | Advance the turn |
| Initiative and Initiative Bonus | Add and remove combatants |
| Action Points and maximum Action Points | Reassign ownership |
| Out of the fight | Rename |

Nothing in the first column can affect anybody else, and everything in the second
changes the encounter rather than one sheet. The GM keeps all of it, since the GM
owns every combatant nobody else does.

This is a permission change, not a model change: `CombatState` is untouched, so
there is no migration and no schema bump. Enforcement stays where §3.1 puts it —
on the GM's client, against the connection's player id.

### 2.3 Accepted trade-off (F5)

Because advancing never spends a point, a Round only ends once someone has spent
everything by hand. If nobody does, the Cycle counter simply keeps climbing.
That is what the rules describe, and a visible "Cycle 5" is a useful hint that
Action Points are not being tracked.

---

## 3. Technical decisions

| # | Decision | Reason |
|---|---|---|
| T1 | TypeScript + Vite + React | React for contributor availability; no heavy UI libraries, since this loads in an iframe inside a side panel |
| T2 | Layers `core/` → `adapters/` → `ui/` | `core/` holds pure rules with no SDK import, testable with Vitest. The only boundary imposed from day one |
| T3 | The GM's client is the sole authoritative writer | Removes write conflicts between clients entirely |
| T4 | Combat state in *room* metadata; light marker on the *item* | Survives scene changes; one blob means one write per change. **Still to be validated against the real size limit** |
| T5 | `schemaVersion` + migrations from the first commit | Without it, the first model change breaks games in progress |
| T6 | MIT for code, ORC notice for derived data, in separate folders | Open RPG Creative License compliance; "Mythras", logos and art are *Reserved Material* |
| T7 | English throughout, strings inline | Supersedes the earlier decision to author in Spanish (F8). No i18n library until a second locale is actually wanted |
| T8 | Undo kept in memory on the GM's client, not persisted | A misclick needs undoing seconds later, not after a reload. Persisting every intermediate state would cost a network round trip per click |
| T9 | Body diagram matched by location ids, not a stored profile id | Keeps presentation out of the persisted schema: creatures already saved get their diagram with no migration, and unsupported anatomies fall back to the table |
| T10 | Dev harness via `vite --mode mock` | The app waits on `OBR.onReady` and renders nothing outside Owlbear, which made every interface change a deploy away from being visible |
| T11 | The mock harness can impersonate a player (`?as=player-1`) | Half the interface is decided by role, and the mock only ever played the GM. The player's half was therefore never looked at except by deploying and opening a second browser, which is how §2.2 shipped. The stub answers player requests by running the *real* authorisation check, so a mock that waves everything through cannot hide the next one |

### 3.1 Tension between F2 and T3, and how it resolves

Players edit their own values, but only the GM writes. Resolved by:

1. The player's client emits a **request** (broadcast message), not a write.
2. The GM's client validates it against `core/` rules and writes the state.
3. Every client receives the updated state.

Authorisation uses the player id Owlbear associates with the connection, never an
id carried inside the message, because message contents come from a remote client.

**Accepted risk:** if the GM disconnects, combat freezes. The interface says so
explicitly. No automatic failover to another client.

---

## 4. Scope

**Phase 1 — combat (current).** Initiative with simultaneous ties, Round/Cycle/Turn
engine with automatic Action Point reset, Hit Points and Armor Points per location,
derived wound levels, manual `defeated` flag, per-player editing, undo.

**Phase 2 — rolls.** Automatic grading of success, failure, critical and fumble,
with selectable difficulty grades.

**Phase 3 — character sheet.**

Deliberately out of scope for now, but not blocked: NPC templates, JSON import
and export, skills, combat effects, inventory, magic, cults, passions.

---

## 5. Importing from the Mythras Encounter Generator (planned, phase 2)

[MEG](https://mythras.skoll.xyz/) holds thousands of community-maintained enemy
templates. Feasibility was checked before committing to it:

| Endpoint | Returns |
|---|---|
| `https://mythras.skoll.xyz/index_json/` | Every template: `name`, `race`, `rank`, `owner`, `tags`, `id`, `notes`. 4,867 entries, ~2.9 MB |
| `https://mythras.skoll.xyz/generate_enemies_json/?id=<id>&amount=<n>` | Rolled creatures with `stats`, `skills`, `hit_locations`, `combat_styles`, `attributes`, spells |

**It clears the blocker that mattered.** The server sends
`Access-Control-Allow-Origin: *` over HTTPS, so the extension can fetch it
directly from the browser. Without that we would have needed a backend to proxy
the calls, which would have ended the "static extension" architecture.

**The data maps almost one to one.** `attributes.action_points` is our
`maxActionPoints`; `attributes.strike_rank` (`"11(13-2)"`) is the Initiative
Bonus with the armor penalty already applied; and each entry in `hit_locations`
(`{name, range: "01-03", hp, ap}`) is one of our `HitLocation` records. Only the
`range` and `strike_rank` strings need parsing.

**It vindicates §1.6.** A sample template returns *Right hind Leg* and
*Hindquarters*: a quadruped. Had hit locations been a fixed humanoid enum, this
import would require rewriting the model rather than adding a parser.

### Permission, and what it costs

The MEG author was asked before any traffic was sent, and granted permission to
import MEG creatures into Owlbear Rodeo subject to conditions. Those conditions
are binding on this project, and one of them **invalidates the plan above**:

| Condition | Consequence here |
| --- | --- |
| No scraping the site "in any form" | — |
| No "large amounts of requests"; the site is small computewise | — |
| No "creating databases from major contents of the site" | **Unresolved for the index.** See below |
| No commercial charge; tips or Patreon for hosting costs are fine | The extension stays free. It already is |
| No iOS or Android apps | Web only. Not currently a temptation, but it binds any future port |
| Mythras and Chaosium notices visible in the tool | `src/ui/Notices.tsx`, reachable by GM and players alike |

The notice wording is supplied by MEG and reproduced exactly. It is not ours to
edit or shorten; see the header of `Notices.tsx`.

Most of these flow from Chaosium's Fan Material Policy rather than from MEG
itself, because much of MEG's content is under Chaosium copyright. That means
they are not negotiable by the MEG author either.

### Rules for the integration

1. **Never vendor the data into this repository.** MEG content is authored by
   third parties and includes licensed settings material. Unchanged, and now
   doubly so.
2. **One request per creature the user actually asked for.** No background sync,
   no speculative fetching, nothing the user did not ask for by name.
3. **The index may be read.** Granted by the author. Reading `index_json/` to
   power a name search is not what the scraping rule is aimed at.

   The reason matters more than the permission, because it shapes what the
   search may display. The rule exists because the full database holds creations
   users chose **not** to share publicly, and because it is unmoderated and may
   therefore hold official Mythras content rather than homebrew. So: fetch the
   index once per user and cache it, never mirror the statblocks behind it, and
   show only entries the site itself marks as public. See open question §6.8.
4. **Treat the endpoints as undocumented.** No versioning, no stability promise.
   The importer must degrade gracefully when they change or disappear, and must
   never be on the panel's critical path.
5. **Never re-derive what MEG already rolled.** MEG's numbers are final: they
   include natural armour, racial modifiers and features that §1.4's tables know
   nothing about. Recomputing Action Points from INT + DEX on an imported
   creature would sometimes disagree with the statblock, and the statblock is
   right. The import copies; it does not calculate.
6. **Prefer a file the user already has.** MEG JSON the user exports themselves
   costs the site nothing and is explicitly permitted. That is the safest import
   path and should be the one that always works, with any live fetch as an
   addition rather than the foundation.

## 6. Open questions

1. **The real Owlbear metadata size limit.** Not stated in the public docs and
   `docs.owlbear.rodeo` blocks automated reads. Needs measuring before T4 is
   considered settled.
2. **Token deleted mid-combat** (a consequence of F3). Today the combatant stays
   in the list with a `tokenId` pointing at nothing.
3. **The Delay action.** The rules let a character hold an action to react later.
   Not yet decided whether it belongs in phase 1.
4. **Side initiative**, a common optional rule. Not decided.
5. **Inherited advisory**: `@owlbear-rodeo/sdk@3.1.0` depends on a `uuid` version
   with a moderate advisory. No fix available and it does not affect our usage.
6. **Licensing of the Fatigue table** (§1.8). The header of this document cites
   *Mythras Imperative* (ORC) alongside the core rules, and it is not confirmed
   that Fatigue appears in Imperative. If the table is core-only, reproducing its
   values needs checking against T6 before release. The level names and the two
   applied columns sit in `fatigue.ts` and would be the thing to revisit; nothing
   else in the codebase depends on those numbers.
7. **Automatic Fatigue accrual.** The engine never raises a level on its own —
   forced marches, swimming and holding your breath are all outside a combat
   tracker's knowledge. `worsenFatigue` and `recoverFatigue` exist for a future
   caller; today the level is always set by hand.
8. **Characteristics and derived attributes.** `tables.ts` can turn STR/CON/SIZ
   and the rest into Action Points, Hit Points per location and the Initiative
   Bonus, but only `hitPointsFor` is wired up — `actionPointsFor`,
   `initiativeBonusFor` and `initiativePenaltyFor` are reachable from tests and
   nowhere else, because nothing in the interface accepts characteristics. A
   blank combatant therefore gets a hardcoded default rather than a derivation.
   Whether to store characteristics is open; what is *not* open is re-deriving
   over an imported creature's numbers, which are already final. See §5.
