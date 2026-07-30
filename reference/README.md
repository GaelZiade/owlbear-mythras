# Reference

`mythras-imperative-srd.md` is the *Mythras Imperative* System Reference
Document, released by The Design Mechanism under the ORC License.

**It is in the repository on purpose, and it is the only rulebook that may be.**
The ORC License exists precisely so that the Licensed Material — stat blocks,
game rules, character attributes, the methods and systems of play — can be
shared, adapted and redistributed, provided the notice travels with it. The file
here is verbatim and carries its own ORC Notice and attribution at the top, so
that condition is met by the copy itself.

The commercial rulebooks are a different matter and stay out, as `.gitignore`
says. *Mythras* and *Classic Fantasy* are named Reserved Material by this very
document; so are the Imperative name, its logo and its artwork. None of that is
here, and none of it should be.

## Attribution

> Based on Mythras Imperative, Written by Pete Nash and Lawrence Whitaker, and
> published by The Design Mechanism, Copyright 2023

## Why it is checked in rather than kept on somebody's disk

Every rule this project implements has to be traceable to a line in this file,
and the questions that come up are rarely about the rule everyone remembers —
they are about the exact wording of an augment, whether a table lists a
multiplier or a flat percentage, what the eighth Difficulty Grade is actually
called. A copy on one machine answers those for one person; a copy in the
repository answers them for anyone reading the code, in any session, forever.

`DECISIONS.md` cites it by section throughout.

## What it does not settle

Imperative is explicitly "comprehensive, but not exhaustive". Where it is silent,
the silence is worth recording rather than papering over with the core rules,
which are Reserved Material and cannot be reproduced here.

Known gaps that have come up so far:

- **Walk, Run and Sprint rates.** The Movement section gives a Base Movement Rate
  (6 metres for humans) and refers to "the rules for Walk, Run, and Sprint set
  forth above", but no such table appears in the document. The *consequences* of
  running and sprinting are here — assessing while Running is a Hard Perception
  roll, Sprinting Formidable, and a sprinting target is Formidable to shoot at —
  but the distances are not.

  **Filled from the Community Errata**, not from this file. See below.

## Where something is implemented from outside this document

One thing so far, and it is worth naming loudly, because everything else in
`core/` is held to "trace it to a line in the SRD" and this cannot be.

**Gaits** (`core/movement.ts`) — Run at ×3 and Sprint at ×5, an action one
Difficulty Grade harder at a Run and two at a Sprint, and most proactive actions
unavailable above a Walk. The published *Mythras Imperative* has no Gait rules at
all; they are in the Mythras core rulebook, which this document designates as
Reserved Material and which therefore cannot be reproduced here. The figures
implemented are the **Community Errata**'s, published openly at
<https://srd.mythras.net>, which exists precisely to fill gaps like this one.

Two consequences worth keeping in mind:

- If the errata is ever revised, `movement.ts` is the only file to revisit, and
  its tests name the source in their own description.
- A table that does not use the Community Errata is playing something slightly
  different here, and nowhere else in the extension.
