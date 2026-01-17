import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mode standalone pour Docker (génère un dossier .next/standalone optimisé)
  output: "standalone",
};

export default nextConfig;
