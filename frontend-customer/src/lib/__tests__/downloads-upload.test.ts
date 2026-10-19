// A download's file goes up in three steps: a signed address, the PUT to
// storage (with progress), then "it is there". A failed PUT stops the chain.

import { beforeEach, describe, expect, it, vi } from "vitest";

const clientFetch = vi.fn();
vi.mock("@/lib/api-client", () => ({
  clientFetch: (...args: unknown[]) => clientFetch(...args),
}));

import { uploadDownloadFile } from "@/lib/downloads/upload";

let status = 200;
class FakeXHR {
  upload: { onprogress?: (e: Partial<ProgressEvent>) => void } = {};
  status = 0;
  onload?: () => void;
  onerror?: () => void;
  opened: string[] = [];
  open(method: string, url: string) {
    this.opened = [method, url];
    puts.push(this);
  }
  setRequestHeader() {}
  send() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    this.status = status;
    this.onload?.();
  }
}
let puts: FakeXHR[] = [];

beforeEach(() => {
  status = 200;
  puts = [];
  clientFetch.mockReset();
  clientFetch.mockResolvedValueOnce({
    upload_url: "https://s3/put",
    s3_key: "k",
  });
  clientFetch.mockResolvedValueOnce({});
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
});

const file = new File(["ab"], "guide.pdf", { type: "application/pdf" });

describe("uploadDownloadFile", () => {
  it("presigns for the download, PUTs the file, then completes it", async () => {
    const progress: number[] = [];
    await uploadDownloadFile(7, file, (pct) => progress.push(pct));

    const [presign, complete] = clientFetch.mock.calls;
    expect(presign[0]).toBe("/api/v1/upload/presign/");
    expect(JSON.parse(presign[1].body)).toMatchObject({
      filename: "guide.pdf",
      category: "download",
      download_id: 7,
    });
    expect(puts[0].opened).toEqual(["PUT", "https://s3/put"]);
    expect(progress).toEqual([50]);
    expect(complete[0]).toBe("/api/v1/upload/complete/");
    expect(JSON.parse(complete[1].body)).toEqual({
      s3_key: "k",
      category: "download",
      download_id: 7,
      file_size: 2,
    });
  });

  it("throws on a failed PUT and never completes", async () => {
    status = 403;
    await expect(uploadDownloadFile(7, file, () => {})).rejects.toThrow(
      "Upload failed with status 403",
    );
    expect(clientFetch).toHaveBeenCalledTimes(1);
  });
});
