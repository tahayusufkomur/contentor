import { describe, expect, it } from "vitest";
import { ApiError } from "@/types/api";
import { tEn } from "./setup-t";
import { fileProblem, shareErrorText } from "../share-doc";

describe("fileProblem", () => {
  it("accepts pdf, txt and md within 5 MB, any case", () => {
    for (const name of ["cv.pdf", "bio.TXT", "about.md"])
      expect(fileProblem({ name, size: 1000 }, tEn)).toBeNull();
  });

  it("refuses other types and big files with a plain reason", () => {
    expect(fileProblem({ name: "cv.docx", size: 10 }, tEn)).toMatch(
      /PDF, text/,
    );
    expect(fileProblem({ name: "cv.pdf", size: 6 * 1024 * 1024 }, tEn)).toMatch(
      /too big/,
    );
  });
});

describe("shareErrorText", () => {
  it("shows the server's plain 400 message and a calm line for the rest", () => {
    expect(
      shareErrorText(
        new ApiError(400, { detail: "I couldn't read that file." }),
        tEn,
      ),
    ).toBe("I couldn't read that file.");
    expect(
      shareErrorText(new ApiError(503, { detail: "ai_unavailable" }), tEn),
    ).toMatch(/Try again in a minute/);
    expect(shareErrorText(new TypeError("fetch failed"), tEn)).toMatch(
      /Try again/,
    );
  });
});
