import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fontFaceCss } from "@shared/logo/export";

// Google serves one @font-face per unicode-range subset, latin last.
const CSS = `
@font-face { font-family: 'X'; src: url(https://fonts.gstatic.com/ext.woff2) format('woff2'); unicode-range: U+0100-02BA, U+0131; }
@font-face { font-family: 'X'; src: url(https://fonts.gstatic.com/latin.woff2) format('woff2'); unicode-range: U+0000-00FF, U+0131; }
`;

let failExt = false;
beforeEach(() => {
  failExt = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("googleapis")) return { text: async () => CSS };
      if (url.includes("ext") && failExt) return { ok: false, status: 500 };
      return { ok: true, blob: async () => url };
    }),
  );
  vi.stubGlobal(
    "FileReader",
    class {
      result = "";
      onload: () => void = () => {};
      readAsDataURL(b: string) {
        this.result = `data:${b}`;
        this.onload();
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("fontFaceCss", () => {
  it("embeds only latin when the text needs no latin-ext", async () => {
    const css = await fontFaceCss("A", 400, false);
    expect(css).toContain("latin.woff2");
    expect(css).not.toContain("ext.woff2");
  });

  it("embeds latin-ext first, latin last, each with its unicode-range", async () => {
    const css = await fontFaceCss("B", 400, true);
    expect(css.indexOf("ext.woff2")).toBeGreaterThanOrEqual(0);
    expect(css.indexOf("ext.woff2")).toBeLessThan(css.indexOf("latin.woff2"));
    expect(css).toContain("unicode-range:U+0100-02BA");
    expect(css).toContain("unicode-range:U+0000-00FF");
  });

  it("degrades to latin only when the latin-ext download fails", async () => {
    failExt = true;
    const css = await fontFaceCss("C", 400, true);
    expect(css).toContain("latin.woff2");
    expect(css).not.toContain("ext.woff2");
  });

  it("still fails when the latin download fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("googleapis")
          ? { text: async () => CSS }
          : { ok: false, status: 500 },
      ),
    );
    await expect(fontFaceCss("D", 400, true)).rejects.toThrow();
  });
});
