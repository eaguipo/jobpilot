import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e tests build into a separate folder so they can run while `npm run dev` is up.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
