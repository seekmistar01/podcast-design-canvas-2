"use strict";

// Full-episode review & approval suite for Podcast Design Canvas (#37).
// Guards the publish-ready checklist, creator-facing warnings, and the approval gate
// in BOTH the blocked state (required items missing) and the approved state.
// Run with: `node tests/episode-review.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const style = require("../app/episode-style.js");
const audio = require("../app/audio-polish.js");
const moments = require("../app/visual-moments.js");
const review = require("../app/episode-review.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
  ];
  return setup.summarize(draft);
}

function find(review, id) {
  return review.sections.find((s) => s.id === id);
}

// A fully publish-ready context: style + audio applied, moments with a caption.
function readyContext(episode) {
  const appliedStyle = style.summarizeStyle(style.createSelection(), episode.speakerCount);
  const appliedAudio = audio.summarizePolish(audio.createPolish(episode));
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "caption", { text: "Welcome in" });
  board = moments.addMoment(board, "title", { text: "Chapter 1" });
  return {
    audioPolish: appliedAudio,
    appliedStyle: appliedStyle,
    templateName: "Founders Unfiltered",
    momentsSummary: moments.summarizeBoard(board),
    contextSummary: { reviewLine: "Context: 2 name fixes applied" },
  };
}

test("a brand-new episode with no work done is blocked from approval", () => {
  const episode = completeEpisode();
  const result = review.buildReview(episode, {});
  assert.strictEqual(result.canApprove, false);
  assert.strictEqual(result.overallStatus, "blocked");
  // Style, audio, and export readiness are required and missing.
  assert.strictEqual(find(result, "style").status, "missing");
  assert.strictEqual(find(result, "audio").status, "missing");
  assert.strictEqual(find(result, "export").status, "missing");
  assert.ok(result.blockers.length >= 3);
});

test("approveReview refuses to approve a blocked episode and returns the blockers", () => {
  const episode = completeEpisode();
  const result = review.buildReview(episode, {});
  const approval = review.approveReview(result);
  assert.strictEqual(approval.ok, false);
  assert.strictEqual(approval.review.approved, false);
  assert.ok(approval.blockers.some((b) => b.id === "style"));
  assert.ok(approval.blockers.some((b) => b.id === "audio"));
});

test("missing one required item (style) still blocks approval", () => {
  const episode = completeEpisode();
  const ctx = readyContext(episode);
  delete ctx.appliedStyle;
  const result = review.buildReview(episode, ctx);
  assert.strictEqual(result.canApprove, false);
  assert.strictEqual(find(result, "style").status, "missing");
  assert.strictEqual(find(result, "audio").status, "ready");
});

test("every section is creator-facing with a status, detail, and a fix target", () => {
  const result = review.buildReview(completeEpisode(), {});
  const ids = result.sections.map((s) => s.id);
  ["speakers", "style", "audio", "context", "moments", "captions", "export"].forEach((id) => {
    assert.ok(ids.includes(id), `${id} section is present`);
  });
  result.sections.forEach((s) => {
    assert.ok(s.label && s.detail && s.action, `${s.id} has label/detail/action`);
    assert.ok(["ready", "warn", "missing"].includes(s.status), `${s.id} has a known status`);
  });
});

test("warnings (captions, moments) never block approval", () => {
  const episode = completeEpisode();
  // Style + audio applied (required), but NO moments and NO captions (warnings only).
  const ctx = {
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
  };
  const result = review.buildReview(episode, ctx);
  assert.strictEqual(result.canApprove, true);
  assert.strictEqual(find(result, "captions").status, "warn");
  assert.strictEqual(find(result, "moments").status, "warn");
  assert.strictEqual(result.overallStatus, "ready-with-warnings");
});

test("missing captions are surfaced as a clear warning", () => {
  const episode = completeEpisode();
  let board = moments.createBoard(episode);
  board = moments.addMoment(board, "title", { text: "Chapter 1" }); // no caption type
  const ctx = {
    appliedStyle: style.summarizeStyle(style.createSelection(), episode.speakerCount),
    audioPolish: audio.summarizePolish(audio.createPolish(episode)),
    momentsSummary: moments.summarizeBoard(board),
  };
  const captions = find(review.buildReview(episode, ctx), "captions");
  assert.strictEqual(captions.status, "warn");
  assert.ok(/mute|caption/i.test(captions.detail));
});

test("ACCEPTANCE: a fully prepared episode can be reviewed and approved", () => {
  const episode = completeEpisode();
  const ctx = readyContext(episode);
  const result = review.buildReview(episode, ctx);

  // End-to-end summary covers every stage.
  assert.strictEqual(find(result, "speakers").status, "ready");
  assert.strictEqual(find(result, "style").status, "ready");
  assert.strictEqual(find(result, "audio").status, "ready");
  assert.strictEqual(find(result, "context").status, "ready");
  assert.strictEqual(find(result, "moments").status, "ready");
  assert.strictEqual(find(result, "captions").status, "ready");
  assert.strictEqual(find(result, "export").status, "ready");
  assert.ok(result.summaryLines.length === 7);

  // Required checks pass, so approval is allowed.
  assert.strictEqual(result.canApprove, true);
  assert.strictEqual(result.overallStatus, "ready");
  const approval = review.approveReview(result);
  assert.strictEqual(approval.ok, true);
  assert.strictEqual(approval.review.approved, true);
});

console.log(`\nepisode review: ${passed} assertions passed`);
