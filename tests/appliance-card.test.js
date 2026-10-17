// Tests for appliance-card.js in a simulated browser. Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;
w.eval(fs.readFileSync(path.join(__dirname, "..", "appliance-card.js"), "utf8"));
const Card = w.customElements.get("appliance-card");
assert(Card, "registered");

const W = "samsung_washer_da_wm_tp2_20_common_";
const D = "sensor.siemens_dishwasher_";
const st = (state, attributes = {}) => ({ state: String(state), attributes, last_changed: "x" });

const washer = (o = {}) => ({
  [`binary_sensor.${W}power`]: st(o.power || "off"),
  [`binary_sensor.${W}running`]: st(o.running || "off"),
  [`binary_sensor.${W}smart_control`]: st(o.smart || "off"),
  [`sensor.${W}machine_state`]: st(o.mstate || "idle"),
  [`sensor.${W}progress`]: st(o.phase || "idle"),
  [`sensor.${W}progress_percent`]: st(o.pct ?? 0),
  [`sensor.${W}completion_time`]: st(o.left ?? 195, { unit_of_measurement: "min" }),
  [`select.${W}cycle`]: st(o.cycle || "1C"),
  "sensor.laundry_start_time": st(o.start || "unknown"),
  "input_boolean.laundry_state_helper": st(o.unload || "off"),
  "binary_sensor.laudry_door_sensor_contact": st(o.door || "on"),
  [`binary_sensor.${W}detergent_low`]: st(o.detergent || "off"),
  [`sensor.${W}drum_clean_due_in`]: st(o.drum ?? 12),
});
const dish = (o = {}) => ({
  [`${D}operation_state`]: st(o.op || "inactive"),
  "switch.siemens_dishwasher_power": st(o.power || "off"),
  "binary_sensor.siemens_dishwasher_door": st(o.door || "on"),
  [`${D}program_progress`]: st(o.pct ?? "unknown"),
  [`${D}remaining_program_time`]: st(o.left ?? "unknown", o.unit === null ? {} : { unit_of_measurement: o.unit || "h" }),
  [`${D}program_phase`]: st(o.phase || "none"),
  [`${D}active_program`]: st(o.program || "unknown"),
  [`${D}rinse_aid`]: st(o.rinse || "full"),
  [`${D}salt`]: st(o.salt || "full"),
  "binary_sensor.siemens_dishwasher_machine_care": st(o.care || "off"),
  "sensor.dishwasher_start_time": st(o.start || "unknown"),
});
const hass = (states) => ({ states, language: "en", locale: { language: "en" }, config: { time_zone: "UTC" } });

/* Renders a card and returns what each machine column shows. */
function render(states, config = {}) {
  const c = new Card();
  w.document.body.appendChild(c);
  c.setConfig(config);
  c.hass = hass(states);
  const read = (i) => {
    const r = c._cols[i];
    return {
      status: r.status.textContent,
      sub: r.sub.textContent,
      icon: r.icon.getAttribute("icon"),
      colour: r.cells[0].style.getPropertyValue("--c"),
      time: r.time.classList.contains("show") ? `${r.timeL.textContent} ${r.timeT.textContent}` : null,
      prog: r.prog.classList.contains("show") ? `${r.what.textContent}|${r.left.textContent}` : null,
      subShown: !r.sub.classList.contains("hide") && r.sub.textContent !== "",
      badge: r.badge.classList.contains("show") ? r.badgeText.textContent : null,
      running: r.cells[0].classList.contains("running"),
      spin: r.cells[0].classList.contains("spin"),
      unloading: r.cells[0].classList.contains("unloading"),
    };
  };
  return { card: c, washer: read(0), dish: read(1) };
}
const col = (k) => `var(--ac-${k})`;
const iso = (h, m) => new Date(Date.UTC(2030, 0, 1, h, m)).toISOString();

/* ---- washer ---------------------------------------------------------------- */

let r = render({ ...washer({ power: "on", running: "on", mstate: "active", phase: "rinse", pct: 62, left: 65, door: "off", detergent: "on" }), ...dish() });
assert.equal(r.washer.status, "Rinse");
assert.equal(r.washer.sub, "Eco 40-60");
assert.equal(r.washer.colour, col("running"));
assert.match(r.washer.time, /^Finish \d\d:\d\d$/);
assert.equal(r.washer.prog, "Eco 40-60|62% · 1:05 left");
assert(!r.washer.subShown, "time replaces the sub line");
assert.equal(r.washer.badge, null, "no badge while running");
assert(r.washer.running && !r.washer.spin);

r = render({ ...washer({ running: "on", phase: "spin", pct: 90, left: 8 }), ...dish() });
assert(r.washer.spin, "spin phase speeds up the animation");
assert.equal(r.washer.status, "Spin");

