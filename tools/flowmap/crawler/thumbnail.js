// scripts/screenshot-map/thumbnail.js
// Downscale a full-resolution PNG screenshot into small JPEG data URLs using a
// browser canvas — no native image dependency. `page` must be a neutral page
// (about:blank) so the captured tenant page's CSP can't block the data: image.
// Returns { thumb, full }: `thumb` is the node texture; `full` is the lightbox
// image (loaded only on demand). Flows are small (few nodes each), so we can
// afford crisp node textures and a near-original full image — `full` is rendered
// at the capture's native width (no downscale) at high JPEG quality.
async function makeImages(
  page,
  pngBuffer,
  { thumbWidth = 600, fullWidth = 1600, thumbQuality = 0.8, fullQuality = 0.92 } = {},
) {
  const b64 = pngBuffer.toString("base64");
  return page.evaluate(
    async ({ src, thumbWidth, fullWidth, thumbQuality, fullQuality }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const render = (targetW, q) => {
        const scale = Math.min(1, targetW / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", q);
      };
      return { thumb: render(thumbWidth, thumbQuality), full: render(fullWidth, fullQuality) };
    },
    { src: b64, thumbWidth, fullWidth, thumbQuality, fullQuality },
  );
}

module.exports = { makeImages };
