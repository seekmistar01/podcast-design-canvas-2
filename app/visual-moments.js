"use strict";

// Creator-facing visual moments model for Podcast Design Canvas (#19).
//
// The contextual editing stage after setup, style, canvas, and audio polish: a
// full-episode, speaker-aware transcript timeline onto which the creator places
// polished visual treatments — captions, title moments, b-roll overlays, branded
// callouts, and simple overlay notes — at meaningful points in the conversation.
// DOM-free so the editor view and the tests share one source of truth, and so the
// board can be serialized for persistence across navigation.
(function (global) {
  // At least four creator-facing moment types (captions, title, b-roll, callout)
  // plus a lightweight overlay note. No internal pipeline language.
  const MOMENT_TYPES = [
    {
      id: "caption",
      label: "Caption",
      defaultText: "New caption",
      note: "On-screen words synced to what is being said.",
    },
    {
      id: "title",
      label: "Title moment",
      defaultText: "Section title",
      note: "A title beat that introduces a new part of the episode.",
    },
    {
      id: "broll",
      label: "B-roll overlay",
      defaultText: "B-roll clip",
      note: "Cutaway footage or an image layered over the speakers.",
    },
    {
      id: "callout",
      label: "Visual callout",
      defaultText: "Callout",
      note: "A branded highlight that points at something said.",
    },
    {
      id: "note",
      label: "Overlay note",
      defaultText: "Overlay note",
      note: "A simple reminder note pinned to this moment.",
    },
  ];

  // Spacing between transcript segments. Sized so a default board spans a long-form,
  // hour-plus episode rather than a short clip.
  const SEGMENT_SECONDS = 450; // 7.5 minutes
  const MIN_SEGMENTS = 8;

  function getMomentType(id) {
    return MOMENT_TYPES.find((type) => type.id === id) || MOMENT_TYPES[0];
  }

  function pad2(value) {
    return value < 10 ? `0${value}` : String(value);
  }

  function formatTimecode(totalSeconds) {
    const safe = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    if (hours > 0) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    }
    return `${pad2(minutes)}:${pad2(seconds)}`;
  }

  function parseTimecode(value) {
    if (typeof value === "number") {
      return Math.max(0, Math.round(value));
    }
    const text = String(value == null ? "" : value).trim();
    if (text === "") {
      return 0;
    }
    if (text.indexOf(":") === -1) {
      const asNumber = Number(text);
      return Number.isFinite(asNumber) ? Math.max(0, Math.round(asNumber)) : 0;
    }
    const parts = text.split(":").map((part) => Number(part) || 0);
    let seconds = 0;
    for (let i = 0; i < parts.length; i += 1) {
      seconds = seconds * 60 + parts[i];
    }
    return Math.max(0, Math.round(seconds));
  }

  function buildTimeline(episodeSummary) {
    const speakers = episodeSummary && Array.isArray(episodeSummary.speakers)
      ? episodeSummary.speakers
      : [];
    const roster = speakers.length
      ? speakers
      : [{ role: "Episode", name: "Full episode" }];
    const segmentCount = Math.max(MIN_SEGMENTS, roster.length * 2);
    const timeline = [];
    for (let i = 0; i < segmentCount; i += 1) {
      const speaker = roster[i % roster.length] || {};
      const start = i * SEGMENT_SECONDS;
      const name = speaker.name || "Speaker";
      timeline.push({
        index: i,
        speakerRole: speaker.role || "Speaker",
        speakerName: name,
        startSeconds: start,
        endSeconds: start + SEGMENT_SECONDS,
        transcript: `${name} carries this part of the conversation.`,
      });
    }
    return timeline;
  }

  function cloneMoment(moment) {
    return {
      id: moment.id,
      type: moment.type,
      label: moment.label,
      atSeconds: moment.atSeconds,
      speakerRole: moment.speakerRole,
      text: moment.text,
      visible: moment.visible !== false,
    };
  }

  function cloneBoard(board) {
    const base = board || {};
    return {
      episodeName: base.episodeName || "",
      durationSeconds: base.durationSeconds || 0,
      timeline: Array.isArray(base.timeline) ? base.timeline.map((seg) => Object.assign({}, seg)) : [],
      moments: Array.isArray(base.moments) ? base.moments.map(cloneMoment) : [],
      nextId: base.nextId || 1,
    };
  }

  function durationOf(timeline) {
    if (!timeline.length) {
      return 0;
    }
    return timeline[timeline.length - 1].endSeconds;
  }

  function createBoard(episodeSummary) {
    const timeline = buildTimeline(episodeSummary);
    return {
      episodeName: (episodeSummary && episodeSummary.episodeName) || "",
      durationSeconds: durationOf(timeline),
      timeline,
      moments: [],
      nextId: 1,
    };
  }

  function clampTime(board, value) {
    const seconds = parseTimecode(value);
    const max = board && board.durationSeconds ? board.durationSeconds : seconds;
    return Math.min(Math.max(0, seconds), Math.max(0, max));
  }

  function segmentAt(board, seconds) {
    const timeline = (board && board.timeline) || [];
    if (!timeline.length) {
      return null;
    }
    for (let i = 0; i < timeline.length; i += 1) {
      const seg = timeline[i];
      if (seconds >= seg.startSeconds && seconds < seg.endSeconds) {
        return seg;
      }
    }
    return timeline[timeline.length - 1];
  }

  // Suggest a sensible drop point: the start of the next un-annotated segment, so
  // freshly added moments spread across the episode instead of stacking at 0:00.
  function suggestTime(board) {
    const timeline = (board && board.timeline) || [];
    if (!timeline.length) {
      return 0;
    }
    const used = {};
    (board.moments || []).forEach((moment) => {
      const seg = segmentAt(board, moment.atSeconds);
      if (seg) {
        used[seg.index] = true;
      }
    });
    const free = timeline.find((seg) => !used[seg.index]);
    return (free || timeline[0]).startSeconds;
  }

  function addMoment(board, type, options) {
    const next = cloneBoard(board);
    const momentType = getMomentType(type);
    const opts = options || {};
    const at = clampTime(next, opts.atSeconds != null ? opts.atSeconds : suggestTime(next));
    const seg = segmentAt(next, at);
    const moment = {
      id: `m${next.nextId}`,
      type: momentType.id,
      label: momentType.label,
      atSeconds: at,
      speakerRole: opts.speakerRole || (seg ? seg.speakerRole : "Episode"),
      text: opts.text != null && String(opts.text).trim() !== ""
        ? String(opts.text)
        : momentType.defaultText,
      visible: opts.visible === false ? false : true,
    };
    next.nextId += 1;
    next.moments = next.moments.concat([moment]);
    return next;
  }

  function findMoment(board, id) {
    return ((board && board.moments) || []).find((moment) => moment.id === id) || null;
  }

  function updateMoment(board, id, patch) {
    const next = cloneBoard(board);
    const changes = patch || {};
    next.moments = next.moments.map((moment) => {
      if (moment.id !== id) {
        return moment;
      }
      const updated = cloneMoment(moment);
      if (changes.atSeconds != null) {
        updated.atSeconds = clampTime(next, changes.atSeconds);
      }
      if (changes.text != null) {
        const text = String(changes.text);
        updated.text = text.trim() === "" ? getMomentType(moment.type).defaultText : text;
      }
      if (changes.speakerRole != null) {
        updated.speakerRole = String(changes.speakerRole);
      }
      if (changes.type != null && MOMENT_TYPES.some((t) => t.id === changes.type)) {
        updated.type = changes.type;
        updated.label = getMomentType(changes.type).label;
      }
      if (changes.visible != null) {
        updated.visible = Boolean(changes.visible);
      }
      return updated;
    });
    return next;
  }

  function toggleVisibility(board, id) {
    const moment = findMoment(board, id);
    if (!moment) {
      return cloneBoard(board);
    }
    return updateMoment(board, id, { visible: !moment.visible });
  }

  function removeMoment(board, id) {
    const next = cloneBoard(board);
    next.moments = next.moments.filter((moment) => moment.id !== id);
    return next;
  }

  // Moments in playback order, so the timeline and preview read left to right.
  function orderedMoments(board) {
    return ((board && board.moments) || [])
      .slice()
      .sort((a, b) => a.atSeconds - b.atSeconds || a.id.localeCompare(b.id));
  }

  function effectFor(moment) {
    const tc = formatTimecode(moment.atSeconds);
    const role = moment.speakerRole || "Episode";
    const text = moment.text;
    switch (moment.type) {
      case "title":
        return `Title moment "${text}" takes the screen at ${tc}.`;
      case "broll":
        return `B-roll overlay "${text}" covers the speakers at ${tc}.`;
      case "callout":
        return `Callout "${text}" highlights ${role} at ${tc}.`;
      case "note":
        return `Overlay note "${text}" is pinned at ${tc}.`;
      case "caption":
      default:
        return `Caption "${text}" appears over ${role} at ${tc}.`;
    }
  }

  // Creator-facing preview of how a single moment changes the episode look.
  function previewMoment(board, id) {
    const moment = findMoment(board, id);
    if (!moment) {
      return { found: false };
    }
    const seg = segmentAt(board, moment.atSeconds);
    return {
      found: true,
      id: moment.id,
      type: moment.type,
      label: moment.label,
      timecode: formatTimecode(moment.atSeconds),
      speakerRole: moment.speakerRole,
      speakerName: seg ? seg.speakerName : "",
      text: moment.text,
      visible: moment.visible !== false,
      visibility: moment.visible !== false ? "visible" : "hidden",
      effect: moment.visible !== false
        ? effectFor(moment)
        : `${moment.label} "${moment.text}" is hidden and will not appear in the episode.`,
    };
  }

  function countsByType(board) {
    const counts = {};
    MOMENT_TYPES.forEach((type) => {
      counts[type.id] = 0;
    });
    ((board && board.moments) || []).forEach((moment) => {
      if (counts[moment.type] == null) {
        counts[moment.type] = 0;
      }
      counts[moment.type] += 1;
    });
    return counts;
  }

  function summarizeBoard(board) {
    const state = board || createBoard({});
    const moments = state.moments || [];
    const counts = countsByType(state);
    const treatmentParts = MOMENT_TYPES.filter((type) => counts[type.id] > 0).map(
      (type) => `${counts[type.id]} ${type.label.toLowerCase()}${counts[type.id] === 1 ? "" : "s"}`,
    );
    return {
      episodeName: state.episodeName || "",
      momentCount: moments.length,
      visibleCount: moments.filter((moment) => moment.visible !== false).length,
      timelineSegments: (state.timeline || []).length,
      durationLabel: formatTimecode(state.durationSeconds),
      counts,
      treatmentLine: treatmentParts.length
        ? treatmentParts.join(" · ")
        : "No visual moments added yet",
    };
  }

  function serialize(board) {
    const state = cloneBoard(board);
    return JSON.stringify({
      episodeName: state.episodeName,
      durationSeconds: state.durationSeconds,
      timeline: state.timeline,
      moments: state.moments,
      nextId: state.nextId,
    });
  }

  // Returns a normalized board, or null when there is nothing valid to restore so
  // callers can fall back to createBoard(summary).
  function deserialize(raw) {
    if (!raw) {
      return null;
    }
    let parsed;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      return null;
    }
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const board = cloneBoard(parsed);
    if (!board.timeline.length && !board.moments.length) {
      return null;
    }
    if (!board.durationSeconds) {
      board.durationSeconds = durationOf(board.timeline);
    }
    // Repair nextId so future ids never collide with restored ones.
    let maxId = 0;
    board.moments.forEach((moment) => {
      const numeric = Number(String(moment.id).replace(/^m/, ""));
      if (Number.isFinite(numeric) && numeric > maxId) {
        maxId = numeric;
      }
    });
    board.nextId = Math.max(board.nextId || 1, maxId + 1);
    return board;
  }

  const api = {
    MOMENT_TYPES,
    SEGMENT_SECONDS,
    getMomentType,
    formatTimecode,
    parseTimecode,
    buildTimeline,
    createBoard,
    segmentAt,
    suggestTime,
    clampTime,
    addMoment,
    findMoment,
    updateMoment,
    toggleVisibility,
    removeMoment,
    orderedMoments,
    previewMoment,
    countsByType,
    summarizeBoard,
    serialize,
    deserialize,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcVisualMoments = api;
}(typeof window !== "undefined" ? window : globalThis));
