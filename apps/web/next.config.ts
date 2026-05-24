import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship a self-contained server bundle at .next/standalone/server.js so
  // production deploys can run `node server.js` without `npm install` on the host.
  // See iamhusrev-deploy/CONTRIBUTING.md before changing this.
  output: "standalone",
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
};

export default nextConfig;
