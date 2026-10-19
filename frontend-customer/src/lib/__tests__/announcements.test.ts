// draftToComposePrefill maps a fetched draft announcement (AnnouncementDetail)
// to the minimal shape AnnouncementCompose needs to seed its form when a
// coach clicks "Review & send" on a copilot-created draft. Pure mapper only —
// the "draft as template" flow it feeds never edits or status-transitions
// the source draft row (see app/admin/messages/new/page.tsx).

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
      filters: {},
      scheduledAt: "",
      alsoEmail: false,
    });
  });

  it("carries who, when and by email that a focus-mode Keep wrote onto the draft", () => {
    // 20 October 10:00 next year on this browser's clock, whatever its zone.
    const year = new Date().getFullYear() + 1;
    const at = new Date(year, 9, 20, 10, 0);
    const draft: AnnouncementDetail = {
      ...BASE_DRAFT,
      filters: { content_type: "course", content_id: 1 },
      scheduled_at: at.toISOString(),
      also_email: true,
    };
    expect(draftToComposePrefill(draft)).toMatchObject({
      filters: { content_type: "course", content_id: 1 },
      scheduledAt: `${year}-10-20T10:00`,
      alsoEmail: true,
    });
  });

  it("does not offer a kept time that has since passed", () => {
    const draft = {
      ...BASE_DRAFT,
      scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(draftToComposePrefill(draft).scheduledAt).toBe("");
  });

  it("normalizes a missing link to an empty string", () => {
    const draft = { ...BASE_DRAFT, link: "" };
    expect(draftToComposePrefill(draft).link).toBe("");
  });
});
