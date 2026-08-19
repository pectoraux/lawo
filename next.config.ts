import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Note: 'standalone' is great for Docker but unnecessary on Vercel.
  // Vercel's Next.js builder handles output internally; leaving this on
  // does not break Vercel builds.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Prisma generates binaries at build time; mark @prisma/client as external
  // for serverless bundling on Vercel.
  serverExternalPackages: ["@prisma/client", "@node-rs/argon2", "bcryptjs"],
};

export default nextConfig;
