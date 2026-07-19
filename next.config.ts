import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop app's in-app browser reaches local dev servers through this host.
  // This setting applies only to `next dev`; production requests are unaffected.
  allowedDevOrigins: ["192.168.100.13"],
};

export default nextConfig;
