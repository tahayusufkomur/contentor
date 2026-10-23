import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPlatform, isInAppBrowser } from "@/lib/usage";

const IPAD =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 402.0.0.0.0";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

function ua(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

afterEach(() => vi.unstubAllGlobals());

describe("detectPlatform", () => {
  it("reads an iPad asking for the desktop site as iOS, a Mac as desktop", () => {
    ua(IPAD, 5);
    expect(detectPlatform()).toBe("ios");
    ua(IPAD, 0);
    expect(detectPlatform()).toBe("desktop");
  });
});

describe("isInAppBrowser", () => {
  it("spots Instagram's browser but not Safari", () => {
    ua(INSTAGRAM_IOS);
    expect(isInAppBrowser()).toBe(true);
    ua(SAFARI_IOS);
    expect(isInAppBrowser()).toBe(false);
  });
});
