"use strict";

// Visual moments smoke suite for Podcast Design Canvas (#19).
// Guards the speaker-aware transcript timeline, the four+ moment types, editing
// timing/text/visibility, preview output, and persistence round-tripping.
// Run with: `node tests/visual-moments.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const moments = require("../app/visual-moments.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeUploadDraft() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  return draft;
}

function boardForEpisode() {
  const episode = setup.summarize(completeUploadDraft());
  return moments.createBoard(episode);
}

test("offers at least four creator-facing moment types incl. captions/title/b-roll/callout", () => {
  const ids = moments.MOMENT_TYPES.map((type) => type.id);
  assert.ok(moments.MOMENT_TYPES.length >= 4);
  ["caption", "title", "broll", "callout"].forEach((id) => {
    assert.ok(ids.includes(id), `${id} moment type is offered`);
  });
  moments.MOMENT_TYPES.forEach((type) => {
    assert.ok(type.label && type.note, `${type.id} is described for creators`);
  });
});

test("createBoard builds a speaker-aware, full-episode transcript timeline", () => {
  const board = boardForEpisode();
  assert.ok(board.timeline.length >= 6, "timeline spans the full episode");
  const roles = new Set(board.timeline.map((seg) => seg.speakerRole));
  assert.ok(roles.has("Host") && roles.has("Guest 1"), "segments are speaker-aware");
  assert.ok(board.durationSeconds >= 3600, "covers a long-form, hour-plus episode");
  assert.strictEqual(board.moments.length, 0);
  // Segments are ordered in time.
  for (let i = 1; i < board.timeline.length; i += 1) {
    assert.ok(board.timeline[i].startSeconds > board.timeline[i - 1].startSeconds);
  }
});

test("addMoment adds each of the four primary moment types", () => {
  let board = boardForEpisode();
  ["caption", "title", "broll", "callout"].forEach((type) => {
    board = moments.addMoment(board, type);
  });
  assert.strictEqual(board.moments.length, 4);
  const types = board.moments.map((moment) => moment.type);
  assert.deepStrictEqual(types.slice().sort(), ["broll", "callout", "caption", "title"]);
  board.moments.forEach((moment) => {
    assert.ok(moment.id && moment.text, "each moment has an id and default text");
    assert.ok(moment.speakerRole, "each moment is anchored to a speaker");
    assert.strictEqual(moment.visible, true);
  });
});

test("addMoment spreads moments across the timeline and accepts overrides", () => {
  let board = boardForEpisode();
  board = moments.addMoment(board, "caption");
  board = moments.addMoment(board, "title");
  assert.notStrictEqual(board.moments[0].atSeconds, board.moments[1].atSeconds);

  board = moments.addMoment(board, "callout", {
    atSeconds: 930,
    speakerRole: "Guest 2",
    text: "Key insight",
  });
  const custom = board.moments[board.moments.length - 1];
  assert.strictEqual(custom.atSeconds, 930);
  assert.strictEqual(custom.speakerRole, "Guest 2");
  assert.strictEqual(custom.text, "Key insight");
});

test("updateMoment edits timing, text, and visibility", () => {
  let board = moments.addMoment(boardForEpisode(), "caption");
  const id = board.moments[0].id;

  board = moments.updateMoment(board, id, { text: "Welcome back to the show" });
  assert.strictEqual(moments.findMoment(board, id).text, "Welcome back to the show");

  board = moments.updateMoment(board, id, { atSeconds: 600 });
  assert.strictEqual(moments.findMoment(board, id).atSeconds, 600);

  board = moments.updateMoment(board, id, { visible: false });
  assert.strictEqual(moments.findMoment(board, id).visible, false);

  board = moments.toggleVisibility(board, id);
  assert.strictEqual(moments.findMoment(board, id).visible, true);
});

test("editing clamps timing into the episode and never blanks the text", () => {
  let board = moments.addMoment(boardForEpisode(), "title");
  const id = board.moments[0].id;
  board = moments.updateMoment(board, id, { atSeconds: 999999 });
  assert.ok(moments.findMoment(board, id).atSeconds <= board.durationSeconds);
  board = moments.updateMoment(board, id, { text: "   " });
  assert.strictEqual(moments.findMoment(board, id).text, moments.getMomentType("title").defaultText);
});

test("parseTimecode accepts mm:ss, h:mm:ss, and plain seconds", () => {
  assert.strictEqual(moments.parseTimecode("02:30"), 150);
  assert.strictEqual(moments.parseTimecode("1:00:00"), 3600);
  assert.strictEqual(moments.parseTimecode("90"), 90);
  assert.strictEqual(moments.formatTimecode(150), "02:30");
  assert.strictEqual(moments.formatTimecode(3600), "1:00:00");
});

