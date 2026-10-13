# Appliance Card

![Appliance Card](https://raw.githubusercontent.com/BarBaar44/appliance-card/main/shot.png)

One Lovelace card for the washing machine and the dishwasher, side by side: what each machine is doing, when it starts or finishes, how far along it is, and whether it needs attention. One JavaScript file, no build step, no dependencies, no card_mod, no Jinja.

* **Status at a glance:** icon, colour and status line per machine, worked out in the card from the machines' own entities. No template sensors needed.
* **Times:** "Start" while waiting for the cheapest electricity hour, "Finish" (washer) or "Ready" (dishwasher) while running, in Home Assistant's time zone.
* **Progress:** bar, percentage and time left while running, with the phase (Rinse, Spin, Main wash, Drying, ...) and the programme (Eco 40-60, Eco 50°, ...) in readable words.
* **Attention:** one badge per machine, most important first, shown only while the machine is not running, since supplies and cleaning can only be dealt with then. It uses the progress bar's place, so the card does not grow. Tap it for the sensor behind it.
* **Unload** blinks softly until the machine is emptied. The washer shakes while running, faster while spinning; the dishwasher bobs. All animations stop when the system asks for reduced motion.
* **Actions:** tap and hold per machine use Home Assistant's own actions, so a tap can open a pop-up (`navigate`) or run a script (`perform-action`). The card never calls services on the machines: start and stop logic stays in your scripts and automations.
* Re-renders only when one of its own entities changes.

![Animations](https://raw.githubusercontent.com/BarBaar44/appliance-card/main/animation.gif)

## Install

HACS > three dots > Custom repositories > add `https://github.com/BarBaar44/appliance-card`, type **Dashboard**. Install, then reload the browser.

Needs HA 2024.11 or newer.

## Use

```yaml
type: custom:appliance-card
```

That shows the washer and the dishwasher with the default entities and actions below. To change anything, list the machines. Each takes a `profile` and overrides only what differs:

```yaml
type: custom:appliance-card
machines:
  - profile: washer
    name: Laundry
    tap_action:
      action: navigate
      navigation_path: "#laundry"
  - profile: dishwasher
    entities:
      salt: null          # null switches that part off
```

A full example with every entity is in [appliances.yaml](appliances.yaml).

### Card options

| Option     | Default                                    |
| ---------- | ------------------------------------------ |
| `machines` | washer and dishwasher. One to three machines, one column each |
| `title`    | none                                       |
| `colors`   | see below                                  |

### Machine options

| Option        | Default                                                               |
| ------------- | --------------------------------------------------------------------- |
| `profile`     | required: `washer` or `dishwasher`                                    |
| `name`        | `Laundry` / `Dishwasher`                                              |
| `entities`    | the profile's entities, see below                                     |
| `tap_action`  | washer: `navigate` to `#laundry`. Dishwasher: `perform-action` `script.diashwasher_script` |
| `hold_action` | `more-info`                                                           |
| `entity`      | the target for more-info: machine state (washer), operation state (dishwasher) |

A misspelled entity role shows an error card instead of being ignored.

### Washer

| Role             | Default entity (`…` = `samsung_washer_da_wm_tp2_20_common_`) |
| ---------------- | ---------------------------------------------- |
| `power`          | `binary_sensor.…power`                         |
| `running`        | `binary_sensor.…running`                       |
| `smart_control`  | `binary_sensor.…smart_control` (remote start armed) |
| `machine_state`  | `sensor.…machine_state` (idle, active, pause)  |
| `phase`          | `sensor.…progress`                             |
| `progress`       | `sensor.…progress_percent`                     |
| `remaining`      | `sensor.…completion_time` (minutes)            |
| `program`        | `select.…cycle`                                |
| `start_time`     | `sensor.laundry_start_time`                    |
| `unload`         | `input_boolean.laundry_state_helper`           |
| `door`           | `binary_sensor.laudry_door_sensor_contact` (on = open) |
| `detergent_low`  | `binary_sensor.…detergent_low`                 |
| `drum_clean_due` | `sensor.…drum_clean_due_in` (cycles, 0 or less = due) |

First match wins:

| When                        | Colour    | Status            | Shows                  |
| --------------------------- | --------- | ----------------- | ---------------------- |
| `unload` on                 | unload    | Unload (blinks)   | badge                  |
| machine state `pause`       | attention | Paused            | phase, finish, progress |
| `running` on                | running   | the phase         | programme, finish, progress |
| `smart_control` on          | waiting   | Waiting           | Start time, badge      |
| door closed and power off   | starting  | Program start     | badge                  |
| power on                    | attention | No remote control | badge                  |
| otherwise                   | off       | Off               | badge                  |

Badge: detergent low, then drum clean due.

### Dishwasher

| Role              | Default entity                                    |
| ----------------- | ------------------------------------------------- |
| `operation_state` | `sensor.siemens_dishwasher_operation_state`       |
| `power`           | `switch.siemens_dishwasher_power`                 |
| `door`            | `binary_sensor.siemens_dishwasher_door` (on = open) |
| `progress`        | `sensor.siemens_dishwasher_program_progress`      |
| `remaining`       | `sensor.siemens_dishwasher_remaining_program_time` (hours) |
| `phase`           | `sensor.siemens_dishwasher_program_phase`         |
| `program`         | `sensor.siemens_dishwasher_active_program`        |
| `rinse_aid`       | `sensor.siemens_dishwasher_rinse_aid`             |
| `salt`            | `sensor.siemens_dishwasher_salt`                  |
| `machine_care`    | `binary_sensor.siemens_dishwasher_machine_care`   |
| `start_time`      | `sensor.dishwasher_start_time`                    |

First match wins:

| When                               | Colour    | Status          | Shows                     |
| ---------------------------------- | --------- | --------------- | ------------------------- |
| operation state unavailable        | off       | Unavailable     |                           |
| `error` or `aborting`              | error     | Error           |                           |
| `actionrequired`                   | attention | Action required |                           |
| `run`                              | running   | the phase       | programme, ready, progress |
| `pause`                            | attention | Paused          | phase, ready, progress    |
| `finished`                         | unload    | Unload (blinks) | badge                     |
| door closed                        | waiting   | Waiting         | Start time, badge         |
| otherwise                          | off       | Door open       | badge                     |

`finished` wins over the door, because the dishwasher opens its own door near the end of a programme. Badge: rinse aid empty, then salt empty, then machine care due. `nearly_empty` does not count. Sensors that are `unknown` while the dishwasher is off are normal.

Remaining time follows the sensor's own unit (`min`, `h` or `s`) when it has one, else minutes for the washer and hours for the dishwasher. A timestamp works too.

### Colors

Each key takes any CSS color (`"#ff9800"`, `orange`, `var(--orange-color)`).

```yaml
colors:
  running: teal
```

| Key         | Used for                                         | Default               |
| ----------- | ------------------------------------------------ | --------------------- |
| `running`   | running                                          | `var(--green-color)`  |
| `waiting`   | waiting for the planned start                    | `var(--orange-color)` |
| `starting`  | washer door closed, auto start coming            | `var(--yellow-color)` |
| `attention` | paused, action required, washer on without remote control | `var(--amber-color)` |
| `unload`    | finished, waiting to be emptied                  | `var(--red-color)`    |
| `error`     | dishwasher error                                 | `var(--error-color)`  |
| `off`       | off, door open, unavailable                      | `var(--disabled-color)` |
| `badge`     | attention badges                                 | `var(--amber-color)`  |

## Layout

With two machines the right one is mirrored: icon on the far right, text aligned right. Progress bars always fill from left to right. With one or three machines every column is left aligned.

## Sizing

Full width by default (12 columns, height follows the content). The card is at most 118px high, so it fits 2 rows (120px) like the Heating Control Card with one room, and 62px when both machines are off without badges.

## Development

The card needs nothing to run. Tests use jsdom:

```sh
npm install
npm test
```

A release is made by bumping `VERSION` in `appliance-card.js`, adding a `## vX.Y.Z` section to [CHANGELOG.md](CHANGELOG.md), committing, and pushing a matching tag. The Release workflow checks the tag against `VERSION`, runs the tests and publishes the GitHub release with that changelog section as its notes.

## Licence

MIT
