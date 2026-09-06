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
