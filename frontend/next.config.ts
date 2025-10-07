import type { NextConfig } from "next";

// Set the backend URL from the environment variable, or use localhost:8000 as default
// This is so we can make requests directly to the FastAPI backend. It also avoids CORS issues, 
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000/";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/backend/:path*", destination: `${BACKEND_URL}/api/:path*` },
    ];
  },
};

export default nextConfig;
