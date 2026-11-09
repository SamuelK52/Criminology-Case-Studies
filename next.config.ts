import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The archive opens on the first case file, as in the prototype.
  async redirects() {
    return [{ source: "/", destination: "/cases/01", permanent: false }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
