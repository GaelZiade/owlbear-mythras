---
title: Mythras Combat
description: Initiative by Cycles, Action Points, and wounds tracked per hit location.
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

## At the table

- Roll initiative for the tokens you have selected, so you can roll for your
  enemies while players roll their own
- Players edit their own combatant's Action Points, Hit Points and initiative
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
