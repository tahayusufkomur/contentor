import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import createNextIntlPlugin from "next-intl/plugin";
import withSerwistInit from "@serwist/next";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost";

const nextConfig = {
  output: "standalone",
  allowedDevOrigins: [`*.${BASE_DOMAIN}`],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.amazonaws.com" }],
  },
  webpack: (config) => {
    // @mediapipe/tasks-vision has a malformed exports field (conditional keys
    // mixed with subpath exports at the same level). Alias to the bundle directly.
    config.resolve.alias["@mediapipe/tasks-vision"] = path.resolve(
      __dirname,
      "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
    );
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://django:8000"}/api/v1/:path*`,
      },
    ];
  },
};

const revision = randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  disable:
    process.env.NODE_ENV === "development" && process.env.SERWIST_DEV !== "1",
  additionalPrecacheEntries: [{ url: "/offline.html", revision }],
});

export default withSerwist(withNextIntl(nextConfig));
