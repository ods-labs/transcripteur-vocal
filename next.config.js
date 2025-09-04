/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuration pour AWS Amplify
  trailingSlash: true,
  images: {
    unoptimized: true
  }
}

module.exports = nextConfig