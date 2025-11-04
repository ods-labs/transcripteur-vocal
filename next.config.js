/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  // Pas de caching offline - service worker utilisé pour installation seulement
  runtimeCaching: [],
  buildExcludes: [
    /chunks\/.*$/,
  ],
})

const nextConfig = {
  // Configuration pour PWA
}

module.exports = withPWA(nextConfig)