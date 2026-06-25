"use strict";

// Visual preset cards for the Create Show flow (#94).
// Guards that the native style dropdown is gone, the preset-card UI + live preview are
// wired, and the selected preset is preserved into the episode flow.
// Run with: `node tests/preset-cards.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const library = require("../app/show-library.js");
const identity = require("../app/show-identity.js");
const style = require("../app/episode-style.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

test("Create Show no longer uses a native template/style dropdown", () => {
  assert.ok(!ui.includes('id="f-show-template"'), "native template select should be removed");
  assert.ok(!ui.includes("Start from template (optional)"), "old dropdown label should be gone");
});

test("Create Show renders visual preset cards from the style presets", () => {
  assert.ok(ui.includes("create-show-preset-grid"), "preset card grid should be present");
  assert.ok(ui.includes("STY.STYLE_PRESETS"), "cards should be built from the style presets");
  assert.ok(ui.includes("preset-card"), "preset cards reuse the established card markup");
  assert.ok(ui.includes('aria-pressed'), "selected card should expose pressed state");
});

test("Create Show wires a live preview that updates with the selected preset", () => {
  assert.ok(ui.includes("buildShowStylePreview"), "preview builder should exist");
  assert.ok(ui.includes("create-show-preview"), "preview card should be present");
  assert.ok(styles.includes(".preset-cue"), "preset cue styling should exist");
  assert.ok(styles.includes(".create-show-preview"), "preview styling should exist");
});

test("Selecting a preset is preserved into the episode style flow", () => {
  library._resetCounters();
  const show = library.createShow("Panel Show", { presetName: "Panel Grid" });

  const selection = identity.resolveStyleSelection(show, undefined);
  assert.strictEqual(selection.presetId, "panel-grid");

  const start = identity.buildEpisodeStart(show, undefined);
  assert.strictEqual(start.styleSelection.presetId, "panel-grid");
  assert.strictEqual(start.appliedStyle.presetName, "Panel Grid");
});

test("ACCEPTANCE: a different preset choice carries its distinct look forward", () => {
  library._resetCounters();
  const chosen = style.STYLE_PRESETS[1]; // Split Stage
  const show = library.createShow("Split Show", { presetName: chosen.name });

  const start = identity.buildEpisodeStart(show, undefined);
  assert.strictEqual(start.appliedStyle.presetName, chosen.name);
  assert.strictEqual(start.appliedStyle.accent, chosen.accent);
  // The preset's recommended layout is adopted, not a generic default.
  assert.strictEqual(start.styleSelection.presetId, chosen.id);
});

console.log(`\npreset cards: ${passed} assertions passed`);
