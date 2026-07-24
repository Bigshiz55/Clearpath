/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Growth OS is an internal tool; no external images required in v1.
  images: { remotePatterns: [] },
};

export default nextConfig;
