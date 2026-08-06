// draftToComposePrefill maps a fetched draft announcement (AnnouncementDetail)
// to the minimal shape AnnouncementCompose needs to seed its form when a
// coach clicks "Review & send" on a copilot-created draft. Pure mapper only —
// the "draft as template" flow it feeds never edits or status-transitions
// the source draft row (see announcement-history.tsx / notifications page.tsx).

import { describe, expect, it } from "vitest";

import {
  draftToComposePrefill,
  type AnnouncementDetail,
} from "@/lib/announcements";

const BASE_DRAFT: AnnouncementDetail = {
  id: 42,
  title: "New timetable",
  status: "draft",
  scheduled_at: null,
  created_at: "2026-08-06T10:00:00Z",
  recipient_count: 0,
  push_sent_count: 0,
  read_count: 0,
  body: "<p>From Monday…</p>",
  link: "/courses",
  filters: {},
  recipients: [],
};

describe("draftToComposePrefill", () => {
  it("carries the draft's title, body, and link into the prefill shape", () => {
    expect(draftToComposePrefill(BASE_DRAFT)).toEqual({
      title: "New timetable",
      body: "<p>From Monday…</p>",
      link: "/courses",
    });
  });

  it("normalizes a missing link to an empty string", () => {
    const draft = { ...BASE_DRAFT, link: "" };
    expect(draftToComposePrefill(draft).link).toBe("");
  });
});
