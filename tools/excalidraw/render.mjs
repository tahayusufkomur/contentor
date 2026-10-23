// Render .excalidraw files to PNG (next to each file) with the editor's own
// Excalidraw build, offline. The excalidraw-diagram skill's visual check.
//   node tools/excalidraw/render.mjs docs/diagrams/<name>.excalidraw [...]
import { once } from "node:events";
import fs from "node:fs";
import { chromium } from "playwright";
import { build, createServer } from "./server.mjs";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("usage: node render.mjs <file.excalidraw> [...]");
  process.exit(1);
}

await build();
const server = createServer().listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${server.address().port}/export.html`);
  await page.waitForFunction(() => window.exportToSvg);
  for (const file of files) {
    const scene = JSON.parse(fs.readFileSync(file, "utf8"));
    const size = await page.evaluate(
      async ({ elements, appState = {}, files = {} }) => {
        // exportScale defaults to devicePixelRatio; the page's 2x already sharpens the PNG
        const svg = await window.exportToSvg({
          elements,
          appState: { ...appState, exportBackground: true, exportScale: 1 },
          files,
        });
        document.body.replaceChildren(svg);
        return {
          width: Math.ceil(svg.width.baseVal.value),
          height: Math.ceil(svg.height.baseVal.value),
        };
      },
      scene,
    );
    await page.setViewportSize(size);
    const png = file.replace(/\.excalidraw$/, "") + ".png";
    await page.locator("svg").first().screenshot({ path: png });
    console.log(png);
  }
} finally {
  await browser.close();
  server.close();
}
