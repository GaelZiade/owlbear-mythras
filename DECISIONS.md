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

### 1.4b Imperative and the core rules disagree about Action Points

The table above is the **core** rule: Action Points band on INT + DEX. *Mythras
Imperativo* says something else outright — *"Todos los personajes en Mythras
Imperativo tienen 2 Puntos de Acción."* A flat 2, for everybody, derived from
nothing.

Both are kept. `tables.ts` holds the core banding, `characteristics.ts` holds
Imperative's flat 2, and **Imperative wins where the panel derives anything**,
because Imperative is the source this project can reproduce under ORC. A
combatant whose Characteristics are entered in the panel therefore ends up with
2 Action Points however high their INT and DEX are.

Nothing re-derives an imported creature: MEG's Attributes are already final and
include natural armour, racial modifiers and features these tables know nothing
about (§5).

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

### 1.9 Skill rolls

Source: Imperative, *Habilidades*. The rules resolve in a fixed order, and the
order is the whole of it:

1. **Fumble** on 99 or 00 — but a target over 100 fumbles only on 00.
2. **96-00 always fails**, however high the skill.
3. **01-05 always succeeds**, however low.
4. Otherwise, at or under the target succeeds.
5. A **critical** is a tenth of the *modified* target, rounded up, checked
   within a success.

Rule 1 before rule 2 is the one worth stating: a 99 satisfies both, and fumble
is the more specific answer. The suite sweeps all 100 rolls at six skill values
rather than sampling, which is what pinned that down.

The Difficulty Grade table has **two modifier methods** and the book insists a
table pick one and keep it: multiply the skill, or add a flat percentage. They
agree around 60 and diverge sharply at high values — 120 at Formidable is 60 one
way and 80 the other — so `ModifierMethod` is a parameter rather than a choice
made here.

Where several grades apply, the hardest wins. That is what connects Fatigue to
this: the difficulty column of §1.8 was carried as data with nothing consuming
it, and `hardestGrade` is now that consumer. An Exhausted character attempting
something Hard rolls Formidable.

### 1.9b The critical and fumble ranges are shown before the die

Both ranges are on screen while the grade can still be changed, rather than
appearing in the result.

The critical range is the reason. It is a tenth of the *modified* target, so it
moves with the difficulty: a skill of 51 criticals on 01-11 when it is doubled
and on 01 alone at Herculean. Nobody works that out at the table, and learning it
from the result is learning it after the choice it should have informed.

`rollRanges` derives both by putting all hundred possible rolls through
`gradeRoll` rather than restating its arithmetic. The arithmetic is two lines and
that is exactly the trap: a second description of the same rule is free to drift
from the one that decides the outcome, and the drift would show up as a window
promising a critical the roller does not grant. Asking the real rule a hundred
questions costs nothing and cannot disagree with itself. It also handles Hopeless
and Automatic — no critical, no fumble — without either needing a special case.

The success *percentage* is deliberately not shown. It was considered and
dropped: knowing 65% is 65% adds nothing, while the two ranges are facts about
this roll that are not obvious.

### 1.10 Luck and Magic Points are tracked, not derived

Source: Imperative, *Luck Points* and *Magic Points*. Both are pools that are
spent and refill later — *"Once a Luck Point is spent, the pool decreases… until
the next game session when they replenish to their normal value."* That makes
them exactly the kind of thing this project exists to track, unlike a damage roll
the player reads off their own sheet.

The maximum is never stored, only the spending. Luck comes from POW in six-point
bands and Magic Points equal POW, so a corrected Characteristic moves the pool
and what is left is clamped under the new maximum. A combatant with no
Characteristics carries an explicit maximum instead, which is where a MEG
creature's `magic_points` lands — the statblock is final and we do not re-derive
over it (§5). Creatures have no Luck Points, and MEG does not pretend otherwise.

Absent means full rather than empty. Every fight saved before this existed loads
with everybody's pools untouched, which is what they were, and no migration is
needed for it.

**Desperate Effort** — one Luck Point for one Action Point — is a single event
rather than two, because it is one decision and has to undo as one. It is
offered only when the book offers it: *"If a character has exhausted their Action
Points."* Read loosely it would push the current total past the maximum, which
every other rule here assumes cannot happen; offered to someone whose Fatigue has
taken their maximum to zero it would buy a point `canAct` clamps straight back
off, burning a Luck Point for nothing. Both are refused in the engine, not merely
hidden in the interface.

Players may spend their own without asking. The book has a player burn a Luck
Point in the middle of somebody else's action; routing that through the GM would
put a person in the way of a decision the rules already gave to the player.

### 1.11 What the importers used to throw away

Three things were parsed and dropped, and each is a number a player would
otherwise be hunting for mid-fight.

