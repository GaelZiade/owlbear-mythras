---
title: Mythras Combat
description: Initiative by Cycles, Action Points, Fatigue and wounds tracked per hit location.
author: Tutson
image: https://raw.githubusercontent.com/GaelZiade/owlbear-mythras/main/docs/header.jpg
icon: https://raw.githubusercontent.com/GaelZiade/owlbear-mythras/main/docs/icon.png
tags:
  - combat
  - automation
manifest: https://gaelziade.github.io/owlbear-mythras/manifest.json
learn-more: https://github.com/GaelZiade/owlbear-mythras
---

# Mythras Combat

A combat tracker built for how Mythras actually runs a fight, rather than a
generic initiative list with Mythras names on it.

## Rounds, Cycles and Turns

Mythras combat has three levels, not two. A Round holds several Cycles, and each
Cycle counts down the initiative order giving everyone a Turn. When a Cycle runs
out, another opens for whoever still has Action Points; when nobody does, the
Round ends and Action Points come back.

The tracker follows that structure. It shows which Round and which Cycle you are
in, dims the combatants who have already gone, and skips anyone out of Action
Points instead of stopping on someone who has no move to make.

## Action Points, spent whenever they are spent

Parries and evades cost Action Points on somebody else's turn, so points can be
spent at any moment, not only on your own. They are shown as pips, the way the
rulebook suggests tracking them with poker chips, and every player can spend
their own.

## Wounds by hit location

There is no single pool of hit points in Mythras, so there is none here. Every
combatant carries Hit Points and Armour Points per location, and the wound level
— minor, serious or major — is worked out from what is left.

Damage is applied by pointing at a body diagram labelled with each location's
d20 range, then entering the amount. Before anything is applied you see what it
would do: how many points would remain, what wound it would cause, and how much
the armour absorbed.

Creatures are not assumed to be humanoid. Locations are data, so tails, wings and
forequarters fit the same model.

## Characteristics, and everything derived from them

Enter STR, CON, SIZ, DEX, INT, POW and CHA and the tracker works out the rest:
Action Points, Initiative Bonus, Damage Modifier, Healing Rate, Experience
Modifier, Luck Points and Hit Points per location. Change a Characteristic and
every one of them follows.

Nothing derived is typed by hand, so nothing can drift out of step. Where a
character is not built from Characteristics — an imported creature, a quick
NPC — a modifier field sits alongside each derived value, and the tracker adds
the two rather than making you overwrite the calculation.

The derivations follow *Mythras Imperative*, which gives every character a flat
2 Action Points rather than banding them by INT and DEX.

## Fatigue

Ten levels, from Fresh down to Dead. The two the tracker can enforce are
enforced: the Initiative penalty is folded into the order combatants act in, and
the Action Point loss is applied to the maximum, so an Exhausted character gets
fewer pips for the whole Round.

The rest of the row — the difficulty grade for skills, the movement restriction,
how long recovery takes — is shown rather than applied, since it belongs to
rolls and travel the tracker does not resolve. The roll window reads the grade,
so a tired character rolls at the right difficulty without anyone remembering to
say so.

## Rolling skills

A floating window, not another thing crammed into the sidebar. It lists that
character's own skills with a search filter, takes a Difficulty Grade from Very
Easy to Herculean, and rolls d100 against the modified target.

It reports the result the way the rules read it: critical, success, failure or
fumble, with criticals worked out from one tenth of the *modified* target rather
than the base one. Fatigue's grade is applied automatically.

## Getting characters in

Three ways, none of them retyping a sheet:

- **From the Mythras Enemy Generator.** Search its catalogue by name and import
  a creature with its Characteristics, hit locations, armour, skills and combat
  styles already filled in.
- **From a character sheet file.** Drop in the JSON a sheet builder exports.
- **By hand**, for the NPC you invented thirty seconds ago.

A combatant can be linked to a token on the map, and a linked character's sheet
is kept when they leave the fight — bring the same token back later and their
wounds, skills and Characteristics come back with them.

## At the table

- Roll initiative for the tokens you have selected, so you can roll for your
  enemies while players roll their own
- Players edit their own combatant: Action Points, Hit Points, initiative,
  Fatigue and damage
- Mark someone out of the fight to skip them without removing them
- Undo, right next to Next turn

## Open source

Free, MIT licensed, and developed in the open at
<https://github.com/GaelZiade/owlbear-mythras>.

**Support**

Bug reports and feature requests are welcome at
<https://github.com/GaelZiade/owlbear-mythras/issues>.

This extension uses no copyrighted Mythras text. Rules content derives from
*Mythras Imperative*, published by The Design Mechanism under the ORC License.

Creatures, encounters and statistics imported into this package were created or
adapted using MeG, the Mythras Enemy Generator (<https://mythras.skoll.xyz/>).
"Mythras" is a Registered Trademark of The Design Mechanism Inc, and is used
with permission. This generator uses trademarks and/or copyrights owned by
Chaosium Inc/Moon Design Publications LLC, which are used under Chaosium Inc's
Fan Material Policy. We are expressly prohibited from charging you to use or
access this content. This generator is not published, endorsed, or specifically
approved by Chaosium Inc. For more information about Chaosium Inc's products,
please visit [www.chaosium.com](https://www.chaosium.com).