r = render({ ...washer({ running: "on", phase: "weightsensing2", cycle: "Table_00_Course_2A" }), ...dish() });
assert.equal(r.washer.status, "Weighing");
assert.equal(r.washer.sub, "Jeans");

r = render({ ...washer({ mstate: "pause", running: "on", phase: "wash", pct: 40, left: 50 }), ...dish() });
assert.equal(r.washer.status, "Paused");
assert.equal(r.washer.sub, "Washing");
assert.equal(r.washer.colour, col("attention"));
assert.equal(r.washer.prog, "Washing|40% · 0:50 left");

r = render({ ...washer({ unload: "on", running: "on", drum: 0 }), ...dish() });
assert.equal(r.washer.status, "Unload", "unload wins over everything");
assert.equal(r.washer.icon, "mdi:washing-machine-alert");
assert.equal(r.washer.colour, col("unload"));
assert(r.washer.unloading);
assert.equal(r.washer.badge, "Drum clean due");

r = render({ ...washer({ power: "on", smart: "on", start: iso(1, 0), door: "off", detergent: "on" }), ...dish() });
assert.equal(r.washer.status, "Waiting");
assert.equal(r.washer.sub, "Remote start armed");
assert.equal(r.washer.time, "Start 01:00");
assert.equal(r.washer.colour, col("waiting"));
assert.equal(r.washer.badge, "Detergent low", "detergent before drum clean");

r = render({ ...washer({ smart: "on" }), ...dish() });
assert.equal(r.washer.time, null, "no start time without a timestamp");

r = render({ ...washer({ door: "off" }), ...dish() });
assert.equal(r.washer.status, "Program start");
assert(r.washer.subShown, "sub line when there is no time");
assert.equal(r.washer.colour, col("starting"));

r = render({ ...washer({ power: "on", door: "on" }), ...dish() });
assert.equal(r.washer.status, "No remote control");
assert.equal(r.washer.colour, col("attention"));

r = render({ ...washer({ door: "on" }), ...dish() });
assert.equal(r.washer.status, "Off");
assert.equal(r.washer.colour, col("off"));
assert.equal(r.washer.prog, null);

/* ---- dishwasher ------------------------------------------------------------ */

r = render({ ...washer(), ...dish({ op: "run", door: "off", pct: 35, left: 2.92, phase: "mainwash", program: "dishcare_dishwasher_program_eco50" }) });
assert.equal(r.dish.status, "Main wash");
assert.equal(r.dish.sub, "Eco 50°");
assert.equal(r.dish.colour, col("running"));
assert.match(r.dish.time, /^Ready \d\d:\d\d$/);
assert.equal(r.dish.prog, "Eco 50°|35% · 2:55 left", "hours are converted");
assert(r.dish.running);

r = render({ ...washer(), ...dish({ op: "BSH.Common.EnumType.OperationState.Run", left: 30, unit: "min", program: "glas40", rinse: "empty" }) });
assert.equal(r.dish.status, "Running", "namespaced state, no phase");
assert.equal(r.dish.sub, "Glass 40°");
assert.equal(r.dish.prog, "Glass 40°|0:30 left", "unit from the sensor wins");
assert.equal(r.dish.badge, null, "no badge while running");

r = render({ ...washer(), ...dish({ op: "finished", door: "on" }) });
assert.equal(r.dish.status, "Unload", "finished wins over the auto-opened door");
assert.equal(r.dish.colour, col("unload"));
assert(r.dish.unloading);

r = render({ ...washer(), ...dish({ op: "ready", door: "off", start: iso(2, 40), rinse: "nearly_empty", salt: "empty" }) });
assert.equal(r.dish.status, "Waiting");
assert.equal(r.dish.time, "Start 02:40");
assert.equal(r.dish.colour, col("waiting"));
assert.equal(r.dish.badge, "Salt empty", "empty beats nearly_empty");

r = render({ ...washer(), ...dish({ op: "ready", door: "on", rinse: "nearly_empty", salt: "nearly_empty", care: "on" }) });
assert.equal(r.dish.badge, "Refill rinse aid", "nearly_empty rinse aid shows, before salt and machine care");

r = render({ ...washer(), ...dish({ op: "ready", door: "on", salt: "nearly_empty", care: "on" }) });
assert.equal(r.dish.badge, "Refill salt", "nearly_empty salt shows, before machine care");

r = render({ ...washer(), ...dish({ op: "BSH.Common.EnumType.OperationState.Run", left: 30, unit: "min", rinse: "nearly_empty" }) });
assert.equal(r.dish.badge, null, "no supply badge while running");

r = render({ ...washer(), ...dish({ op: "inactive", door: "on", rinse: "empty", care: "on" }) });
assert.equal(r.dish.status, "Door open");
assert.equal(r.dish.colour, col("off"));
assert.equal(r.dish.badge, "Rinse aid empty", "rinse aid first");