**Movement Rate.** Both sources carry it and neither reached the combatant. It is
not derived from anything — *"Movement is not calculated from Characteristics but
is a default value which differs from species to species"* — so it is imported or
it is absent, and absent stays absent rather than defaulting to a human's six for
something that might be a horse.

Importing it turned the Fatigue table's Movement column from words into
arithmetic. That column used to be carried as a string because there was no rate
to apply it to; it now carries a `MovementEffect` beside the string, and where a
rate is known the panel shows what is left rather than "Halved". Halving rounds
up, per the book's general rounding rule.

**Weapons.** Damage, size and reach are reference — read off a sheet, thrown as
real dice — and are carried as printed rather than parsed, because parsing
`"1d8+1"` into structure would invite something to roll it, which the rule at the top says is not ours to do. Hit Points are the exception and the reason weapons
are modelled at all: a parry puts the weapon in the way of the blow, so it takes
damage and breaks. That is a number that moves during a fight.

The two sources disagree about how to write the Special Effects a weapon grants —
MEG writes `"Bleed, Impale"` and the builder writes `"Impale Street Brawler"` —
so the string is stored as written. Splitting on spaces invents an effect called
Street.

**Spells.** MEG carries four lists and the builder carries four traditions, one of
them a Path with three sub-lists. They are the other half of tracking Magic
Points: a pool is only useful next to what it can be spent on. Read-only, since
casting is a decision and its cost is a subtraction the player makes.

### 1.12 Gaits, and the one rule that does not come from the SRD

Run is Move ×3, Sprint is Move ×5, an action is one Difficulty Grade harder at a
Run and two at a Sprint, and most proactive actions are unavailable above a Walk.

**None of that is in *Mythras Imperative*.** The SRD gives a Movement Rate and a
Move Action and then refers to "the rules for Walk, Run, and Sprint set forth
above" — a table it never prints. Those rules are in the Mythras core rulebook,
which the SRD itself designates as Reserved Material, so they cannot be
reproduced here. What is implemented is the **Community Errata**, published
openly at srd.mythras.net to fill exactly this gap.

It is the only thing in `core/` that cannot be traced to a line in
`reference/`, which is why it lives in a module of its own, says so in its header,
names the source in its tests, and is recorded in `reference/README.md` under a
heading about implementing from outside the document. A table not using the errata
is playing something slightly different here and nowhere else.

Two things fell out of implementing it.

**Fatigue applies before the multiplier.** The table halves a *Movement Rate*, and
the gait multiplies that rate. The other order lets an Exhausted character sprint
30 metres rather than 15, which is the halving quietly undone.

**A gait shifts a grade; it does not compete to be one.** `hardestGrade` picks the
worst of several grades in play at once — Fatigue against a GM's ruling — and
that is settled first. `harderBy` then moves along the table from wherever that
landed. Doing it the other way, treating the gait as another grade to be worst of,
would discard the gait entirely whenever Fatigue happened to be worse, which is
not what "one Grade harder to pull off at a Run" means.

Whether the character is running is not stored, and the proactive-action
restriction is printed rather than enforced. Which action is being attempted is a
decision at the table, and the errata's own exceptions — charging, Skirmishing
weapons — are exactly the kind of judgement this extension leaves alone.

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

## 5b. Importing from the group's sheet builder

A second import path, unrelated to MEG and with no licence question attached:
the builder is the group's own tool and the file is the player's own character.

The format stores **formulas rather than results** — a skill knows which
Characteristics it is based on and what bonuses were spent on it — so the
adapter computes instead of copying. Two things fell out of that:

- **The order of operations is not documented.** *Customs* is INT with `add: 40`
  and `multiply: 2`. At INT 13, multiplying first gives 66 and adding first gives
  106, and no starting skill reaches 106. Multiply the base, then add.
- **`abdoment` is their spelling.** Matched rather than corrected: reading
  somebody else's format on its own terms is the whole job of an adapter.

The builder ships its own computed Attributes in `currentValues`, which turned
into the best available check on §1.4 and §1.4b: Damage Modifier, Experience
Modifier, Healing Rate, Initiative Bonus and Luck Points all agree exactly with
what `characteristics.ts` derives independently.

Hit Points are taken from the book's table rather than the builder's
divide-by-five formula. The two agree at human sizes; the table is the rule.

The armour's total ENC becomes the **Initiative modifier**, not a new base —
which is what §1.3's armour penalty has always been, and the reason the field
was split in the first place.

### 5c. The token link is the durability

A sheet is archived under its Owlbear token id (§2.2), which makes the link the
thing that decides whether a character survives leaving the fight. Two cases
proved that has to be editable rather than only set at add time:

- A character imported from a file arrives with **no token at all**, so nothing
  can be filed and nothing comes back.
