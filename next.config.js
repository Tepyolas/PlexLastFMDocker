/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    swcMinify: false,
  },
  reactStrictMode: true,
  output: 'standalone',
};

module.exports = nextConfig;
