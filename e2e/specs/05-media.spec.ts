// e2e/specs/05-media.spec.ts
//
// Verifies the full media upload/download round-trip through MinIO:
//
//   1. POST /api/v1/upload/presign/ → gets presigned PUT URL (localhost:9000)
//   2. PUT the PNG to the presigned URL
//   3. POST /api/v1/upload/complete/ → creates the Photo record, returns signed_url
//   4. GET /api/v1/photos/<id>/ → confirm signed_url present
//   5. Fetch the signed download URL → verify byte-length equality
//
// Real API contract (confirmed from backend/apps/core/uploads/views.py):
//   presign → { upload_url, s3_key }
//   complete → { photo_id, s3_key, signed_url }
//   photo detail → { signed_url, ... }

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { coachContext, TENANT } from "../helpers/auth";

test("photo upload round-trips through MinIO and presigned GET serves it", async ({ browser }) => {
  const coach = await coachContext(browser);
  const api = coach.request;

  // ── Step 1: Get presigned upload URL ────────────────────────────────────────
  const presignRes = await api.post(`${TENANT}/api/v1/upload/presign/`, {
    data: {
      filename: "pixel.png",
      content_type: "image/png",
      category: "photo",
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(
    presignRes.status(),
    `presign failed: ${await presignRes.text()}`
  ).toBe(200);

  const presignBody = await presignRes.json();
  expect(
    presignBody.upload_url,
    `upload_url missing from presign response: ${JSON.stringify(presignBody)}`
  ).toBeTruthy();
  expect(
    presignBody.s3_key,
    `s3_key missing from presign response: ${JSON.stringify(presignBody)}`
  ).toBeTruthy();
  expect(
    presignBody.upload_url,
    `upload_url should point to localhost:9000 (external MinIO endpoint), got: ${presignBody.upload_url}`
  ).toContain("localhost:9000");

  const uploadUrl: string = presignBody.upload_url;
  const s3Key: string = presignBody.s3_key;

  // ── Step 2: PUT the PNG bytes to the presigned URL ───────────────────────────
  const png = fs.readFileSync(path.join(__dirname, "..", "fixtures", "pixel.png"));
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  expect(
    putRes.ok,
    `MinIO presigned PUT failed: ${putRes.status} ${putRes.statusText}`
  ).toBeTruthy();

  // ── Step 3: Mark upload complete — creates Photo record ──────────────────────
  const completeRes = await api.post(`${TENANT}/api/v1/upload/complete/`, {
    data: {
      s3_key: s3Key,
      category: "photo",
      file_size: png.byteLength,
    },
    headers: { "Content-Type": "application/json" },
  });
  expect(
    completeRes.status(),
    `upload/complete failed: ${await completeRes.text()}`
  ).toBe(200);

  const completeBody = await completeRes.json();
  expect(
    completeBody.photo_id,
    `photo_id missing from complete response: ${JSON.stringify(completeBody)}`
  ).toBeTruthy();
  expect(
    completeBody.signed_url,
    `signed_url missing from complete response: ${JSON.stringify(completeBody)}`
  ).toBeTruthy();

  const photoId: string = completeBody.photo_id;

  // ── Step 4: Read back photo detail via REST ──────────────────────────────────
  const detailRes = await api.get(`${TENANT}/api/v1/photos/${photoId}/`);
  expect(
    detailRes.status(),
    `photo detail GET failed: ${await detailRes.text()}`
  ).toBe(200);

  const detail = await detailRes.json();
  expect(
    detail.signed_url,
    `signed_url missing from photo detail: ${JSON.stringify(detail)}`
  ).toBeTruthy();

  // ── Step 5: Download via presigned GET and verify byte length ────────────────
  const dlRes = await fetch(detail.signed_url);
  expect(
    dlRes.ok,
    `presigned download GET failed: ${dlRes.status} ${dlRes.statusText} url=${detail.signed_url}`
  ).toBeTruthy();

  const downloaded = await dlRes.arrayBuffer();
  expect(downloaded.byteLength).toBe(png.byteLength);

  await coach.close();
});
