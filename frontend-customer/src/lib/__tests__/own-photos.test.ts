import { describe, expect, it } from "vitest";
import {
  coverage,
  isSmall,
  OWN_PHOTO_MAX_BYTES,
  ownPhotosAnswer,
  photoProblem,
  shapeOf,
  statusLine,
  tally,
} from "../own-photos";

const file = (name: string, type: string, size = 1_000_000) => ({
  name,
  type,
  size,
});

describe("photoProblem", () => {
  it("takes the formats a browser shows and the server reads", () => {
    for (const [name, type] of [
      ["a.jpg", "image/jpeg"],
      ["a.png", "image/png"],
      ["a.webp", "image/webp"],
      ["a.avif", "image/avif"],
    ])
      expect(photoProblem(file(name, type))).toBeNull();
  });

  it("reads the type from the name when the browser gives none", () => {
    expect(photoProblem(file("IMG_2231.JPG", ""))).toBeNull();
    expect(photoProblem(file("notes.pdf", ""))).toMatch(/Only JPG/);
  });

  it("says what to do with an iPhone HEIC instead of failing later", () => {
    expect(photoProblem(file("IMG_0001.HEIC", "image/heic"))).toMatch(
      /Save it as a JPEG/,
    );
    expect(photoProblem(file("IMG_0001.heic", ""))).toMatch(/HEIC/);
  });

  it("refuses videos, GIFs and files over 25 MB", () => {
    expect(photoProblem(file("clip.mp4", "video/mp4"))).toMatch(/Only JPG/);
    expect(photoProblem(file("fun.gif", "image/gif"))).toMatch(/Only JPG/);
    expect(
      photoProblem(file("huge.jpg", "image/jpeg", OWN_PHOTO_MAX_BYTES + 1)),
    ).toMatch(/25 MB/);
    expect(
      photoProblem(file("edge.jpg", "image/jpeg", OWN_PHOTO_MAX_BYTES)),
    ).toBeNull();
  });
});

describe("shapeOf", () => {
  // Pinned to the backend's own_photos.orientation_of: both sort a photo
  // into the same shape, or the guide's count and the composer disagree.
  it("calls a photo within a tenth of square a square", () => {
    expect(shapeOf(3000, 2000)).toBe("landscape");
    expect(shapeOf(2000, 3000)).toBe("portrait");
    expect(shapeOf(2000, 2000)).toBe("square");
    expect(shapeOf(2180, 2000)).toBe("square");
    expect(shapeOf(2220, 2000)).toBe("landscape");
    expect(shapeOf(2064, 2400)).toBe("portrait");
  });

  it("has no shape for a photo it cannot measure", () => {
    expect(shapeOf(null, 2000)).toBeNull();
    expect(shapeOf(0, 0)).toBeNull();
    expect(shapeOf()).toBeNull();
  });
});

describe("tally and coverage", () => {
  it("counts her photos by shape, leaving out the unmeasured", () => {
    expect(
      tally([
        { width: 3000, height: 2000 },
        { width: 2400, height: 1600 },
        { width: 2000, height: 3000 },
        { width: null, height: null },
      ]),
    ).toEqual({ portrait: 1, landscape: 2, square: 0 });
  });

  it("says how far her photos go for a home page", () => {
    expect(coverage(0, 10)).toBe("A home page shows 10");
    expect(coverage(0, 0)).toBe("Optional");
    expect(coverage(6, 10)).toBe("6 of 10 added");
    expect(coverage(10, 10)).toBe("10 added, enough for your home page");
    expect(coverage(12, 3)).toBe("12 added, enough for your home page");
  });
});

describe("what a photo's caption says", () => {
  it("only waits on the upload and the web-ready copy, never on the index", () => {
    expect(statusLine("uploading")).toBe("Uploading");
    expect(statusLine("pending")).toBe("Making it web-ready");
    for (const status of ["queued", "indexing", "ready", "failed"])
      expect(statusLine(status)).toBe("Added");
    expect(statusLine("error")).toMatch(/upload/);
  });

  it("flags a photo that is too small to show large", () => {
    expect(isSmall(674, 441)).toBe(true);
    expect(isSmall(1600, 1067)).toBe(false);
    expect(isSmall(null, null)).toBe(false);
  });

  it("writes the answer the transcript keeps", () => {
    expect(ownPhotosAnswer(1)).toBe("My own photo");
    expect(ownPhotosAnswer(14)).toBe("My own 14 photos");
  });
});
