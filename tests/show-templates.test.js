"use strict";

// Reusable show template suite for Podcast Design Canvas (#27).
// Guards saving a named show template, listing it in the library, selecting it on a
// new episode, and applying it so the saved layout/style carries forward while the
// current episode's speaker assignments are kept.
// Run with: `node tests/show-templates.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const editor = require("../app/canvas-editor.js");
const templates = require("../app/show-templates.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

// Build a complete episode summary from a list of [role, name] speaker specs.
function episodeOf(episodeName, specs) {
  const draft = setup.createDraft();
  draft.episodeName = episodeName;
  draft.sourceMode = "upload";
  draft.speakers = specs.map(([role, name], index) =>
    Object.assign(setup.createSpeaker(role), { name, fileName: `clip-${index + 1}.mp4` }),
  );
  return setup.summarize(draft);
}

// Build a saved-style canvas document for an episode, mirroring the real flow.
function canvasFor(episode, presetId, layout) {
  const selection = Object.assign(style.createSelection(), { presetId, layout: layout || "auto" });
  const applied = style.summarizeStyle(selection, episode.speakerCount);
  return editor.createFromStyle(applied, episode, selection);
}

function freshStore() {
  templates._resetTemplateCounter();
  return templates.createStore();
}

test("saveTemplate stores a named show template and listTemplates surfaces it", () => {
  const episode = episodeOf("Deep Dives #1", [["Host", "Ada"], ["Guest 1", "Lin"]]);
  const canvas = canvasFor(episode, "panel-grid", "grid");
  let store = freshStore();
  store = templates.saveTemplate(store, templates.createTemplate("Deep Dives Show", canvas));

  const library = templates.listTemplates(store);
  assert.strictEqual(library.length, 1);
  assert.strictEqual(library[0].name, "Deep Dives Show");
  assert.strictEqual(library[0].presetName, "Panel Grid");
});

test("validateTemplateName requires a name and rejects duplicates", () => {
  const episode = episodeOf("Deep Dives #1", [["Host", "Ada"]]);
  let store = freshStore();
  store = templates.saveTemplate(store, templates.createTemplate("Flagship", canvasFor(episode, "split-stage")));

  assert.strictEqual(templates.validateTemplateName(store, "   ").ok, false);
  assert.strictEqual(templates.validateTemplateName(store, "Flagship").ok, false);
  assert.strictEqual(templates.validateTemplateName(store, "Flagship 2").ok, true);
});

test("getTemplate returns an isolated deep copy", () => {
  const episode = episodeOf("Deep Dives #1", [["Host", "Ada"]]);
  let store = freshStore();
  store = templates.saveTemplate(store, templates.createTemplate("Flagship", canvasFor(episode, "split-stage")));
  const id = templates.listTemplates(store)[0].id;

  const fetched = templates.getTemplate(store, id);
  fetched.canvas.titleText = "MUTATED";
  assert.notStrictEqual(templates.getTemplate(store, id).canvas.titleText, "MUTATED");
});

test("selectionFromTemplate recovers the saved preset, layout, and pacing", () => {
  const episode = episodeOf("Deep Dives #1", [["Host", "Ada"], ["Guest 1", "Lin"]]);
  const canvas = canvasFor(episode, "studio-spotlight", "spotlight");
  const template = templates.createTemplate("Spotlight Show", canvas);
  const selection = templates.selectionFromTemplate(template);
  assert.strictEqual(selection.presetId, "studio-spotlight");
  assert.strictEqual(selection.layout, "spotlight");
  assert.strictEqual(selection.pacing, "balanced");
});

test("applyTemplateToEpisode keeps the saved look but re-seeds the new episode's speakers", () => {
  // Saved on a two-speaker episode...
  const original = episodeOf("Pilot", [["Host", "Ada"], ["Guest 1", "Lin"]]);
  const template = templates.createTemplate("House Style", canvasFor(original, "panel-grid", "grid"));

  // ...reused on a different three-speaker episode.
  const nextEpisode = episodeOf("Season 2", [
    ["Host", "Mara"],
    ["Guest 1", "Theo"],
    ["Guest 2", "Vik"],
  ]);
  const applied = editor.applyTemplateToEpisode(template, nextEpisode);

  // Saved visual identity carries forward.
  assert.strictEqual(applied.presetName, "Panel Grid");
  assert.strictEqual(applied.layoutId, "grid");
  // But the frames match the CURRENT episode's speakers, not the saved ones.
  assert.strictEqual(applied.speakerFrames.length, 3);
  assert.deepStrictEqual(
    applied.speakerFrames.map((frame) => frame.name),
    ["Mara", "Theo", "Vik"],
  );
});

test("serializeStore/deserializeStore round-trips the template library", () => {
  const episode = episodeOf("Deep Dives #1", [["Host", "Ada"]]);
  let store = freshStore();
  store = templates.saveTemplate(store, templates.createTemplate("Flagship", canvasFor(episode, "bold-broadcast")));
  const restored = templates.deserializeStore(templates.serializeStore(store));
  assert.strictEqual(templates.listTemplates(restored).length, 1);
  assert.strictEqual(templates.listTemplates(restored)[0].name, "Flagship");
});

test("ACCEPTANCE: save a show template, then start a new episode from it keeping speakers", () => {
  // Episode A: customize a look and save it as a named, reusable show template.
  const episodeA = episodeOf("Founders Unfiltered #7", [
    ["Host", "Sam Rivera"],
    ["Guest 1", "Dana Kim"],
  ]);
  const canvasA = canvasFor(episodeA, "studio-spotlight", "spotlight");
  let store = freshStore();
  assert.strictEqual(templates.validateTemplateName(store, "Founders Unfiltered").ok, true);
  store = templates.saveTemplate(store, templates.createTemplate("Founders Unfiltered", canvasA));

  // It appears in the library.
  const library = templates.listTemplates(store);
  assert.strictEqual(library.length, 1);
  const templateId = library[0].id;

  // Episode B (new, different speakers): select the saved template in the style step.
  const episodeB = episodeOf("Founders Unfiltered #8", [
    ["Host", "Priya Shah"],
    ["Guest 1", "Owen Cole"],
    ["Guest 2", "Rae Lin"],
  ]);
  const saved = templates.getTemplate(store, templateId);
  const selection = templates.selectionFromTemplate(saved);
  const appliedStyle = style.summarizeStyle(selection, episodeB.speakerCount);
  assert.strictEqual(appliedStyle.presetName, "Studio Spotlight");
  assert.strictEqual(appliedStyle.layoutId, "spotlight");

  // Apply it: the canvas keeps episode B's speakers with the saved layout/visuals.
  const applied = editor.applyTemplateToEpisode(saved, episodeB);
  assert.strictEqual(applied.presetName, "Studio Spotlight");
  assert.strictEqual(applied.speakerFrames.length, 3);
  assert.deepStrictEqual(
    applied.speakerFrames.map((frame) => frame.name),
    ["Priya Shah", "Owen Cole", "Rae Lin"],
  );
  // Spotlight features the host of the CURRENT episode.
  const featured = applied.speakerFrames.find((frame) => frame.active);
  assert.ok(featured && featured.role === "Host" && featured.name === "Priya Shah");
});

console.log(`\nshow templates: ${passed} assertions passed`);