r = render({ ...washer(), ...dish({ op: "unknown", door: "on" }) });
assert.equal(r.dish.status, "Door open", "unknown sensors while off are normal");

r = render({ ...washer(), ...dish({ op: "error" }) });
assert.equal(r.dish.status, "Error");
assert.equal(r.dish.colour, col("error"));
r = render({ ...washer(), ...dish({ op: "actionrequired" }) });
assert.equal(r.dish.status, "Action required");
r = render({ ...washer(), ...dish({ op: "pause", phase: "drying", pct: 90, left: 0.25 }) });
assert.equal(r.dish.status, "Paused");
assert.equal(r.dish.sub, "Drying");
assert.equal(r.dish.prog, "Drying|90% · 0:15 left");

{
  const s = { ...washer(), ...dish() };
  delete s[`${D}operation_state`];
  r = render(s);
  assert.equal(r.dish.status, "Unavailable");
}

/* ---- re-render only for own entities ------------------------------------- */
{
  const states = { ...washer(), ...dish() };
  const c = new Card();
  w.document.body.appendChild(c);
  c.setConfig({});
  c.hass = hass(states);
  let n = 0;
  const orig = c._update.bind(c);
  c._update = () => { n++; orig(); };
  c.hass = hass({ ...states, "sensor.other": st(1) });
  assert.equal(n, 0, "foreign entity ignored");
  c.hass = hass({ ...states, [`binary_sensor.${W}running`]: st("on") });
  assert.equal(n, 1, "own entity re-renders");
}

/* ---- actions --------------------------------------------------------------- */
{
  const c = new Card();
  w.document.body.appendChild(c);
  c.setConfig({});
  c.hass = hass({ ...washer(), ...dish() });
  const got = [];
  c.addEventListener("hass-action", (e) => got.push(e.detail));
  c._cols[0].cells[0].dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter" }));
  c._cols[1].cells[2].dispatchEvent(new w.KeyboardEvent("keydown", { key: " " }));
  assert.equal(got[0].action, "tap");
  assert.deepEqual(got[0].config.tap_action, { action: "navigate", navigation_path: "#laundry" });
  assert.equal(got[0].config.entity, `sensor.${W}machine_state`);
  assert.deepEqual(got[1].config.tap_action, { action: "perform-action", perform_action: "script.diashwasher_script" });
  assert.equal(got[1].config.entity, `${D}operation_state`);
  // badge tap opens its own sensor, not the machine action
  c.hass = hass({ ...washer({ detergent: "on" }), ...dish() });
  const mi = [];
  c.addEventListener("hass-more-info", (e) => mi.push(e.detail.entityId));
  c._cols[0].badge.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(mi, [`binary_sensor.${W}detergent_low`]);
  assert.equal(got.length, 2, "badge tap fires no machine action");
  // hold
  const PE = w.PointerEvent || w.MouseEvent;
  c._cols[1].cells[0].dispatchEvent(new PE("pointerdown", { button: 0, clientX: 1, clientY: 1 }));
  setTimeout(() => {
    c._cols[1].cells[0].dispatchEvent(new PE("pointerup", { button: 0 }));
    assert.equal(got.length, 3);
    assert.equal(got[2].action, "hold");
    assert.deepEqual(got[2].config.hold_action, { action: "more-info" });
    finish();
  }, 600);
}

function finish() {
  /* ---- config ------------------------------------------------------------- */
  const bad = [
    [{ machines: [] }, /at least one machine/],
    [{ machines: [{ profile: "dryer" }] }, /profile must be one of: washer, dishwasher/],
    [{ machines: [{ profile: "washer", entities: { runing: "binary_sensor.x" } }] }, /unknown role 'runing'/],
    [{ machines: [{ profile: "washer", entities: { running: "nope" } }] }, /not an entity id/],
    [{ colors: "red" }, /colors must be a map/],
  ];
  for (const [cfg, re] of bad) assert.throws(() => new Card().setConfig(cfg), re);

  // one machine, entity switched off with null, custom name and colours
  const c = new Card();
  w.document.body.appendChild(c);
  c.setConfig({ machines: [{ profile: "dishwasher", name: "Vaatwasser", entities: { salt: null } }], colors: { running: "teal" } });
  c.hass = hass({ ...dish({ salt: "empty" }) });
  assert.equal(c._cols.length, 1);
  assert.equal(c._cols[0].name.textContent, "Vaatwasser");
  assert.equal(c._cols[0].badge.classList.contains("show"), false, "salt switched off");
  assert.equal(c.style.getPropertyValue("--ac-running"), "teal");
  assert(!c._ids.includes(`${D}salt`));
  assert.deepEqual(Card.getStubConfig(), { machines: [{ profile: "washer" }, { profile: "dishwasher" }] });

  editorTests().then(() => {
    console.log("ALL OK");
    process.exit(0);
  }).catch((err) => { console.error(err); process.exit(1); });
}

