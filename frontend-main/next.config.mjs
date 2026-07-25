import path from "path";
import { fileURLToPath } from "url";
import createNextIntlPlugin from 'next-intl/plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    externalDir: true,
    // Next 14.2 defaults `dynamic` to 0, so every revisit refetches the RSC
    // payload. 30s makes panel-to-panel back-and-forth instant. Safe for
    // freshness: the router cache holds the payload, not component state, so
    // client pages still remount and re-clientFetch on arrival.
    staleTimes: { dynamic: 30, static: 180 },
  },
  webpack: (config) => {
    // packages/shared has no node_modules ancestor — fall back to this app's.
    config.resolve.modules = [...(config.resolve.modules ?? ["node_modules"]),
      path.resolve(__dirname, "node_modules")];
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
export default withNextIntl(nextConfig);
