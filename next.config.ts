// Force redeploy with serverless config
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: rootDir,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
