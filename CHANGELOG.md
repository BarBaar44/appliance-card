# Changelog

## v0.2.0

### Added
* **Visual editor:** the title, colours and one section per machine: profile, name, every entity (the profile's defaults shown), tap and hold actions and the more-info entity. An empty slot after the last machine adds one (up to three); None removes a machine. Clearing an entity switches that part off; changing a profile starts the machine from that profile's defaults. Only values that differ from the defaults are written to the YAML (the default washer and dishwasher pair not at all), and options the editor does not show are kept.

## v0.1.0

First release. One card for the washing machine and the dishwasher, side by side, replacing two mushroom template cards and their helper template sensors.

### Added
* **Washer and dishwasher in one card.** The washer on the left, the dishwasher mirrored on the right with its icon on the far right. Fits 2 rows (at most 118px), the same height as the Heating Control Card with one room.
* **Status worked out in the card** from the machines' own entities: colour, icon, status, programme and phase. No Jinja, no template sensors.
* **Times:** Start while waiting for the cheapest hour, Finish (washer) or Ready (dishwasher) while running, in Home Assistant's time zone.
* **Progress** while running: bar, programme, percentage and time left. The remaining time follows the sensor's own unit.
* **Readable names** for programmes and phases (Eco 40-60, Eco 50°, Main wash, Spin, ...), whatever form the raw value arrives in.
* **Attention badge** per machine, only while it is not running: detergent low, drum clean due, rinse aid empty, salt empty, machine care due. It takes the progress bar's place, so the card never grows. Tap it to open the sensor behind it.
* **Animations:** Unload blinks softly until the machine is emptied. The washer shakes while running, faster while spinning; the dishwasher bobs. All stop under reduced motion.
* **Dishwasher states** pause, action required and error. Unknown sensors while the dishwasher is off are treated as normal.
* **Actions:** tap and hold per machine through Home Assistant's own actions (navigate, perform-action, more-info, ...). The card never calls services on the machines.
* **Colours:** every colour configurable with `colors`.
