/*
 * Appliance Card
 * One Lovelace card for the washing machine and the dishwasher, side by side:
 * what each machine is doing, when it starts or finishes, how far along it
 * is, and whether it needs attention.
 *
 * Every machine column follows a profile (washer or dishwasher) that turns
 * its entities into a colour, an icon, a status line, an optional time
 * (Start / Finish / Ready), progress while running, and one attention badge
 * while idle. All of this is plain JS: no Jinja, no template sensors.
 *
 * The card never calls services on the machines themselves. Tap and hold
 * run the configured Home Assistant actions (navigate to a pop-up, run a
 * script, more-info), so start and stop logic stays in scripts and
 * automations.
 *
 * https://github.com/BarBaar44/appliance-card  (MIT)
 */

const VERSION = "0.2.1";

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/* Profile defaults: the owner's own entities, overridable per machine. */
const WASHER_PREFIX = "samsung_washer_da_wm_tp2_20_common_";
const PROFILES = {
  washer: {
    name: "Laundry",
    time_label: "Finish",
    remaining_unit: "min",
    entities: {
      power: `binary_sensor.${WASHER_PREFIX}power`,
      running: `binary_sensor.${WASHER_PREFIX}running`,
      smart_control: `binary_sensor.${WASHER_PREFIX}smart_control`,
      machine_state: `sensor.${WASHER_PREFIX}machine_state`,
      phase: `sensor.${WASHER_PREFIX}progress`,
      progress: `sensor.${WASHER_PREFIX}progress_percent`,
      remaining: `sensor.${WASHER_PREFIX}completion_time`,
      program: `select.${WASHER_PREFIX}cycle`,
      start_time: "sensor.laundry_start_time",
      unload: "input_boolean.laundry_state_helper",
      door: "binary_sensor.laudry_door_sensor_contact",
      detergent_low: `binary_sensor.${WASHER_PREFIX}detergent_low`,
      drum_clean_due: `sensor.${WASHER_PREFIX}drum_clean_due_in`,
    },
    hold_entity: "machine_state",
    tap_action: { action: "navigate", navigation_path: "#laundry" },
  },
  dishwasher: {
    name: "Dishwasher",
    time_label: "Ready",
    remaining_unit: "h",
    entities: {
      operation_state: "sensor.siemens_dishwasher_operation_state",
      power: "switch.siemens_dishwasher_power",
      door: "binary_sensor.siemens_dishwasher_door",
      progress: "sensor.siemens_dishwasher_program_progress",
      remaining: "sensor.siemens_dishwasher_remaining_program_time",
      phase: "sensor.siemens_dishwasher_program_phase",
      program: "sensor.siemens_dishwasher_active_program",
      rinse_aid: "sensor.siemens_dishwasher_rinse_aid",
      salt: "sensor.siemens_dishwasher_salt",
      machine_care: "binary_sensor.siemens_dishwasher_machine_care",
      start_time: "sensor.dishwasher_start_time",
    },
    hold_entity: "operation_state",
    tap_action: { action: "perform-action", perform_action: "script.diashwasher_script" },
  },
};

/* colors key -> CSS variable and default. */
const COLORS = {
  running: ["--ac-running", "var(--green-color, #4caf50)"],
  waiting: ["--ac-waiting", "var(--orange-color, #ff9800)"],
  starting: ["--ac-starting", "var(--yellow-color, #ffeb3b)"],
  attention: ["--ac-attention", "var(--amber-color, #ffc107)"],
  unload: ["--ac-unload", "var(--red-color, #f44336)"],
  error: ["--ac-error", "var(--error-color, #db4437)"],
  off: ["--ac-off", "var(--disabled-color, #9e9e9e)"],
  badge: ["--ac-badge", "var(--amber-color, #ffc107)"],
};

const BAD = ["unknown", "unavailable", "none", ""];

