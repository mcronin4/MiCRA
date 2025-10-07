import type { NextConfig } from "next";

// Read the backend URL from env and normalize by stripping any trailing slash
const rawBackendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const BACKEND_URL = rawBackendUrl.endsWith("/")
  ? rawBackendUrl.slice(0, -1)
  : rawBackendUrl;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/backend/:path*", destination: `${BACKEND_URL}/api/:path*` },
    ];
  },
};

export default nextConfig;
