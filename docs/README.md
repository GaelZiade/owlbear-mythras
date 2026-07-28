# Store listing

[`store.md`](store.md) is the extension's page in the
[Owlbear Rodeo extension store](https://extensions.owlbear.rodeo/). Owlbear reads
it straight from this repository, so editing it here updates the listing — there
is nothing to resubmit.

Getting listed in the first place is a pull request to
[owlbear-rodeo/extensions](https://github.com/owlbear-rodeo/extensions) adding
one line to `extensions.json`:

```json
"mythras": "https://raw.githubusercontent.com/GaelZiade/owlbear-mythras/main/docs/store.md"
```

## Images

Two files, both referenced by `store.md` and both required before submitting.
Sizes match what the official Owlbear extensions ship.

| File | Format | Size | What it is |
|---|---|---|---|
| `header.jpg` | JPEG | ~1280 × 640, under ~250 KB | The banner across the top of the store page |
| `icon.png` | PNG | 256 × 256 | The tile in the store's extension grid |

The banner is the only thing most people will look at before deciding whether to
install. The panel mid-fight with a combatant expanded — body diagram visible,
some locations wounded — shows in one glance what this does that a plain
initiative tracker does not.

Note the store reads both images from `main` over `raw.githubusercontent.com`, so
they only resolve once merged there. A branch is not enough.

### How the current pair was made

`header.jpg` comes from a 1209 × 735 screen capture, cropped to 1209 × 604 —
full width, anchored at the top — which is the 2:1 the store wants while keeping
both the Owlbear toolbar and the whole panel down to the last hit location. It is
then scaled to 1280 × 640 and saved at JPEG quality 92, which lands around 197 KB.

`icon.png` is a 500 × 500 original whose artwork sat inside a wide transparent
margin, leaving it 41% of the canvas and far too small once dropped into the
store's grid. It is trimmed to the artwork, scaled so the long side is 88% of the
frame, and recentred on a transparent 256 × 256 canvas.

The raw capture is deliberately not kept here — `header.jpg` supersedes it, and it
is recoverable from commit `d159604` if the crop ever needs redoing.

**Still worth improving:** the current banner shows a fight in progress but every
location intact, which undersells the one thing the extension does that a plain
initiative tracker cannot. A recapture with real damage applied — a serious wound
visible in the location list — would be a better first impression.
