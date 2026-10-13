import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/lib/messages";

const NOW = Date.parse("2026-10-13T12:00:00Z");

const announcement = (over: Record<string, unknown>) => ({
  id: 1,
  title: "Hello",
  status: "sent" as const,
  scheduled_at: null,
  created_at: "2026-10-10T09:00:00Z",
  recipient_count: 12,
  push_sent_count: 4,
  read_count: 7,
  ...over,
});

const campaign = (over: Record<string, unknown>) => ({
  id: 1,
  subject: "Newsletter",
  status: "sent" as const,
  recipient_count: 30,
  success_count: 28,
  failure_count: 2,
  created_at: "2026-10-11T09:00:00Z",
  scheduled_at: null,
  sent_at: "2026-10-11T09:05:00Z",
  ...over,
});

describe("mergeMessages", () => {
  it("keeps an announcement and an email with the same id apart", () => {
    const rows = mergeMessages([announcement({})], [campaign({})], NOW);
    expect(rows.map((r) => r.key)).toEqual(["e-1", "a-1"]);
    expect(rows.map((r) => r.href)).toEqual([
      "/admin/messages/email/1",
      "/admin/messages/1",
    ]);
  });

  it("puts what goes out next on top, then the most recent", () => {
    const rows = mergeMessages(
      [
        announcement({ id: 1, sent_at: "2026-10-12T08:00:00Z" }),
        announcement({
          id: 2,
          status: "scheduled",
          scheduled_at: "2026-10-20T08:00:00Z",
        }),
      ],
      [
        campaign({ id: 3 }),
        campaign({
          id: 4,
          status: "scheduled",
          scheduled_at: "2026-10-15T08:00:00Z",
          sent_at: null,
        }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.key)).toEqual(["a-2", "e-4", "a-1", "e-3"]);
  });

  it("reads a send-now still in flight as sending, not as scheduled", () => {
    const [inFlight] = mergeMessages(
      [announcement({ status: "scheduled", scheduled_at: null })],
      [],
      NOW,
    );
    expect(inFlight.status).toBe("sending");
    const [due] = mergeMessages(
      [
        announcement({
          status: "scheduled",
          scheduled_at: "2026-10-13T11:59:00Z",
        }),
      ],
      [],
      NOW,
    );
    expect(due.status).toBe("sending");
    const [later] = mergeMessages(
      [
        announcement({
          status: "scheduled",
          scheduled_at: "2026-10-13T12:30:00Z",
        }),
      ],
      [],
      NOW,
    );
    expect(later.status).toBe("scheduled");
    expect(later.at).toBe("2026-10-13T12:30:00Z");
  });

  it("opens a draft in the composer and says where each message goes", () => {
    const rows = mergeMessages(
      [
        announcement({ id: 5, status: "draft" }),
        announcement({ id: 6, also_email: true }),
      ],
      [campaign({ id: 7, status: "partial" })],
      NOW,
    );
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey["a-5"].href).toBe("/admin/messages/new?draft=5");
    expect(byKey["a-5"].channel).toBe("app");
    expect(byKey["a-6"].channel).toBe("appEmail");
    expect(byKey["e-7"]).toMatchObject({
      channel: "email",
      status: "partial",
      reached: 28,
      failed: 2,
    });
  });
});
