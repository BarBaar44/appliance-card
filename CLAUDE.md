# Appliance Card: notes for working on this repo

HACS dashboard card (Lovelace) showing the washing machine and the dishwasher side by side. Owner: BarBaar44 (Bb). Sister repos with the same conventions: [Heating-Control-Card](https://github.com/BarBaar44/Heating-Control-Card) and [room-card](https://github.com/BarBaar44/room-card).

## Files

| File | Purpose |
|---|---|
| `appliance-card.js` | The whole card: plain custom element, no build step, no dependencies. `PROFILES` holds the default entities and actions per machine type. |
| `tests/appliance-card.test.js` | jsdom tests for every state of both profiles, actions, config errors. `npm test`. |
| `hacs.json` | HACS manifest. |
| `README.md` | User docs, also the HACS info page. Keep the entity, rule and colour tables in sync with `PROFILES`, the `_washer`/`_dishwasher` rules and `COLORS`. |
| `CHANGELOG.md` | One `## vX.Y.Z` section per release; the Release workflow uses it as the release notes. |
| `shot.png`, `animation.gif` | README images, linked by absolute raw URL so they render in HACS. |
| `appliances.yaml` | Example configs. |

## Rules to keep

* The card never calls services on the machines. Tap and hold go through `hass-action` (HA's own handler). Start/stop logic lives in the owner's scripts (Fingerbots, guards so a running wash is never changed).
* Washer and dishwasher rules are first-match-wins, as listed in the README. Dishwasher `finished` beats the door: the dishwasher opens its own door near the end.
* Attention badges only while the machine is not running or paused. They use the progress slot, so the card never grows beyond its running height.
* Dishwasher sensors are `unknown` while it is off: normal, not an error.
* Remaining time: the sensor's unit wins; defaults are minutes (washer) and hours (dishwasher).
* Re-render only when one of the card's own entities changes; the DOM is built once per config and updated in place.

## Releasing

1. Bump `VERSION`, add the CHANGELOG section, commit, push to `main`, check Validate is green.
2. The owner pushes the `vX.Y.Z` tag. **Never tag or release without the owner's explicit go.** Claude sessions here cannot push tags or create releases anyway.
3. Changes marked "no release yet" go to `main` without a version bump.
