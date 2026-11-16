import type { NextConfig } from "next";

/**
 * Security headers on every response. HTTPS (HSTS) is added by Vercel itself.
 * The CSP only covers framing, plugins, <base> and form targets: a full script policy
 * would need per-request nonces for Next's inline scripts.
 */
export const SECURITY_HEADERS = [
  // Nobody may show JobPilot inside a frame (clickjacking). CSP for modern browsers, XFO for old ones.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must not guess a file's type and run it as a script.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Other sites see only our origin, never page paths or query strings.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs none of these browser features.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // The e2e tests build into a separate folder so they can run while `npm run dev` is up.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Don't advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
