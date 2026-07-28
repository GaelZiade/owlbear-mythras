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
