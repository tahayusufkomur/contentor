// e2e/specs/42-reels.spec.ts
//
// Reels (backend/apps/reels, frontend-customer components/admin/reels): a moment of a coach's video found as
// an idea with its cover designed, picked, framed 9:16 and captioned, made into a real MP4 by the video
// service (infra/video) and downloaded with its cover picture.
//
// Scribe and the models are not part of the run: the dev-only words endpoint gives the video its words and an
// idea picked from them by rule (both are unit-tested on the backend), its cover frames found by the video
// service in its own order. What runs for real: the Reels page's ideas, the editor's live preview, cover
// designs and autosave, the render (ffmpeg in the video service, the cover and the end card through the
// browser sidecar) and the download links.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { coachContext, TENANT } from "../helpers/auth";

const SLOW = { timeout: 30_000 };
// Six sentences of six words, three seconds each, as Scribe writes words: [start, end, text].
const WORDS = Array.from({ length: 6 }, (_, s) =>
  Array.from({ length: 6 }, (_, w) => [
    +(s * 3 + w * 0.45).toFixed(2),
    +(s * 3 + w * 0.45 + 0.4).toFixed(2),
    ` word${s}${w}${w === 5 ? "." : ""}`,
  ]),
).flat();

test("an idea is picked, its cover designed, made into a video and downloaded", async ({ browser }) => {
  test.setTimeout(240_000);
  const coach = await coachContext(browser);
  const api = coach.request;
  const title = `Reel clip ${Date.now()}`;

  // ── The video, uploaded to the media library ──────────────────────────────
  const clip = fs.readFileSync(path.join(__dirname, "..", "fixtures", "reel-clip.mp4"));
  const presign = await api.post(`${TENANT}/api/v1/upload/presign/`, {
    data: { filename: "reel-clip.mp4", content_type: "video/mp4", category: "library" },
  });
  expect(presign.status(), `presign failed: ${await presign.text()}`).toBe(200);
  const { upload_url, s3_key } = await presign.json();
  const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: clip });
  expect(put.ok, `storage PUT failed: ${put.status}`).toBeTruthy();
  const made = await api.post(`${TENANT}/api/v1/courses/videos/`, {
    data: { title, s3_key, duration_seconds: 20, file_size: clip.length },
  });
  expect(made.status(), `video not created: ${await made.text()}`).toBe(201);
  const video = (await made.json()) as { id: number };

  try {
    // ── Its words and an idea, its cover frames found ───────────────────────
    const seeded = await api.post(`${TENANT}/api/v1/reels/dev/words/${video.id}/`, {
      data: { words: WORDS, language: "en", reel: true },
    });
    expect(seeded.status(), `seeding failed: ${await seeded.text()}`).toBe(200);
    const { reel } = (await seeded.json()) as { reel: string };

    // ── The Reels page shows the video's ideas, each as its cover ───────────
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/reels?video=${video.id}`);
    const idea = page.getByRole("article", { name: "Reel idea" });
    await expect(idea).toHaveCount(1, SLOW);
    await expect(idea.getByText("Strong hook")).toBeVisible();
    await expect(idea.locator("[data-cover-design] img")).toHaveAttribute("src", /^http/);
    await idea.getByRole("button", { name: "Use this idea" }).click();
    await page.waitForURL(new RegExp(`/admin/reels/${reel}$`), SLOW);

    // ── The editor: a live preview, the cover, and every change saved ───────
    await expect(page.getByLabel("Preview of the reel")).toBeVisible(SLOW);
    const save = () =>
      page.waitForResponse(
        (res) => res.request().method() === "PATCH" && res.url().endsWith(`/api/v1/reels/${reel}/`),
      );
    const designs = page.getByRole("radiogroup", { name: "Design" });
    let saved = save();
    await designs.getByRole("radio", { name: /Bold/ }).click();
    expect((await saved).ok()).toBe(true);
    await expect(designs.getByRole("radio", { name: /Bold/ })).toHaveAttribute("aria-checked", "true");
    const frames = page.getByRole("radiogroup", { name: "Frame" }).getByRole("radio");
    expect(await frames.count()).toBeGreaterThan(1);
    saved = save();
    await frames.nth(1).click();
    expect((await saved).ok()).toBe(true);
    await expect(frames.nth(1)).toHaveAttribute("aria-checked", "true");
    saved = save();
    await page.getByRole("radio", { name: /Clean/ }).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByRole("radio", { name: /Clean/ })).toHaveAttribute("aria-checked", "true");

    // ── Made into a video, then downloaded ──────────────────────────────────
    await page.getByRole("button", { name: "Make the video" }).click();
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible({ timeout: 180_000 });
    const link = await api.get(`${TENANT}/api/v1/reels/${reel}/download/`);
    expect(link.status(), `no download link: ${await link.text()}`).toBe(200);
    const file = await fetch(((await link.json()) as { url: string }).url);
    expect(file.ok, `the file did not download: ${file.status}`).toBeTruthy();
    expect(file.headers.get("content-disposition") ?? "").toContain("attachment");
    const body = Buffer.from(await file.arrayBuffer());
    expect(body.subarray(4, 8).toString(), "an MP4 file").toBe("ftyp");
    expect(body.length).toBeGreaterThan(20_000);

    // ── Its cover, the picture posted as the reel's cover ───────────────────
    await expect(page.getByRole("button", { name: "Cover" })).toBeVisible();
    const coverLink = await api.get(`${TENANT}/api/v1/reels/${reel}/cover/`);
    expect(coverLink.status(), `no cover link: ${await coverLink.text()}`).toBe(200);
    const picture = await fetch(((await coverLink.json()) as { url: string }).url);
    expect(picture.ok, `the cover did not download: ${picture.status}`).toBeTruthy();
    const png = Buffer.from(await picture.arrayBuffer());
    expect(png.subarray(1, 4).toString(), "a PNG file").toBe("PNG");
  } finally {
    // the video's deletion takes its reels, and their files with them
    await api.delete(`${TENANT}/api/v1/courses/videos/${video.id}/`);
  }
});
