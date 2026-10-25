import { describe, expect, it } from "vitest";
import {
  addCut,
  gaps,
  inverse,
  isVideoStudio,
  merged,
  pieces,
  restore,
  snap,
  stamp,
  wordsCut,
} from "@/lib/reels/studio";
import type { ReelDetail, Word } from "@/types/reels";

const WORDS: Word[] = [
  [1.0, 1.4, " Hello"],
  [1.4, 1.9, " there."],
  [3.0, 3.3, " Do"],
  [3.3, 3.6, " this."],
];

const reel = {
  start: 0,
  end: 10,
  title: "Hook",
  caption: "",
  style: "bold",
  layout: "auto",
  options: { cuts: true, cover: true, progress: true },
  cover: { design: "editorial", frame: "a.jpg", label: "", photo: "a-url" },
  frames: [{ key: "b.jpg", url: "b-url", face: null, aspect: 1.78 }],
  edits: { caption_at: 0.3 },
  words: WORDS,
  keep: [[0, 10]],
  cutaways: [{ at: 2, photo: "p1", start: 2, end: 4.5, url: "u" }],
} as unknown as ReelDetail;

describe("isVideoStudio", () => {
  it("is one reel in the studio, not its list", () => {
    expect(isVideoStudio("/admin/video-studio/abc")).toBe(true);
    expect(isVideoStudio("/admin/video-studio")).toBe(false);
    expect(isVideoStudio("/admin/reels/abc")).toBe(false);
  });
});

describe("inverse", () => {
  it("puts back only what the patch changes", () => {
    expect(
      inverse(reel, {
        start: 3,
        options: { cuts: false },
        cover: { design: "bold" },
        edits: { caption_at: 0.5, cuts: [[1, 2]] },
        cutaways: [],
      }),
    ).toEqual({
      start: 0,
      options: { cuts: true },
      cover: { design: "editorial" },
      edits: { caption_at: 0.3, cuts: null },
      cutaways: [{ at: 2, photo: "p1" }],
    });
  });
});

describe("merged", () => {
  it("shows a change before the server answers", () => {
    const next = merged(reel, {
      title: "New",
      cover: { frame: "b.jpg" },
      edits: { caption_at: null, text: { "1.4": "everyone." } },
      cutaways: [{ at: 5, photo: "p1" }],
    });
    expect(next.title).toBe("New");
    expect(next.cover.photo).toBe("b-url");
    expect(next.edits).toEqual({ text: { "1.4": "everyone." } });
    expect(next.words[1]).toEqual([1.4, 1.9, " everyone."]);
    expect(next.cutaways[0]).toMatchObject({ at: 5, start: 5, end: 7.5 });
  });

  it("moves the kept pieces with a trim", () => {
    const cut = {
      ...reel,
      keep: [
        [0, 4],
        [5, 10],
      ],
    } as ReelDetail;
    expect(merged(cut, { start: 2 }).keep).toEqual([
      [0, 2],
      [3, 8],
    ]);
    expect(merged(cut, { end: 12 }).keep).toEqual([
      [0, 4],
      [5, 12],
    ]);
  });
});

describe("cuts", () => {
  it("merge as they are added and come back in part", () => {
    const cuts = addCut(addCut([], 5, 6), 2, 3);
    expect(addCut(cuts, 2.5, 5.5)).toEqual([[2, 6]]);
    expect(restore([[2, 6]], 3, 4)).toEqual([
      [2, 3],
      [4, 6],
    ]);
    expect(restore([[2, 6]], 0, 10)).toEqual([]);
  });

  it("show as gaps, hers marked apart from the pauses", () => {
    expect(
      gaps(
        0,
        10,
        [
          [0, 2],
          [3, 8],
        ],
        [[7.9, 10]],
      ),
    ).toEqual([
      { a: 2, b: 3, manual: false },
      { a: 8, b: 10, manual: true },
    ]);
  });

  it("of words take the silence around them, but for a breath", () => {
    expect(wordsCut(WORDS, 2, 3)).toEqual({ a: 2.05, b: 3.6 });
    expect(wordsCut(WORDS, 0, 0)).toEqual({ a: 1, b: 1.4 });
  });
});

describe("pieces", () => {
  it("are the kept stretches on the video's clock, split where she split them", () => {
    expect(pieces(10, [[0, 4]], [12, 10.05])).toEqual([
      { a: 10, b: 12 },
      { a: 12, b: 14 },
    ]);
  });
});

describe("snap", () => {
  it("lands a trim just before a word or just after one", () => {
    expect(snap(2.95, WORDS, 0.2, "start")).toBe(2.9);
    expect(snap(2.2, WORDS, 0.2, "end")).toBe(2.15);
    expect(snap(6, WORDS, 0.2, "end")).toBe(6);
  });
});

describe("stamp", () => {
  it("is minutes, seconds and tenths", () => {
    expect(stamp(75.36)).toBe("1:15.3");
  });
});
