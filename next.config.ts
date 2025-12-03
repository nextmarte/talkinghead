import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Otimizações para produção
  },
};

export default nextConfig;