- A token deleted from the scene and drawn again comes back with a **new id**,
  which nothing points at. The old sheet is still in the archive, unreachable.

So the panel has a Token dropdown listing the scene's character and mount
layers, GM only. Relinking a redrawn token to the combatant restores the path to
its sheet. This is also what makes an imported player character assignable to
the token their player actually moves.

The list is read once when the panel opens rather than subscribed to: a scene's
token list changes rarely and a live subscription for a dropdown is not worth
the wiring.

### 5d. MEG index caching, as the author asked

The MEG author was asked directly and answered: the index endpoint is heavy and
should be cached, *"let's say 10min"*. This project caches it for **a week**,
which is far kinder than the floor requested, with a Refresh button for the day
somebody adds a creature and wants it immediately. The reasoning is in
`meg/client.ts`; the ten minutes is a floor, not a target.

### 5e. Failed writes were silent, and that lost characters

`persist()` fired `void flushWrites()` with no catch, so a rejected write to the
room metadata was discarded entirely. The panel went on showing local state the
room had never accepted; everything looked right until a reload put the last
successfully saved state back. An imported character vanished, silently and
completely, and the name reverted to the token's.

Two changes. The rejection is now caught and shown as an alert, because there is
nothing the code can do about it and the person at the keyboard can. And the
payload was cut roughly in half: the sheet builder exports **every professional
skill in the game** on every sheet, at base value with nothing spent, and in
Mythras an untrained professional skill is one the character does not have. Jon
Snow carried 65 entries of which 37 were that. Dropping them took a character
from 5.7 KB to 3.0 KB, and a party of four with archived sheets from 46 KB to 24.

Basic skills are always kept — everyone has those — and so are combat styles.

### 5f. The roll window is its own Owlbear surface

Rolling started as an accordion in the panel, then a dialog over it. Both were
wrong for the same reason: an overlay rendered inside the panel is still bounded
by the panel's width, and the panel is a narrow column already carrying a body
diagram, a statblock, the damage controls and the character's numbers.

`OBR.modal.open` floats a surface over the whole Owlbear canvas. That makes it a
second HTML entry point rather than a component, since Owlbear loads every
surface as its own iframe — which is also why the combatant travels in the URL
and the window reads the room itself.

The mock had to grow for this: room metadata moved to localStorage so two
surfaces share it, because a module variable gave the second page an empty room
and made a working window look broken. Third time the harness has been widened
to stop it being more forgiving than Owlbear.

### 5f-bis. Owlbear caps room metadata at 16 kB, and says so where we cannot hear it

The console settled what three rounds of guessing had not:

> `Unable to update metadata: over size limit of 16 kB`

Room metadata **does** persist. It is capped, hard, and a write past the cap is
refused outright — and Owlbear reports it from its own message handler, not by
rejecting the promise we await. So the `catch` added in §5e never fired, the
panel carried on showing state the room had never accepted, and every reload put
back the last write that fit. A party with imported sheets was permanently over,
which is why *nothing* seemed to save.

Two changes.

**The state is packed.** JSON spends the budget badly: a skill is four repeated
keys and a character has thirty of them, so skills and hit locations alone were
2.7 kB of a 3.0 kB character. Those two arrays now travel as tuples and
everything else keeps its shape — 3033 bytes to 1033, and six characters with
archived sheets from 36 kB to 12.5. Packing the whole combatant positionally
would save a little more and be much easier to get wrong; the two big arrays are
where the money is. `CombatState` is untouched: this is a wire format, not a
model. Rooms written before it still load.

**The size is checked before the write, not after.** Since the failure cannot be
caught, the only way to know is to measure, and refusing a doomed write turns a
silent total loss into a sentence naming the number.

Recorded because it constrains everything after it: the room holds about six
characters with skills. Anything that grows what a combatant stores has to be
weighed against that. **Superseded by §5f-ter**, which lifts that constraint.

### 5f-ter. Packing bought six characters; the fight needs fifty

12.5 kB of 16 is not headroom, it is luck. Measured, the *eighth* imported
character crosses the ceiling — and it would cross it mid-session, during a big
fight, which is exactly when nobody can do anything about it. A limit you have
to ration is a limit that will be hit.

So the packed object is deflated and base64'd before it is written. Measured
with every number varied, so identical copies do not flatter the compressor:

| characters | packed JSON | deflated + base64 |
| ---------- | ----------- | ----------------- |
| 6          | 12 998      | 2 224             |
| 8          | 17 282 ✗    | 2 620             |
| 20         | 43 026 ✗    | 5 088             |
| 50         | 107 380 ✗   | 9 096             |

Fifty full sheets in 9 kB. The budget stops being something to design around.

