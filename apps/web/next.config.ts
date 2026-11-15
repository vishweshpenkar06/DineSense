import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@dinesense/core", "@dinesense/db"],
  serverExternalPackages: ["@prisma/client", "pg", "exceljs"],
  poweredByHeader: false,
};

export default nextConfig;
