import { describe, expect, it } from "vitest";
import {
  displayStatus,
  kindFromParams,
  type EventRow,
} from "@/components/admin/live/kinds";

const row = (over: Partial<EventRow>): EventRow => ({
  id: 1,
  kind: "live",
  title: "Class",
  description: "",
  status: "scheduled",
  computed_status: "scheduled",
  pricing_type: "free",
  price: "0",
  scheduled_at: null,
  created_at: "2026-10-13T00:00:00Z",
  ...over,
});

describe("kindFromParams", () => {
  it("reads the assistant's kind, and the tab of an older link", () => {
    const of = (query: string) => kindFromParams(new URLSearchParams(query));
    expect(of("event=4&kind=zoom")).toBe("zoom");
    expect(of("tab=streams")).toBe("stream");
    expect(of("tab=classes&event=4&kind=live")).toBe("live");
    expect(of("tab=onsite")).toBe("onsite");
    expect(of("kind=nonsense")).toBeNull();
    expect(of("")).toBeNull();
  });
});

describe("displayStatus", () => {
  it("shows a built-in class as live only while she runs it", () => {
    // The clock says the hour has begun, but she has not pressed Go live.
    expect(
      displayStatus(row({ status: "scheduled", computed_status: "live" })),
    ).toBe("scheduled");
    expect(
      displayStatus(row({ status: "live", computed_status: "ended" })),
    ).toBe("live");
    // A class nobody started, an hour after its time: over.
    expect(
      displayStatus(row({ status: "scheduled", computed_status: "ended" })),
    ).toBe("ended");
  });

  it("lets a Zoom class or an in-person event follow the clock", () => {
    expect(
      displayStatus(
        row({ kind: "zoom", status: "scheduled", computed_status: "ended" }),
      ),
    ).toBe("ended");
    expect(
      displayStatus(
        row({
          kind: "onsite",
          status: "scheduled",
          computed_status: "ongoing",
        }),
      ),
    ).toBe("live");
    expect(
      displayStatus(
        row({ kind: "zoom", status: "draft", computed_status: "draft" }),
      ),
    ).toBe("draft");
  });

  it("shows a held draft (a draft with its date) as a draft", () => {
    expect(
      displayStatus(
        row({
          kind: "zoom",
          status: "draft",
          computed_status: "scheduled",
          scheduled_at: "2030-01-01T18:00:00Z",
        }),
      ),
    ).toBe("draft");
    expect(
      displayStatus(row({ status: "draft", computed_status: "ended" })),
    ).toBe("draft");
  });
});
