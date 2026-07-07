// Client-side export pipeline for Logo Studio: rasterize a live <svg> DOM
// node (from LogoRenderer/MarkRenderer, via their svgRef) to a PNG blob and
// upload it through the app's existing presigned-upload flow.
//
// Two browser-API gotchas drive nearly all of this file:
//
// 1. An SVG rasterized via `<img>`/canvas is a separate rendering context —
//    it does NOT inherit the host page's webfonts, even if `document.fonts`
//    reports them as loaded for the main document. To get <text> to render
//    in the chosen brand font, the font must be embedded INSIDE the SVG as
//    an inline `@font-face` whose `src` is a `data:` URI.
// 2. Canvas tainting: per the HTML5 "origin-clean" algorithm, drawing an
//    SVG-as-image that itself references ANY external resource (a
//    cross-origin `@font-face` url(), an `<image href="https://...">`) is
//    treated as a potentially cross-origin paint. Browsers either refuse to
//    load that inner resource at all, or load it but mark the canvas
//    non-origin-clean — so `canvas.toBlob()` throws `SecurityError`, or the
//    resource silently renders blank. This is true even though the *outer*
//    SVG blob: URL is same-origin, and even though the inner resource may
//    itself serve permissive CORS headers — the SVG-as-image context does
//    not perform per-resource CORS negotiation the way a plain <img> does.
//    The only universally-correct fix is to leave NO external `http(s):`
//    reference anywhere in the serialized SVG: every font url() and every
//    <image href> must be inlined as a `data:` URI before serialization.
//    A `data:` URI has no network origin at all, so drawing it can never
//    taint the canvas.
import { clientFetch } from "@/lib/api-client";

interface PresignResponse {
  upload_url: string;
  s3_key: string;
}

interface CompleteResponse {
  photo_id: string;
  signed_url: string;
}

/** fetch a URL (signed S3/MinIO or blob) and return it as a data: URL. */
export async function imageToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not load image (${resp.status})`);
  const blob = await resp.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Google Fonts CSS for the family (700 weight only — the only weight this
 * app renders text at), with the font file inlined as a data URI.
 *
 * fonts.googleapis.com/css2 serves `Access-Control-Allow-Origin: *`, and so
 * does the fonts.gstatic.com file it points to — both are fetchable
 * cross-origin without a CORS error.
 *
 * Google returns one @font-face block per unicode-range subset (cyrillic,
 * vietnamese, latin-ext, ...). The base Latin block — the one that actually
 * covers plain ASCII brand names (A-Z, 0-9) — is NOT reliably first: for
 * every family in LOGO_FONTS (catalog.ts) it is in fact the LAST block in
 * the response. Naively taking the first `url(...)` in the whole response
 * grabs the wrong subset — e.g. Poppins' first block is `devanagari` — so
 * the embedded font file would be missing basic Latin glyphs and the
 * exported <text> would silently fall back to the generic sans-serif
 * fallback instead of the chosen brand font. Select the block by content
 * (its unicode-range starts at U+0000-00FF) rather than by position.
 */
async function fontFaceCss(fontFamily: string): Promise<string> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}:wght@700&display=swap`;
  const css = await (await fetch(cssUrl)).text();

  const blocks = css.match(/@font-face\s*{[^}]+}/g) || [];
  const latinBlock =
    blocks.find((block) => /unicode-range:\s*U\+0000-00FF/i.test(block)) ??
    blocks[0];
  const match = latinBlock?.match(/src:\s*url\((https:[^)]+)\)/);
  if (!match) return "";

  const fontData = await imageToDataUrl(match[1]);
  return `@font-face{font-family:'${fontFamily}';font-weight:700;src:url(${fontData});}`;
}

export async function svgToPngBlob(
  svg: SVGSVGElement,
  width: number,
  height: number,
  fontFamily: string,
): Promise<Blob> {
  // Best-effort warm of the page's own font cache. This does NOT affect the
  // exported PNG (the SVG-as-image context below never sees it) — it only
  // helps the live on-page preview already showing `svg` settle on the
  // right font. Non-fatal: export still proceeds via the inlined
  // @font-face below even if Google Fonts is unreachable here.
  try {
    await document.fonts.load(`700 64px '${fontFamily}'`);
  } catch {
    /* non-fatal */
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  // Inline external <image> hrefs (uploaded marks) as data URLs — an
  // external reference here is what makes the canvas non-origin-clean, so
  // there must be none left by the time we serialize. Unlike the font
  // below, there is no acceptable fallback for a mark image: if it can't be
  // fetched, throw and let the caller surface the error rather than
  // silently exporting a logo with a missing mark.
  for (const img of Array.from(clone.querySelectorAll("image"))) {
    const href =
      img.getAttribute("href") || img.getAttribute("xlink:href") || "";
    if (href && !href.startsWith("data:")) {
      img.setAttribute("href", await imageToDataUrl(href));
    }
  }

  // Inline the webfont so <text> renders with the chosen family. Fails
  // open: a missing/unreachable font degrades to the <text> element's own
  // `sans-serif` fallback rather than failing the export.
  try {
    const css = await fontFaceCss(fontFamily);
    if (css) {
      const style = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "style",
      );
      style.textContent = css;
      clone.insertBefore(style, clone.firstChild);
    }
  } catch {
    /* fall back to generic font */
  }

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(
    new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG export failed"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Upload an exported PNG through the existing photo-upload flow (presign → PUT → complete). */
export async function uploadPng(
  blob: Blob,
  filename: string,
): Promise<CompleteResponse> {
  const { upload_url, s3_key } = await clientFetch<PresignResponse>(
    "/api/v1/upload/presign/",
    {
      method: "POST",
      body: JSON.stringify({
        filename,
        content_type: "image/png",
        category: "photo",
      }),
    },
  );

  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: blob,
  });
  if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

  return await clientFetch<CompleteResponse>("/api/v1/upload/complete/", {
    method: "POST",
    body: JSON.stringify({
      s3_key,
      category: "photo",
      content_type: "image/png",
      file_size: blob.size,
      title: filename.replace(/\.[^.]+$/, ""),
    }),
  });
}
