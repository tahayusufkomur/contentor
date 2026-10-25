// e2e/specs/42-reels.spec.ts
//
// Reels (backend/apps/reels, frontend-customer components/admin/reels): a short clip of a coach's video,
// framed 9:16 and captioned, made into a real MP4 by the video service (infra/video) and downloaded.
//
// Scribe and the moment-picking model are not part of the run: the dev-only words endpoint gives the video
// its words and a draft reel picked from them by rule (both are unit-tested on the backend). What runs for
// real: the Reels page, the editor's live preview and autosave, the render (ffmpeg in the video service,
// the end card through the browser sidecar) and the download link.

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

test("a reel is edited, made into a video and downloaded", async ({ browser }) => {
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
    // ── Its words and a draft reel ──────────────────────────────────────────
    const seeded = await api.post(`${TENANT}/api/v1/reels/dev/words/${video.id}/`, {
      data: { words: WORDS, language: "en", reel: true },
    });
    expect(seeded.status(), `seeding failed: ${await seeded.text()}`).toBe(200);
    const { reel } = (await seeded.json()) as { reel: string };

    // ── The Reels page lists it under its video ─────────────────────────────
    const page = await coach.newPage();
    await page.goto(`${TENANT}/admin/reels?video=${video.id}`);
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible(SLOW);
    await page.locator(`a[href="/admin/reels/${reel}"]`).click();
    await page.waitForURL(new RegExp(`/admin/reels/${reel}$`));

    // ── The editor: a live preview, and every change saved ──────────────────
    await expect(page.getByLabel("Preview of the reel")).toBeVisible(SLOW);
    const saved = page.waitForResponse(
      (res) => res.request().method() === "PATCH" && res.url().endsWith(`/api/v1/reels/${reel}/`),
    );
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
  } finally {
    // the video's deletion takes its reels, and their files with them
    await api.delete(`${TENANT}/api/v1/courses/videos/${video.id}/`);
  }
});
