/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    // 禁用ESLint检查
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
