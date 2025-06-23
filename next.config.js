/** @type {import('next').NextConfig} */
const nextConfig = {
  compiler: {
    swcMinify: false,
  },
  reactStrictMode: true,
  output: 'standalone',
  env: {
    HOSTNAME: '127.0.0.1',
    NEXT_PUBLIC_APP_URL: "http://localhost:3000"
  },
};

module.exports = nextConfig;
