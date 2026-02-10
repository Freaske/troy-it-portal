import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./data/catalog/**/*", "./data/resources/**/*"],
  },
};

export default nextConfig;
