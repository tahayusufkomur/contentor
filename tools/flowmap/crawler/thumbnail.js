// scripts/screenshot-map/thumbnail.js
// Downscale a full-resolution PNG screenshot into small JPEG data URLs using a
// browser canvas — no native image dependency. `page` must be a neutral page
// (about:blank) so the captured tenant page's CSP can't block the data: image.
// Returns { thumb, full }: `thumb` is the node texture (kept tiny so Cytoscape
// stays smooth); `full` is the larger lightbox image (loaded only on demand).
async function makeImages(page, pngBuffer, { thumbWidth = 360, fullWidth = 1100, quality = 0.72 } = {}) {
  const b64 = pngBuffer.toString("base64");
  return page.evaluate(
    async ({ src, thumbWidth, fullWidth, quality }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + src;
      await img.decode();
      const render = (targetW) => {
        const scale = Math.min(1, targetW / img.naturalWidth);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", quality);
      };
      return { thumb: render(thumbWidth), full: render(fullWidth) };
    },
    { src: b64, thumbWidth, fullWidth, quality },
  );
}

module.exports = { makeImages };
