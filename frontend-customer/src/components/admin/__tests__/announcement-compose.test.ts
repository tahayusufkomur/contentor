import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ clientFetch: vi.fn() }));

import AnnouncementCompose from "@/components/admin/announcement-compose";
import { clientFetch } from "@/lib/api-client";
import {
  draftChanges,
  isHers,
  layOver,
  saveDraftChanges,
  type DraftFields,
} from "@/lib/announcements";
import adminMessages from "../../../../messages/en/admin.json";

const Intl = NextIntlClientProvider as React.FC<{
  locale: string;
  timeZone: string;
  messages: { admin: typeof adminMessages };
  children?: React.ReactNode;
}>;

const render = (props: Partial<Parameters<typeof AnnouncementCompose>[0]>) =>
  renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages: { admin: adminMessages } },
      createElement(AnnouncementCompose, { onSent: () => {}, ...props }),
    ),
  );

const base: DraftFields = { title: "Hello", body: "<p>Hi</p>", link: "" };

describe("AnnouncementCompose", () => {
  it("in focus mode it edits the draft and shows no send button", () => {
    const html = render({ focus: { record: 7, runId: null } });
    // The fields the copy run writes are there to edit...
    expect(html).toContain('placeholder="Title"');
    expect(html).toContain("Write announcement body…");
    // ...and nothing on the page sends, schedules or repeats: the finish step does.
    expect(html).not.toContain("Send now");
    expect(html).not.toContain("Schedule");
    expect(html).not.toContain("Repeating");
    expect(html).not.toContain("Reviewing draft");
  });

  it("the plain composer still sends from the page", () => {
    const html = render({});
    expect(html).toContain("Send now");
    expect(html).toContain("Repeating");
  });

  it("the plain composer reviewing a draft keeps its banner", () => {
    const html = render({
      reviewDraft: { id: 3, prefill: { title: "T", body: "", link: "" } },
    });
    expect(html).toContain("Reviewing draft");
    expect(html).toContain("Send now");
  });
});

describe("what a focus save sends", () => {
  it("is only what she changed, so a save never reverts the run's write", () => {
    // The run wrote a new body on the server; she only retitled the message.
    expect(draftChanges({ ...base, title: "Hello all" }, base)).toEqual({
      title: "Hello all",
    });
    expect(draftChanges(base, base)).toEqual({});
  });

  it("does not count trailing spaces, and does not save a cleared title", () => {
    expect(draftChanges({ ...base, title: "Hello  " }, base)).toEqual({});
    expect(draftChanges({ ...base, title: "" }, base)).toEqual({});
    expect(draftChanges({ ...base, link: " /courses " }, base)).toEqual({
      link: "/courses",
    });
  });
});

describe("a newer copy of the draft", () => {
  const none: DraftFields = { title: "", body: "", link: "" };

  it("takes a field she has not changed and keeps one she has", () => {
    const run = { title: "From the run", body: "<p>Run</p>", link: "" };
    // She retitled it while the run was still writing: the title stays hers.
    const { form, placed } = layOver(
      { title: "Mine", body: "", link: "" },
      none,
      run,
    );
    expect(form).toEqual({ title: "Mine", body: "<p>Run</p>", link: "" });
    expect(placed).toEqual({ title: "", body: "<p>Run</p>", link: "" });
  });

  it("keeps her field even after a save put it on the server", () => {
    // Her title was saved ("Mine" is on the server and in `base`), but the
    // run's replay still shows its own title later: that is not hers to take.
    expect(isHers("title", "Mine", "")).toBe(true);
    expect(isHers("title", "Hello ", "Hello")).toBe(false);
    expect(isHers("body", "", "")).toBe(false);
  });
});

describe("saveDraftChanges", () => {
  beforeEach(() => {
    vi.mocked(clientFetch).mockReset();
  });

  it("PATCHes that draft with only the changed fields", async () => {
    vi.mocked(clientFetch).mockResolvedValue({});
    const sent = await saveDraftChanges(
      7,
      { ...base, body: "<p>New</p>" },
      base,
    );
    expect(sent).toEqual({ body: "<p>New</p>" });
    expect(clientFetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(clientFetch).mock.calls[0];
    expect(url).toBe("/api/v1/admin/notifications/announcements/7/");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({ body: "<p>New</p>" });
  });

  it("makes no request when nothing changed", async () => {
    expect(await saveDraftChanges(7, base, base)).toEqual({});
    expect(clientFetch).not.toHaveBeenCalled();
  });

  it("lets a failed save reach the caller, who keeps her text", async () => {
    vi.mocked(clientFetch).mockRejectedValue(new Error("down"));
    await expect(
      saveDraftChanges(7, { ...base, title: "Edited" }, base),
    ).rejects.toThrow("down");
  });
});