/* Readable names. Unknown values fall back to a tidied version of the raw value. */
const WASHER_PHASES = {
  airwash: "Air wash", airwashing: "Air wash", cooling: "Cooling", delaywash: "Delay wash",
  drying: "Drying", dryingwithdooropen: "Drying, door open", finish: "Finishing", idle: "Idle",
  predrain: "Pre-drain", prewash: "Pre-wash", rinse: "Rinse", sanitizing: "Sanitizing",
  spin: "Spin", wash: "Washing", weightsensing: "Weighing", soaking: "Soaking",
};
const WASHER_PROGRAMS = {
  "1c": "Eco 40-60", "1b": "Cotton", "2f": "Activewear", "22": "Wool", "28": "Drain/Spin",
  "29": "Drum Clean+", "21": "Colors", "25": "Synthetics", "26": "Delicates", "2a": "Jeans",
  "32": "Shirts", "33": "Towels", "24": "Bedding", "23": "Outdoor", "27": "Rinse+Spin",
};
const DISH_PHASES = {
  prerinse: "Pre-rinse", mainwash: "Main wash", finalrinse: "Final rinse", drying: "Drying",
  intermediaterinse: "Rinse",
};
const DISH_PROGRAMS = {
  eco50: "Eco 50°", auto1: "Auto 35-45°", auto2: "Auto 45-65°", auto3: "Auto 65-75°",
  glas40: "Glass 40°", intensiv70: "Intensive 70°", intensiv45: "Intensive 45°",
  quick45: "Quick 45°", quick65: "Quick 65°", kurz60: "Short 60°", nightwash: "Silence",
  prerinse: "Pre-rinse", maschinepflege: "Machine care", machinecare: "Machine care",
  express: "Express",
};

const num = (v) => (v === undefined || v === null || v === "" || isNaN(Number(v)) ? null : Number(v));

/* "BSH.Common.EnumType.OperationState.Run" and "run" both become "run". */
const key = (v) => String(v == null ? "" : v).split(".").pop().toLowerCase().replace(/[\s_-]/g, "");

