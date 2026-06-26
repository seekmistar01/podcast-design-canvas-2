"use strict";

// Episode summary handoff polish smoke suite for Podcast Design Canvas (#153).
// Run with: `node tests/summary-handoff-polish.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const workspace = require("../app/episode-workspace.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function readyEpisode() {
  const draft = setup.prepareSandboxPresetHandoff(setup.createDraft(), "Founders Unfiltered");
  draft.episodeName = "Founders Unfiltered — Episode 1";
  return setup.summarize(draft);
}

test("buildSetupCompletionHandoff still powers the workspace recap grid", () => {
  const completion = setup.buildSetupCompletionHandoff(readyEpisode(), { presetSummary: "Studio Spotlight" });
  assert.strictEqual(completion.completionEyebrow, "Setup complete");
  assert.ok(completion.episodeTitle.includes("Episode 1"));
  assert.ok(completion.presetSummary.includes("Studio Spotlight"));
  assert.ok(completion.roleSummary.includes("Host"));
});

test("summarizeWorkspace exposes checklist progress for the handoff screen", () => {
  const summary = readyEpisode();
  const ws = workspace.buildWorkspace(summary, {
    appliedStyle: { presetName: "Studio Spotlight", layoutLabel: "Side by side" },
  });
  const wsSummary = workspace.summarizeWorkspace(ws);
  assert.ok(/stages complete/.test(wsSummary.progressLine));
  assert.ok(wsSummary.workspaceLine.includes("Next:"));
  assert.strictEqual(ws.stages.length, 7);
});

test("ACCEPTANCE: workspace handoff separates recap, primary action, and grouped checklist", () => {
  const summary = readyEpisode();
  const ws = workspace.buildWorkspace(summary, {
    appliedStyle: { presetName: "Studio Spotlight", layoutLabel: "Side by side" },
  });
  const current = workspace.getStage(ws, ws.currentStageId);
  assert.ok(current);
  assert.ok(current.actionLabel.length > 0);
  assert.strictEqual(ws.stages.filter((stage) => stage.status === "complete").length, 2);
  const completion = setup.buildSetupCompletionHandoff(summary, { presetSummary: "Studio Spotlight" });
  assert.strictEqual(completion.handoff.sourceDetail, "Riverside recording link ready");
  assert.ok(!/canvas demo/i.test(completion.handoff.sourceDetail));
});

console.log(`\nsummary handoff polish: ${passed} assertions passed`);
