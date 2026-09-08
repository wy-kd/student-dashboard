import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';

// Allow this computer's actual LAN addresses for the development WebSocket.
// Avoid wildcards that would admit arbitrary websites.
let lanAddresses: string[] = [];
try {
  lanAddresses = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((info) => info.family === 'IPv4' && !info.internal)
    .map((info) => info.address);
} catch {
  // Restricted build containers may not expose network interfaces.
  // Production requests do not use the development-origin allowlist.
}

const config: NextConfig = {
  poweredByHeader: false,
  // A cached build reproduced stale global CSS after source edits (V2.1.1).
  // Compile current sources on updates; production startup still uses the saved build.
  experimental: { turbopackFileSystemCacheForBuild: false },
  allowedDevOrigins: ['terminal.local', ...lanAddresses],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
