import "./src/env"; // Validate environment variables at build time
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

// --- Security Headers ---
const ContentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} 'unsafe-inline'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.s3.ap-south-1.amazonaws.com",
  "font-src 'self'",
  "connect-src 'self' https://*.s3.ap-south-1.amazonaws.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // standalone output is for Docker/production deployments only.
  // In CI E2E tests, "next start" is incompatible with standalone output.
  output: process.env.CI ? undefined : "standalone",
  serverExternalPackages: ["@react-pdf/renderer", "pg-boss", "exceljs"],
  experimental: {
    turbopackFileSystemCacheForDev: false,
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
