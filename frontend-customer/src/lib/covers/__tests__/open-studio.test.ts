import { beforeEach, describe, expect, it, vi } from "vitest";
import { openCoverStudio } from "@/lib/covers/open-studio";
import { openDesign } from "@/lib/designs-api";

vi.mock("@/lib/designs-api", () => ({ openDesign: vi.fn() }));

const open = vi.mocked(openDesign);
beforeEach(() => {
  // Braces: a function returned from beforeEach is run after the test, and the mock is one.
  open.mockReset();
});

describe("openCoverStudio", () => {
  it("opens the target's draft and goes to its editor", async () => {
    open.mockResolvedValue({ id: "d-1" } as never);
    const navigate = vi.fn();
    await openCoverStudio(
      { target_kind: "live", target_key: "Flow" },
      navigate,
    );
    expect(open).toHaveBeenCalledWith({
      target_kind: "live",
      target_key: "Flow",
    });
    expect(navigate).toHaveBeenCalledWith("/admin/studio/d-1");
  });

  it("starts the draft as a copy when given a kept design", async () => {
    open.mockResolvedValue({ id: "d-2" } as never);
    const navigate = vi.fn();
    await openCoverStudio(
      { target_kind: "course", target_key: "7" },
      navigate,
      "kept-1",
    );
    expect(open).toHaveBeenCalledWith({
      target_kind: "course",
      target_key: "7",
      from: "kept-1",
    });
    expect(navigate).toHaveBeenCalledWith("/admin/studio/d-2");
  });

  it("sends the target and nothing else of a whole list row", async () => {
    open.mockResolvedValue({ id: "d-3" } as never);
    const row = {
      target_kind: "course",
      target_key: "7",
      title: "Yoga",
      cover: { id: "kept-1" },
      draft_id: null,
    };
    await openCoverStudio(row, vi.fn());
    expect(open).toHaveBeenCalledWith({
      target_kind: "course",
      target_key: "7",
    });
  });

  it("stays put, and says why, when the draft cannot be opened", async () => {
    open.mockRejectedValue(new Error("that course no longer exists"));
    const navigate = vi.fn();
    await expect(
      openCoverStudio({ target_kind: "course", target_key: "7" }, navigate),
    ).rejects.toThrow("that course no longer exists");
    expect(navigate).not.toHaveBeenCalled();
  });
});
