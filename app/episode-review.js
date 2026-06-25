"use strict";

// Full-episode review & approval model for Podcast Design Canvas (#37).
//
// The final quality gate before export: rolls up setup, style/template, audio polish,
// contextual text improvements, visual moments, captions, and export readiness into a
// single checklist. Each item is creator-facing (a status + a plain-language message +
// the step that resolves it). Required items must all pass before the episode can be
// approved; warnings inform but never block. DOM-free so the review screen and the
// tests share one source of truth.
(function (global) {
  // Build one checklist row. `action` names the step a Fix button should jump to.
  function section(id, label, status, required, detail, action) {
    return { id: id, label: label, status: status, required: Boolean(required), detail: detail, action: action };
  }

  function speakerSection(episode) {
    const speakers = Array.isArray(episode.speakers) ? episode.speakers : [];
    if (!episode.speakerCount || speakers.length === 0) {
      return section("speakers", "Speakers", "missing", true, "No speakers set up yet. Add at least one speaker.", "setup");
    }
    const unnamed = speakers.filter((s) => !s || !s.name || !String(s.name).trim()).length;
    if (unnamed) {
      return section(
        "speakers",
        "Speakers",
        "missing",
        true,
        `${unnamed} speaker${unnamed === 1 ? "" : "s"} still need a name before publishing.`,
        "setup",
      );
    }
    const names = speakers.map((s) => s.name).join(", ");
    return section(
      "speakers",
      "Speakers",
      "ready",
      true,
      `${episode.speakerCount} speaker${episode.speakerCount === 1 ? "" : "s"} ready: ${names}.`,
      "setup",
    );
  }

  function styleSection(ctx) {
    const style = ctx.appliedStyle;
    if (style && style.presetName) {
      const tpl = ctx.templateName ? ` · template "${ctx.templateName}"` : "";
      return section(
        "style",
        "Visual style",
        "ready",
        true,
        `${style.presetName} · ${style.layoutLabel || "layout"} · ${style.pacingLabel || "pacing"}${tpl}.`,
        "style",
      );
    }
    return section("style", "Visual style", "missing", true, "No visual style chosen yet. Pick a look for the episode.", "style");
  }

  function audioSection(ctx) {
    const audio = ctx.audioPolish;
    if (audio && audio.presetName) {
      return section(
        "audio",
        "Audio polish",
        "ready",
        true,
        `${audio.presetName} — ${audio.treatmentLine || "treatment applied"}.`,
        "audio",
      );
    }
    return section("audio", "Audio polish", "missing", true, "Audio is not polished yet. Choose an audio treatment.", "audio");
  }

  function contextSection(ctx) {
    if (ctx.contextSummary && ctx.contextSummary.reviewLine) {
      return section(
        "context",
        "Context improvements",
        "ready",
        false,
        ctx.contextSummary.reviewLine.replace(/^Context:\s*/, ""),
        "context",
      );
    }
    return section(
      "context",
      "Context improvements",
      "warn",
      false,
      "Suggested context improvements haven't been reviewed yet. Optional, but they sharpen names and links on screen.",
      "context",
    );
  }

  function momentsSection(ctx) {
    const moments = ctx.momentsSummary;
    if (moments && moments.total) {
      if (moments.visibleCount) {
        return section(
          "moments",
          "Visual moments",
          "ready",
          false,
          `${moments.visibleCount} of ${moments.total} moment${moments.total === 1 ? "" : "s"} live across the episode.`,
          "moments",
        );
      }
      return section(
        "moments",
        "Visual moments",
        "warn",
        false,
        `${moments.total} moment${moments.total === 1 ? "" : "s"} added but all hidden — none will appear on screen.`,
        "moments",
      );
    }
    return section(
      "moments",
      "Visual moments",
      "warn",
      false,
      "No visual moments yet. Captions, titles, and b-roll make a long-form episode easier to follow.",
      "moments",
    );
  }

  function captionSection(ctx) {
    const moments = ctx.momentsSummary;
    const captionCount = moments && moments.counts ? moments.counts.caption || 0 : 0;
    if (captionCount > 0) {
      return section(
        "captions",
        "Captions",
        "ready",
        false,
        `${captionCount} caption moment${captionCount === 1 ? "" : "s"} placed for sound-off viewers.`,
        "moments",
      );
    }
    return section(
      "captions",
      "Captions",
      "warn",
      false,
      "No captions added — viewers watching on mute won't be able to follow along.",
      "moments",
    );
  }

  function exportSection(ctx) {
    const styleReady = Boolean(ctx.appliedStyle && ctx.appliedStyle.presetName);
    const audioReady = Boolean(ctx.audioPolish && ctx.audioPolish.presetName);
    if (styleReady && audioReady) {
      return section("export", "Export readiness", "ready", true, "All publish-ready essentials are in place — ready to export.", "export");
    }
    return section("export", "Export readiness", "missing", true, "Finish the required steps above before the episode can be exported.", "export");
  }

  function buildReview(episodeSummary, context) {
    const episode = episodeSummary || {};
    const ctx = context || {};
    const sections = [
      speakerSection(episode),
      styleSection(ctx),
      audioSection(ctx),
      contextSection(ctx),
      momentsSection(ctx),
      captionSection(ctx),
      exportSection(ctx),
    ];

    const blockers = sections.filter((s) => s.required && s.status !== "ready");
    const warnings = sections.filter((s) => !s.required && s.status !== "ready");
    const readyCount = sections.filter((s) => s.status === "ready").length;
    const canApprove = blockers.length === 0;

    let overallStatus;
    if (!canApprove) {
      overallStatus = "blocked";
    } else if (warnings.length) {
      overallStatus = "ready-with-warnings";
    } else {
      overallStatus = "ready";
    }

    return {
      episodeName: episode.episodeName || "",
      sections: sections,
      blockers: blockers,
      warnings: warnings,
      readyCount: readyCount,
      sectionCount: sections.length,
      canApprove: canApprove,
      approved: false,
      overallStatus: overallStatus,
      summaryLines: sections.map((s) => `${s.label}: ${s.detail}`),
    };
  }

  // Approve the episode only when every required check passes. Returns the blockers so
  // the UI can keep pointing the creator at what still needs fixing.
  function approveReview(review) {
    if (!review || !review.canApprove) {
      return {
        ok: false,
        blockers: (review && review.blockers) || [],
        review: Object.assign({}, review || {}, { approved: false }),
      };
    }
    return { ok: true, review: Object.assign({}, review, { approved: true }) };
  }

  function statusLabel(status) {
    if (status === "ready") return "Ready";
    if (status === "warn") return "Heads up";
    if (status === "missing") return "Needs attention";
    return status;
  }

  const api = {
    buildReview,
    approveReview,
    statusLabel,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeReview = api;
}(typeof window !== "undefined" ? window : globalThis));
