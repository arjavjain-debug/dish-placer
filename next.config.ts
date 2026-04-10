import type { NextConfig } from "next";

const isMobileBuild = process.env.BUILD_TARGET === "mobile";

const nextConfig: NextConfig = {
  // For mobile (Capacitor) builds, export as a static site.
  // The Vercel web deployment leaves this undefined so API routes work.
  ...(isMobileBuild
    ? {
        output: "export",
        distDir: "out",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
