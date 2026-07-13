import path from "path";
import { fileURLToPath } from "url";
import createNextIntlPlugin from 'next-intl/plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: { externalDir: true },
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