/* "dryingwithdooropen" -> "Dryingwithdooropen", "glas40" -> "Glas 40" */
const tidy = (v) => {
  const s = String(v).split(".").pop().replace(/_/g, " ").replace(/([a-z])(\d)/gi, "$1 $2").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

const phaseName = (map, raw) => {
  const k = key(raw);
  if (!k || BAD.includes(k)) return null;
  if (map[k]) return map[k];
  const pre = Object.keys(map).find((m) => k.startsWith(m)); // steamsoftening, weightsensing2
  if (pre) return map[pre];
  if (k.startsWith("steam")) return "Steam";
  return tidy(raw);
};

function washerProgram(raw) {
  if (raw == null || BAD.includes(String(raw).toLowerCase())) return null;
  const s = String(raw).trim();
  const code = s.match(/(?:^|[_\s])([0-9a-f]{2})$/i) || s.match(/^([0-9a-f]{2})$/i);
  if (code && WASHER_PROGRAMS[code[1].toLowerCase()]) return WASHER_PROGRAMS[code[1].toLowerCase()];
  return /^[0-9a-f]{2}$/i.test(s) ? `Programme ${s.toUpperCase()}` : tidy(s);
}

function dishProgram(raw) {
  if (raw == null || BAD.includes(String(raw).toLowerCase())) return null;
  const s = String(raw).split(".").pop().replace(/^dishcare_dishwasher_program_/i, "");
  const k = s.toLowerCase().replace(/[\s_-]/g, "");
  return DISH_PROGRAMS[k] || tidy(s);
}

const STYLE = `
  :host {
${Object.values(COLORS).map(([v, d]) => `    ${v}: ${d};`).join("\n")}
    --ac-soft: var(--secondary-background-color, rgba(127,127,127,.15));
  }
  ha-card { padding: 10px 0; box-sizing: border-box; }
  .title {
    padding: 0 12px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .title:empty { display: none; }
  /* One grid, one column per machine: lines stay aligned across machines. */
  .grid { display: grid; grid-template-rows: auto auto auto; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
  .cell {
    padding: 0 12px; min-width: 0; cursor: pointer; outline: none;
    -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
    touch-action: manipulation;
  }
  /* Two machines: the right one is mirrored, icon on the far right. */
  .cell.mirror { text-align: right; }
  .mirror .head { flex-direction: row-reverse; }
  .mirror .time { justify-content: flex-end; }
  .mirror .pl { flex-direction: row-reverse; }
  .m.pressed { opacity: .7; }
  .cell:focus-visible { box-shadow: inset 0 0 0 2px var(--primary-color); border-radius: 8px; }

  .head { display: flex; align-items: center; gap: 8px; }
  .icon {
    width: 40px; height: 40px; border-radius: 50%; flex: none;
    display: flex; align-items: center; justify-content: center;
    color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent);
    transition: background-color .3s, color .3s;
  }
  .icon ha-icon { --mdc-icon-size: 24px; display: flex; }
  .htext { min-width: 0; flex: 1; }
  .name { font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { font-size: 16px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .alert .status { color: var(--c); }

  /* Second line: the time when there is one, else the sub text. */
  .sub { font-size: 12px; line-height: 16px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-top: 6px; }
  .sub.hide, .sub:empty { display: none; }
  .time { display: none; align-items: baseline; gap: 6px; padding-top: 4px; line-height: 22px; }
  .time.show { display: flex; }
  .time .l { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .04em; }
  .time .t { font-size: 19px; font-weight: 600; color: var(--primary-text-color); font-variant-numeric: tabular-nums; }

  .prog { display: none; padding-top: 6px; }
  .prog.show { display: block; }
  .bar { height: 5px; border-radius: 3px; background: var(--ac-soft); overflow: hidden; }
  .bar i { display: block; height: 100%; width: 0; background: var(--c); border-radius: 3px; transition: width .4s; }
  .pl { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; line-height: 14px; color: var(--secondary-text-color); padding-top: 3px; font-variant-numeric: tabular-nums; }
  .pl span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pl .left { flex: none; }

  .badge {
    display: none; margin-top: 6px; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500;
    padding: 4px 7px; border-radius: 8px; max-width: 100%; box-sizing: border-box; white-space: nowrap; overflow: hidden;
    color: var(--ac-badge); background: color-mix(in srgb, var(--ac-badge) 15%, transparent);
  }
  .badge.show { display: inline-flex; }
  .badge ha-icon { --mdc-icon-size: 14px; display: flex; flex: none; }
  .badge span { overflow: hidden; text-overflow: ellipsis; }

  /* Running: a washer that shakes a little (faster while spinning), a dishwasher that bobs. */
  .washer.running .icon ha-icon { animation: wobble 1.2s ease-in-out infinite; transform-origin: 50% 80%; }
  .washer.running.spin .icon ha-icon { animation-duration: .35s; }
  .dishwasher.running .icon ha-icon { animation: bob 1.8s ease-in-out infinite; }
  /* Unload: status and icon blink softly until the machine is emptied. */
  .unloading .status { animation: blink 1.6s ease-in-out infinite; }
  .unloading .icon { animation: ring 1.6s ease-in-out infinite; }
  @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  @keyframes ring {
    0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c) 45%, transparent); }
    50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 0%, transparent); }
  }
  @keyframes wobble {
    0%, 100% { transform: rotate(0deg); }
    25% { transform: rotate(-4deg); }
    75% { transform: rotate(4deg); }
  }
  @keyframes bob {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .icon ha-icon, .unloading .status, .unloading .icon { animation: none !important; }
    .icon, .bar i { transition: none; }
  }
`;

class ApplianceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._seen = Object.create(null);
    this._ids = [];
  }

  static getConfigElement() {
    return document.createElement("appliance-card-editor");
  }

  static getStubConfig() {
    return { machines: [{ profile: "washer" }, { profile: "dishwasher" }] };
  }

  setConfig(config) {
    const c = config || {};
    if (c.colors != null && (typeof c.colors !== "object" || Array.isArray(c.colors))) {
      throw new Error("colors must be a map, e.g. running: green");
    }
    const raw = c.machines == null ? [{ profile: "washer" }, { profile: "dishwasher" }] : c.machines;
    if (!Array.isArray(raw) || !raw.length) throw new Error("machines must be a list with at least one machine");
    if (raw.length > 3) throw new Error("machines: at most 3");
    this._machines = raw.map((m, i) => this._normalize(m, i));
    this._config = { title: c.title || "", colors: c.colors || {} };
    this._applyColors(this._config.colors);

    this._ids = [...new Set(this._machines.flatMap((m) => Object.values(m.entities).filter(Boolean)))];
    this._seen = Object.create(null);
    this._build();
    if (this._hass) this._update();
  }

  _normalize(m, i) {
    const where = `machines[${i}]`;
    if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error(`${where} must be a map with a profile`);
    const p = PROFILES[m.profile];
    if (!p) throw new Error(`${where}.profile must be one of: ${Object.keys(PROFILES).join(", ")}`);
    const ent = m.entities || {};
    if (typeof ent !== "object" || Array.isArray(ent)) throw new Error(`${where}.entities must be a map`);
    for (const k of Object.keys(ent)) {
      if (!(k in p.entities)) {
        throw new Error(`${where}.entities: unknown role '${k}' for ${m.profile}. Known: ${Object.keys(p.entities).join(", ")}`);
      }
      if (ent[k] !== null && (typeof ent[k] !== "string" || !ent[k].includes("."))) {
        throw new Error(`${where}.entities.${k}: '${ent[k]}' is not an entity id (null switches it off)`);
      }
    }
    const entities = { ...p.entities, ...ent };
    const holdEntity = entities[p.hold_entity];
    return {
      profile: m.profile,
      name: m.name || p.name,
      timeLabel: p.time_label,
      remainingUnit: p.remaining_unit,
      entities,
      tap_action: m.tap_action || p.tap_action,
      hold_action: m.hold_action || { action: "more-info" },
      entity: m.entity || holdEntity, // more-info target for actions
    };
  }

  _applyColors(colors) {
    Object.keys(colors).forEach((k) => {
      if (!COLORS[k]) console.warn(`appliance-card: unknown colors key "${k}". Known: ${Object.keys(COLORS).join(", ")}`);
    });
    Object.entries(COLORS).forEach(([k, [v]]) => {
      const val = typeof colors[k] === "string" && colors[k].trim() ? colors[k].trim() : null;
      if (val) this.style.setProperty(v, val);
      else this.style.removeProperty(v);
    });
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._machines) return;
    let changed = first;
    for (const id of this._ids) {
      const s = hass.states[id];
      if (s !== this._seen[id]) {
        this._seen[id] = s;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }

  /* ---- DOM, built once per config ---------------------------------------- */

  _build() {
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card>
        <div class="title"></div>
        <div class="grid"></div>
      </ha-card>`;
    this.shadowRoot.querySelector(".title").textContent = this._config.title;
    const grid = this.shadowRoot.querySelector(".grid");
    this._cols = this._machines.map((m, i) => {
      const cells = [0, 1, 2].map(() => {
        const cell = document.createElement("div");
        const mirror = this._machines.length === 2 && i === 1;
        cell.className = `cell m ${m.profile}${mirror ? " mirror" : ""}`;
        grid.appendChild(cell);
        return cell;
      });
      cells[0].innerHTML = `
        <div class="head">
          <div class="icon"><ha-icon></ha-icon></div>
          <div class="htext"><div class="name"></div><div class="status"></div></div>
        </div>`;
      cells[1].innerHTML = `<div class="sub"></div><div class="time"><span class="l"></span><span class="t"></span></div>`;
      cells[2].innerHTML = `
        <div class="prog"><div class="bar"><i></i></div><div class="pl"><span class="what"></span><span class="left"></span></div></div>
        <div class="badge"><ha-icon></ha-icon><span></span></div>`;
      // Tapping the badge opens the sensor behind it instead of the machine's action.
      const badge = cells[2].querySelector(".badge");
      ["pointerdown", "pointerup", "keydown"].forEach((t) => badge.addEventListener(t, (e) => e.stopPropagation()));
      badge.addEventListener("click", (e) => {
        e.stopPropagation();
        if (badge.dataset.entity) {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: badge.dataset.entity }, bubbles: true, composed: true,
          }));
        }
      });
      cells[0].setAttribute("role", "button");
      cells[0].tabIndex = 0;
      cells.forEach((cell) => this._bindPress(cell, cells, m));
      const q = (n, s) => cells[n].querySelector(s);
      const refs = {
        cells, icon: q(0, ".icon ha-icon"), name: q(0, ".name"), status: q(0, ".status"),
        sub: q(1, ".sub"), time: q(1, ".time"), timeL: q(1, ".time .l"), timeT: q(1, ".time .t"),
        prog: q(2, ".prog"), fill: q(2, ".bar i"), what: q(2, ".what"), left: q(2, ".left"),
        badge: q(2, ".badge"), badgeIcon: q(2, ".badge ha-icon"), badgeText: q(2, ".badge span"),
      };
      refs.name.textContent = m.name;
      return refs;
    });
  }

  /* ---- actions ------------------------------------------------------------ */

  _bindPress(el, group, m) {
    let timer = null;
    let start = null;
    let held = false;
    const setPressed = (on) => group.forEach((c) => c.classList.toggle("pressed", on));
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
      start = null;
      setPressed(false);
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      setPressed(true);
      timer = setTimeout(() => {
        timer = null;
        held = true;
        setPressed(false);
        this._action(m, "hold");
      }, HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
    });
    el.addEventListener("pointerup", () => {
      if (!start) return;
      const wasHeld = held;
      cancel();
      if (!wasHeld) this._action(m, "tap");
    });
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      this._action(m, "tap");
    });
  }

  /*
   * Hands the action to Home Assistant's own handler (hass-action), so
   * navigate, perform-action, more-info, url and confirmations behave
   * exactly as in built-in cards.
   */
  _action(m, kind) {
    const conf = kind === "hold" ? m.hold_action : m.tap_action;
    if (!conf || conf.action === "none") return;
    window.dispatchEvent(new CustomEvent("haptic", { detail: kind === "hold" ? "medium" : "light" }));
    this.dispatchEvent(new CustomEvent("hass-action", {
      bubbles: true,
      composed: true,
      detail: {
        config: { entity: m.entity, tap_action: m.tap_action, hold_action: m.hold_action },
        action: kind,
      },
    }));
  }

  /* ---- state -------------------------------------------------------------- */

  _s(id) {
    return id && this._hass ? this._hass.states[id] : undefined;
  }

  _val(id) {
    const s = this._s(id);
    return s && !BAD.includes(String(s.state).toLowerCase()) ? s.state : null;
  }

  _on(id) {
    const s = this._s(id);
    return !!s && s.state === "on";
  }

  /* Minutes left, from minutes, hours, seconds or a finish timestamp. */
  _minutesLeft(id, defaultUnit) {
    const s = this._s(id);
    if (!s || BAD.includes(String(s.state).toLowerCase())) return null;
    const n = num(s.state);
    if (n === null) {
      const t = Date.parse(s.state);
      return isNaN(t) ? null : Math.max(0, (t - Date.now()) / 60000);
    }
    const unit = String(s.attributes.unit_of_measurement || defaultUnit).toLowerCase();
    if (unit === "h") return n * 60;
    if (unit === "s") return n / 60;
    return n;
  }

  _clock(ms) {
    const h = this._hass;
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
    const tz = h && h.config && h.config.time_zone;
    const lang = (h && h.locale && h.locale.language) || (h && h.language) || "en";
    try {
      return new Intl.DateTimeFormat(lang, tz ? { ...opts, timeZone: tz } : opts).format(new Date(ms));
    } catch (_) {
      return new Intl.DateTimeFormat("en-GB", opts).format(new Date(ms));
    }
  }

  _startClock(id) {
    const v = this._val(id);
    const t = v ? Date.parse(v) : NaN;
    return isNaN(t) ? null : this._clock(t);
  }

  _duration(min) {
    const m = Math.max(0, Math.round(min));
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  }

  _progress(m, view) {
    const e = m.entities;
    const pct = num(this._val(e.progress));
    const left = this._minutesLeft(e.remaining, m.remainingUnit);
    view.pct = pct === null ? null : Math.max(0, Math.min(100, Math.round(pct)));
    view.left = left;
    if (left !== null) view.time = [m.timeLabel, this._clock(Date.now() + left * 60000)];
  }

  /* Washer rules, first match wins. */
  _washer(m) {
    const e = m.entities;
    const v = { colour: "off", icon: "mdi:washing-machine", status: "Off", sub: "" };
    const program = washerProgram(this._val(e.program));
    const phaseRaw = this._val(e.phase);
    const mstate = key(this._val(e.machine_state));
    const doorClosed = !!this._s(e.door) && this._s(e.door).state === "off";

    if (this._on(e.unload)) {
      Object.assign(v, { colour: "unload", icon: "mdi:washing-machine-alert", status: "Unload", sub: "Finished", alert: true });
    } else if (mstate === "pause") {
      Object.assign(v, { colour: "attention", status: "Paused", sub: phaseName(WASHER_PHASES, phaseRaw) || program || "", active: true });
      this._progress(m, v);
    } else if (this._on(e.running)) {
      Object.assign(v, { colour: "running", status: phaseName(WASHER_PHASES, phaseRaw) || "Running", sub: program || "", active: true, running: true });
      v.spin = key(phaseRaw) === "spin";
      this._progress(m, v);
    } else if (this._on(e.smart_control)) {
      Object.assign(v, { colour: "waiting", status: "Waiting", sub: "Remote start armed" });
      const st = this._startClock(e.start_time);
      if (st) v.time = ["Start", st];
    } else if (doorClosed && !this._on(e.power)) {
      Object.assign(v, { colour: "starting", status: "Program start", sub: "Auto start in ~10 min" });
    } else if (this._on(e.power)) {
      Object.assign(v, { colour: "attention", status: "No remote control", sub: program || "" });
    }

    if (!v.active) {
      const due = num(this._val(e.drum_clean_due));
      if (this._on(e.detergent_low)) v.badge = ["mdi:bottle-tonic-outline", "Detergent low", e.detergent_low];
      else if (due !== null && due <= 0) v.badge = ["mdi:washing-machine", "Drum clean due", e.drum_clean_due];
    }
    return v;
  }

  /* Dishwasher rules, first match wins. Unknown sensors while off are normal. */
  _dishwasher(m) {
    const e = m.entities;
    const v = { colour: "off", icon: "mdi:dishwasher", status: "Door open", sub: "" };
    const op = key(this._val(e.operation_state));
    const program = dishProgram(this._val(e.program));
    const phase = phaseName(DISH_PHASES, this._val(e.phase));
    const door = this._s(e.door);
    const doorClosed = !!door && door.state === "off";
    const offline = !this._s(e.operation_state) || this._s(e.operation_state).state === "unavailable";

    if (offline) {
      Object.assign(v, { colour: "off", icon: "mdi:dishwasher-off", status: "Unavailable", sub: "" });
    } else if (op === "error" || op === "aborting") {
      Object.assign(v, { colour: "error", icon: "mdi:dishwasher-alert", status: "Error", sub: "Check display", alert: true });
    } else if (op === "actionrequired") {
      Object.assign(v, { colour: "attention", icon: "mdi:dishwasher-alert", status: "Action required", sub: "Check display", alert: true });
    } else if (op === "run") {
      Object.assign(v, { colour: "running", status: phase || "Running", sub: program || "", active: true, running: true });
      this._progress(m, v);
    } else if (op === "pause") {
      Object.assign(v, { colour: "attention", status: "Paused", sub: phase || program || "", active: true });
      this._progress(m, v);
    } else if (op === "finished") {
      Object.assign(v, { colour: "unload", icon: "mdi:dishwasher-alert", status: "Unload", sub: "Finished", alert: true });
    } else if (doorClosed) {
      Object.assign(v, { colour: "waiting", status: "Waiting", sub: "Cheapest hour" });
      const st = this._startClock(e.start_time);
      if (st) v.time = ["Start", st];
    }

    if (!v.active) {
      // Empty first; nearly_empty is the dishwasher's own "refill" warning and the value it reports in practice.
      const rinse = key(this._val(e.rinse_aid));
      const salt = key(this._val(e.salt));
      if (rinse === "empty") v.badge = ["mdi:shimmer", "Rinse aid empty", e.rinse_aid];
      else if (salt === "empty") v.badge = ["mdi:shaker-outline", "Salt empty", e.salt];
      else if (rinse === "nearlyempty") v.badge = ["mdi:shimmer", "Refill rinse aid", e.rinse_aid];
      else if (salt === "nearlyempty") v.badge = ["mdi:shaker-outline", "Refill salt", e.salt];
      else if (this._on(e.machine_care)) v.badge = ["mdi:wrench-clock", "Machine care due", e.machine_care];
    }
    return v;
  }

  _update() {
    if (!this._hass || !this._cols) return;
    this._machines.forEach((m, i) => {
      const r = this._cols[i];
      const v = m.profile === "washer" ? this._washer(m) : this._dishwasher(m);

      r.cells.forEach((cell) => {
        cell.style.setProperty("--c", `var(${COLORS[v.colour][0]})`);
        cell.classList.toggle("running", !!v.running);
        cell.classList.toggle("spin", !!v.spin);
        cell.classList.toggle("alert", !!v.alert);
        cell.classList.toggle("unloading", v.colour === "unload");
      });
      if (r.icon.getAttribute("icon") !== v.icon) r.icon.setAttribute("icon", v.icon);
      if (r.status.textContent !== v.status) r.status.textContent = v.status;
      if (r.sub.textContent !== v.sub) r.sub.textContent = v.sub;
      r.sub.classList.toggle("hide", !!v.time);
      r.cells[0].setAttribute("aria-label", `${m.name}: ${v.status}`);

      r.time.classList.toggle("show", !!v.time);
      if (v.time) {
        r.timeL.textContent = v.time[0];
        r.timeT.textContent = v.time[1];
      }

      // Progress while active; otherwise the same slot holds the badge.
      const showProg = !!v.active && (v.pct != null || v.left != null);
      r.prog.classList.toggle("show", showProg);
      if (showProg) {
        r.fill.style.width = `${v.pct || 0}%`;
        // Programme or phase on the left; % and time left on the right.
        r.what.textContent = v.sub;
        r.left.textContent = [v.pct != null ? `${v.pct}%` : "", v.left != null ? `${this._duration(v.left)} left` : ""]
          .filter(Boolean).join(" · ");
      }
      r.badge.classList.toggle("show", !!v.badge);
      if (v.badge) {
        r.badgeIcon.setAttribute("icon", v.badge[0]);
        r.badgeText.textContent = v.badge[1];
        r.badge.dataset.entity = v.badge[2] || "";
      }
    });
  }
}

/* ------------------------------------------------------------------------ */
/* Visual editor                                                            */
/* ------------------------------------------------------------------------ */

/*
 * Built on HA's own <ha-form>. One section per machine, with an empty slot
 * after the last one to add another (at most 3). Every field shows the value
 * in use, the profile's defaults included; only values that differ from the
 * defaults are written to the YAML. Clearing an entity switches that part
 * off (null). Changing a machine's profile starts it from the new profile's
 * defaults. The default pair (washer, dishwasher, nothing changed) is not
 * written at all. Options the editor does not show (grid_options, ...) are
 * kept.
 */

const APPLIANCE_DEFAULT_MACHINES = [{ profile: "washer" }, { profile: "dishwasher" }];
const APPLIANCE_MAX_MACHINES = 3;
const APPLIANCE_MACHINE_KEYS = ["profile", "name", "entities", "tap_action", "hold_action", "entity"];

const APPLIANCE_ROLE_LABELS = {
  power: "Power",
  running: "Running",
  smart_control: "Remote control (smart control)",
  machine_state: "Machine state",
  operation_state: "Operation state",
  phase: "Phase",
  progress: "Progress %",
  remaining: "Time left",
  program: "Programme",
  start_time: "Planned start time",
  unload: "Unload reminder",
  door: "Door",
  detergent_low: "Detergent low",
  drum_clean_due: "Drum clean due in (cycles)",
  rinse_aid: "Rinse aid",
  salt: "Salt",
  machine_care: "Machine care due",
};

const APPLIANCE_PROFILE_LABELS = { washer: "Washer", dishwasher: "Dishwasher", none: "None (remove)" };

const applianceSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function applianceMachineSchema(i, profile) {
  const options = Object.keys(PROFILES).concat(i > 0 ? ["none"] : [])
    .map((value) => ({ value, label: APPLIANCE_PROFILE_LABELS[value] || value }));
  const schema = [{
    type: "grid",
    name: "",
    schema: [
      { name: "profile", selector: { select: { mode: "dropdown", options } } },
      ...(PROFILES[profile] ? [{ name: "name", selector: { text: {} } }] : []),
    ],
  }];
  if (PROFILES[profile]) {
    schema.push(
      {
        type: "expandable",
        name: "entities",
        title: "Entities",
        icon: "mdi:format-list-bulleted",
        schema: Object.keys(PROFILES[profile].entities).map((role) => ({ name: role, selector: { entity: {} } })),
      },
      { name: "tap_action", selector: { ui_action: {} } },
      { name: "hold_action", selector: { ui_action: { default_action: "more-info" } } },
      { name: "entity", selector: { entity: {} } },
    );
  }
  return {
    type: "expandable",
    name: `m${i}`,
    title: PROFILES[profile] ? `Machine ${i + 1}: ${APPLIANCE_PROFILE_LABELS[profile]}` : `Machine ${i + 1}: add one`,
    icon: profile === "washer" ? "mdi:washing-machine" : profile === "dishwasher" ? "mdi:dishwasher" : "mdi:plus",
    expanded: false,
    schema,
  };
}

const applianceEditorSchema = (profiles) => [
  { name: "title", selector: { text: {} } },
  ...profiles.map((p, i) => applianceMachineSchema(i, p)),
  {
    type: "expandable",
    name: "colors",
    title: "Colours",
    icon: "mdi:palette",
    schema: [{
      type: "grid",
      name: "",
      schema: Object.keys(COLORS).map((k) => ({ name: k, selector: { text: {} } })),
    }],
  },
];

const APPLIANCE_EDITOR_LABELS = {
  title: "Title",
  profile: "Machine",
  name: "Name",
  tap_action: "Tap action (empty: the profile's default)",
  hold_action: "Hold action",
  entity: "More-info entity",
  running: "running",
  waiting: "waiting for the start time",
  starting: "ready to start",
  attention: "attention",
  unload: "unload",
  error: "error",
  off: "off",
  badge: "badge",
  ...APPLIANCE_ROLE_LABELS,
};

class ApplianceCardEditor extends HTMLElement {
  /* config -> form data: the profile's defaults filled in, null shown as empty. */
  static toData(config) {
    const machines = Array.isArray(config.machines) && config.machines.length ? config.machines : APPLIANCE_DEFAULT_MACHINES;
    const data = { title: config.title || "", colors: { ...(config.colors || {}) } };
    machines.slice(0, APPLIANCE_MAX_MACHINES).forEach((m, i) => {
      const p = PROFILES[m && m.profile];
      if (!p) return;
      const ent = m.entities || {};
      const entities = {};
      for (const [role, def] of Object.entries(p.entities)) {
        const v = role in ent ? ent[role] : def;
        entities[role] = v || "";
      }
      data[`m${i}`] = {
        profile: m.profile,
        name: m.name || p.name,
        entities,
        tap_action: m.tap_action,
        hold_action: m.hold_action,
        entity: m.entity || p.entities[p.hold_entity] || "",
      };
    });
    return data;
  }

  /* form data -> config: only what differs from the profile defaults; cleared entity -> null. */
  static toConfig(data, previous) {
    const prev = previous || {};
    const config = { type: "custom:appliance-card" };
    for (const [k, v] of Object.entries(prev)) {
      if (!["type", "title", "machines", "colors"].includes(k)) config[k] = v;
    }
    if (typeof data.title === "string" && data.title.trim()) config.title = data.title;

    const prevMachines = Array.isArray(prev.machines) && prev.machines.length ? prev.machines : APPLIANCE_DEFAULT_MACHINES;
    const machines = [];
    for (let i = 0; i < APPLIANCE_MAX_MACHINES; i++) {
      const slot = data[`m${i}`];
      if (!slot || !PROFILES[slot.profile]) break;
      const p = PROFILES[slot.profile];
      const pm = prevMachines[i];
      const out = { profile: slot.profile };
      machines.push(out);
      // A new profile starts from that profile's defaults.
      if (!pm || pm.profile !== slot.profile) continue;
      for (const [k, v] of Object.entries(pm)) {
        if (!APPLIANCE_MACHINE_KEYS.includes(k)) out[k] = v;
      }
      if (slot.name && slot.name !== p.name) out.name = slot.name;
      const entities = {};
      for (const [role, def] of Object.entries(p.entities)) {
        const v = (slot.entities || {})[role];
        if (!v) entities[role] = null;
        else if (v !== def) entities[role] = v;
      }
      if (Object.keys(entities).length) out.entities = entities;
      if (slot.tap_action && Object.keys(slot.tap_action).length) out.tap_action = slot.tap_action;
      if (slot.hold_action && Object.keys(slot.hold_action).length) out.hold_action = slot.hold_action;
      if (slot.entity && slot.entity !== p.entities[p.hold_entity]) out.entity = slot.entity;
    }
    if (machines.length && !applianceSame(machines, APPLIANCE_DEFAULT_MACHINES)) config.machines = machines;

    const colors = {};
    for (const [k, v] of Object.entries(data.colors || {})) {
      if (typeof v === "string" && v.trim()) colors[k] = v.trim();
    }
    if (Object.keys(colors).length) config.colors = colors;
    return config;
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  connectedCallback() {
    this._loadForm().then(() => this._render());
  }

  /* ha-form is lazy loaded by HA; load it through a built-in card's editor. */
  async _loadForm() {
    if (customElements.get("ha-form")) return;
    try {
      const helpers = await window.loadCardHelpers();
      const card = await helpers.createCardElement({ type: "entities", entities: [] });
      if (card.constructor.getConfigElement) await card.constructor.getConfigElement();
    } catch (_) {
      /* rendered as soon as HA has loaded it */
    }
    await customElements.whenDefined("ha-form");
  }

  _render() {
    if (!this._config || !customElements.get("ha-form")) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => APPLIANCE_EDITOR_LABELS[s.name] || s.name.replace(/_/g, " ");
      this._form.addEventListener("value-changed", (e) => {
        e.stopPropagation();
        const config = ApplianceCardEditor.toConfig(e.detail.value, this._config);
        this._config = config;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    const data = ApplianceCardEditor.toData(this._config);
    const profiles = [];
    for (let i = 0; i < APPLIANCE_MAX_MACHINES && data[`m${i}`]; i++) profiles.push(data[`m${i}`].profile);
    // One empty slot after the machines in use, to add another.
    if (profiles.length < APPLIANCE_MAX_MACHINES) {
      data[`m${profiles.length}`] = { profile: "none" };
      profiles.push("none");
    }
    const key = profiles.join(",");
    if (this._schemaKey !== key) {
      this._schemaKey = key;
      this._form.schema = applianceEditorSchema(profiles);
    }
    this._form.hass = this._hass;
    this._form.data = data;
  }
}

if (!customElements.get("appliance-card")) {
  customElements.define("appliance-card", ApplianceCard);
}
if (!customElements.get("appliance-card-editor")) {
  customElements.define("appliance-card-editor", ApplianceCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "appliance-card")) {
  window.customCards.push({
    type: "appliance-card",
    name: "Appliance Card",
    description: "Washing machine and dishwasher side by side: status, start or finish time, progress and attention badges.",
    preview: true,
    documentationURL: "https://github.com/BarBaar44/appliance-card",
  });
}

console.info(`%c APPLIANCE-CARD %c ${VERSION} `, "background:#4caf50;color:#fff", "");
