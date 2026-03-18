/** @type {import('next').NextConfig} */
const BASE_DOMAIN = process.env.NEXT_PUBLIC_BASE_DOMAIN || "contentor.localhost";

const nextConfig = {
  output: "standalone",
  allowedDevOrigins: [`*.${BASE_DOMAIN}`],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
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

export default nextConfig;
