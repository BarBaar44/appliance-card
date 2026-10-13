# Changelog

## v0.1.0

First release. One card for the washing machine and the dishwasher, side by side, replacing two mushroom template cards and their helper template sensors.

### Added
* Washer and dishwasher profiles: colour, icon, status, programme and phase names worked out in the card from the machines' own entities. No Jinja, no template sensors.
* Start time while waiting for the cheapest hour, finish or ready time while running, with progress bar, percentage and time left.
* Readable programme and phase names (Eco 40-60, Main wash, Spin, ...), whatever form the raw value arrives in.
* One attention badge per machine while it is not running: detergent low, drum clean due, rinse aid empty, salt empty, machine care due.
* Unload blinks softly until the machine is emptied. The washer shakes while running (faster while spinning) and the dishwasher bobs. All animations stop under reduced motion.
* Dishwasher pause, action required and error states. Unknown sensors while the dishwasher is off are treated as normal.
* Tap and hold per machine through Home Assistant's own actions (navigate, perform-action, more-info, ...). The card never calls services on the machines.
* Every colour configurable with `colors`.