async function editorTests() {
  const Editor = w.customElements.get("appliance-card-editor");
  assert(Editor, "editor registered");
  assert.equal(Card.getConfigElement().tagName.toLowerCase(), "appliance-card-editor");

  // the minimal config shows both machines with every default, and writes nothing new
  const minimal = { type: "custom:appliance-card", grid_options: { columns: 12, rows: 2 } };
  const d0 = Editor.toData(minimal);
  assert.equal(d0.m0.profile, "washer");
  assert.equal(d0.m0.name, "Laundry");
  assert.equal(d0.m0.entities.running, `binary_sensor.${W}running`);
  assert.equal(d0.m0.entity, `sensor.${W}machine_state`);
  assert.equal(d0.m1.profile, "dishwasher");
  assert.equal(d0.m1.entities.salt, `${D}salt`);
  assert.equal(d0.m2, undefined);
  assert.deepEqual(Editor.toConfig(d0, minimal), minimal);
  assert.deepEqual(Editor.toConfig(Editor.toData(Card.getStubConfig()), Card.getStubConfig()), { type: "custom:appliance-card" });

  // name, changed and cleared entities, actions, more-info target
  const d1 = Editor.toData(minimal);
  d1.m1.name = "Vaatwasser";
  d1.m1.entities.salt = "";
  d1.m0.entities.door = "binary_sensor.washer_door";
  d1.m0.tap_action = { action: "more-info" };
  d1.m1.entity = "switch.siemens_dishwasher_power";
  const c1 = Editor.toConfig(d1, minimal);
  assert.deepEqual(c1.machines, [
    { profile: "washer", entities: { door: "binary_sensor.washer_door" }, tap_action: { action: "more-info" } },
    { profile: "dishwasher", name: "Vaatwasser", entities: { salt: null }, entity: "switch.siemens_dishwasher_power" },
  ]);
  assert.equal(Editor.toData(c1).m1.entities.salt, "");
  assert.deepEqual(Editor.toConfig(Editor.toData(c1), c1), c1, "round trip");

  // a third machine, then removing the second; changing a profile starts from its defaults
  const d2 = Editor.toData(c1);
  d2.m2 = { profile: "washer" };
  const c2 = Editor.toConfig(d2, c1);
  assert.equal(c2.machines.length, 3);
  assert.deepEqual(c2.machines[2], { profile: "washer" });
  const d3 = Editor.toData(c2);
  d3.m1.profile = "none";
  assert.deepEqual(Editor.toConfig(d3, c2).machines, [c1.machines[0]]);
  const d4 = Editor.toData(c1);
  d4.m1.profile = "washer";
  assert.deepEqual(Editor.toConfig(d4, c1).machines[1], { profile: "washer" }, "old dishwasher values dropped");

  // title, colours; unknown keys kept
  const full = { type: "custom:appliance-card", title: "Machines", colors: { running: "teal" }, view_layout: { position: "main" } };
  assert.deepEqual(Editor.toConfig(Editor.toData(full), full), full);
  const d5 = Editor.toData(full);
  d5.colors.running = " ";
  d5.title = "";
  const c5 = Editor.toConfig(d5, full);
  assert.equal(c5.colors, undefined, "empty colour dropped");
  assert.equal(c5.title, undefined, "empty title dropped");

  // every config the editor writes is accepted by the card
  for (const c of [c1, c2, Editor.toConfig(d3, c2), Editor.toConfig(d4, c1), c5]) new Card().setConfig(c);

  // with a stub ha-form: renders, one empty slot to add a machine, passes changes on
  w.customElements.define("ha-form", class extends w.HTMLElement {});
  const ed = new Editor();
  const got = [];
  ed.addEventListener("config-changed", (e) => got.push(e.detail.config));
  ed.setConfig(minimal);
  w.document.body.appendChild(ed);
  await new Promise((r) => setTimeout(r, 0));
  const form = ed.querySelector("ha-form");
  assert(form, "ha-form rendered");
  assert.deepEqual(form.data.m2, { profile: "none" });
  assert.deepEqual(form.schema.map((x) => x.name), ["title", "m0", "m1", "m2", "colors"]);
  assert.equal(form.computeLabel({ name: "rinse_aid" }), "Rinse aid");
  form.dispatchEvent(new w.CustomEvent("value-changed", { detail: { value: { ...form.data, title: "Wash" } } }));
  assert.deepEqual(got[0], { ...minimal, title: "Wash" }, "the empty slot is not written");
  ed.setConfig(c2);
  assert.deepEqual(form.schema.map((x) => x.name), ["title", "m0", "m1", "m2", "colors"], "three machines, no empty slot");
  assert.equal(form.data.m2.profile, "washer");
  ed.remove();
}