test("removeMoment drops the moment", () => {
  let board = moments.addMoment(boardForEpisode(), "broll");
  const id = board.moments[0].id;
  board = moments.removeMoment(board, id);
  assert.strictEqual(board.moments.length, 0);
  assert.strictEqual(moments.findMoment(board, id), null);
});

test("previewMoment describes how the moment affects the look", () => {
  let board = moments.addMoment(boardForEpisode(), "caption", {
    atSeconds: 150,
    speakerRole: "Host",
    text: "Big idea",
  });
  const id = board.moments[0].id;
  const preview = moments.previewMoment(board, id);
  assert.strictEqual(preview.found, true);
  assert.strictEqual(preview.timecode, "02:30");
  assert.strictEqual(preview.visibility, "visible");
  assert.ok(preview.effect.includes("Big idea"));
  assert.ok(preview.effect.includes("Host"));

  const hidden = moments.previewMoment(moments.updateMoment(board, id, { visible: false }), id);
  assert.strictEqual(hidden.visibility, "hidden");
  assert.ok(hidden.effect.includes("hidden"));

  assert.strictEqual(moments.previewMoment(board, "missing").found, false);
});

test("summarizeBoard reports counts and timeline coverage", () => {
  let board = boardForEpisode();
  board = moments.addMoment(board, "caption");
  board = moments.addMoment(board, "caption");
  board = moments.addMoment(board, "title");
  const summary = moments.summarizeBoard(board);
  assert.strictEqual(summary.momentCount, 3);
  assert.strictEqual(summary.counts.caption, 2);
  assert.strictEqual(summary.counts.title, 1);
  assert.ok(summary.treatmentLine.includes("2 captions"));
  assert.ok(summary.timelineSegments >= 6);
});

test("serialize/deserialize persists moments across navigation", () => {
  let board = boardForEpisode();
  board = moments.addMoment(board, "caption", { atSeconds: 150, text: "Cold open" });
  board = moments.addMoment(board, "broll", { atSeconds: 600, text: "City skyline" });

  const restored = moments.deserialize(moments.serialize(board));
  assert.strictEqual(restored.moments.length, 2);
  assert.strictEqual(restored.moments[0].text, "Cold open");
  assert.strictEqual(restored.timeline.length, board.timeline.length);
  // A newly added moment after restore gets a fresh, non-colliding id.
  const grown = moments.addMoment(restored, "title");
  const ids = grown.moments.map((moment) => moment.id);
  assert.strictEqual(new Set(ids).size, ids.length, "ids stay unique after restore");

  assert.strictEqual(moments.deserialize(null), null);
  assert.strictEqual(moments.deserialize("not json"), null);
});

test("ACCEPTANCE: episode flows into the moments editor, edits persist and preview", () => {
  const draft = completeUploadDraft();
  assert.strictEqual(setup.validateDraft(draft).ok, true);
  const episode = setup.summarize(draft);

  // Enter a speaker-aware editing view for the full episode.
  let board = moments.createBoard(episode);
  assert.strictEqual(board.timeline[0].speakerRole, "Host");

  // Add the four required moment types.
  board = moments.addMoment(board, "caption", { atSeconds: 150, text: "Welcome in" });
  board = moments.addMoment(board, "title", { atSeconds: 0, text: "Chapter 1" });
  board = moments.addMoment(board, "broll", { atSeconds: 600, text: "Office b-roll" });
  board = moments.addMoment(board, "callout", { atSeconds: 900, text: "Quote of the week" });
  assert.strictEqual(board.moments.length, 4);

  // Edit timing/text/visibility of one moment.
  const captionId = board.moments[0].id;
  board = moments.updateMoment(board, captionId, { atSeconds: 300, visible: false });
  assert.strictEqual(moments.findMoment(board, captionId).atSeconds, 300);
  assert.strictEqual(moments.findMoment(board, captionId).visible, false);

  // Preview how a visible moment affects the episode look.
  const calloutId = board.moments[3].id;
  const preview = moments.previewMoment(board, calloutId);
  assert.ok(preview.effect.includes("Quote of the week"));
  assert.strictEqual(preview.visibility, "visible");

  // Persist and re-open: edits survive navigating away and back.
  const reopened = moments.deserialize(moments.serialize(board));
  assert.strictEqual(reopened.moments.length, 4);
  assert.strictEqual(moments.findMoment(reopened, captionId).atSeconds, 300);
  assert.strictEqual(moments.findMoment(reopened, captionId).visible, false);
  const summary = moments.summarizeBoard(reopened);
  assert.strictEqual(summary.momentCount, 4);
  assert.ok(summary.counts.caption === 1 && summary.counts.callout === 1);
});

console.log(`\nvisual moments: ${passed} assertions passed`);