**Why deflate and not a cleverer format.** A shared string table for skill names
was the obvious hand-rolled alternative and buys roughly 1.5×; deflate buys 12×,
because the repetition it exploits is everywhere, not only in the names. Writing
less clever code that wins by an order of magnitude is not a hard trade.

**Why no dependency.** `CompressionStream` is in the browser already. Where it is
missing the packed object is written exactly as before — those rooms keep the old
budget rather than failing — and the smaller of the two encodings always wins, so
a fight of three stays legible in the room metadata and only a big one turns into
base64.

**What it cost.** Decoding is asynchronous now, which opens a gap between the
metadata arriving and the state being ready. Two changes in quick succession can
finish out of order, so reads carry a ticket and a superseded one drops its
result; the in-flight-write check is repeated after the await, not only before
it. The size check stays despite fifty sheets fitting: the failure it guards
against is silent and total, and the guard costs nothing.

### 5g. Never write on load

The worst bug this project has had, and it presented as the opposite of what it
was. `connect()` read the room once and then immediately wrote, to record who
was in the party. When that read answered before the room had settled it produced
an empty fight — and the write cemented the empty fight over the real one.

Everything went: the roster, the wounds, the imported sheets, the token links.
It looked like nothing was persisting. In fact persistence was working and the
*load* was destroying what had persisted, which is why it only showed up on a
refresh and why the roll window — a second surface reading the same room — found
nothing to roll.

**Rule: nothing is written during connect.** Not a migration, not a
normalisation, not a "while we are here". Writes happen when a user does
something, or when the room's own events wake us — by which point the room has
certainly loaded, because its events are the proof.

Two supports for it. `rememberPlayers` refuses to run while a write is in flight,
so it cannot race the reducer. And the roll window distinguishes an empty roster
from a missing combatant: only a roster with somebody *else* in it proves this
one is gone, so a window that renders before the room answers waits instead of
announcing a loss.

### 5h. The roll window is handed its sheet, not the fight

It used to look the combatant up in the room by id, which meant a window whose
only job is "roll against a number on this sheet" could not open unless the whole
encounter loaded first. Fragile, and wrong about what rolling is: you roll a
character's skill, not the fight's.

The panel now writes a name, a skill list and Fatigue's own difficulty grade to
`sessionStorage` and opens the window, which reads that and nothing else. Both
surfaces are the same origin, so it is shared memory; the URL was not an option
because a full skill list runs to a couple of kilobytes.

The window therefore works whatever the room is doing, which also means it stops
being a second victim of any persistence problem.

## 6. Open questions

1. ~~**The real Owlbear metadata size limit.**~~ **Answered: 16 kB**, by the SDK
   itself refusing a write, and no longer a practical constraint: fifty full
   character sheets now fit in 9 kB. See §5f-bis and §5f-ter.
2. **Token deleted mid-combat** (a consequence of F3). Today the combatant stays
   in the list with a `tokenId` pointing at nothing. **Decided:** the link is
   dropped, the combatant is not. A token vanishing is a remote event we did not
   ask for, and deleting a combatant — with its wounds, its sheet and its owner —
   because of one would destroy work nobody asked to destroy. The combatant stays,
   unlinked, and says so, which is also recoverable: link it to a new token and it
   carries on.
3. ~~**The Delay action.**~~ **Dropped.** Mythras lets Action Points be spent
   reactively at any moment, which is what Delay exists to allow in games that
   count turns strictly — so the tracker already permits the thing, and holding a
   turn changes nothing it records. Nothing to build.
4. ~~**Side initiative.**~~ **Dropped**: not used at this table.
5. **Inherited advisory**: `@owlbear-rodeo/sdk@3.1.0` depends on a `uuid` version
   with a moderate advisory. No fix available and it does not affect our usage.
6. ~~**Licensing of the Fatigue table** (§1.8).~~ **Closed: the table is in
   *Mythras Imperative*, under ORC.** It was not found in the excerpt searched
   here, which was the whole of the doubt. `fatigue.ts` stands as written and the
   store listing carries no licensing risk from it.
7. ~~**Which of the two Difficulty methods a table uses** (§1.9).~~ **Closed:
   multiplication**, which is what was hard-coded and what the book calls the
   default method. Confirmed against the SRD's own Difficulty Grade Table: double
   the skill, add half again, reduce by one-third, halve, one-fifth. The flat
   percentages stay unimplemented; if another table ever wants them they become a
   room-level setting rather than a dropdown, because the book says to pick one
   and keep it.
8. **Automatic Fatigue accrual.** The engine never raises a level on its own —
   forced marches, swimming and holding your breath are all outside a combat
   tracker's knowledge. `worsenFatigue` and `recoverFatigue` exist for a future
   caller; today the level is always set by hand.
