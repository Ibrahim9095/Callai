/** @type {import('next').NextConfig} */
const API_INTERNAL = process.env.API_INTERNAL_URL || "http://127.0.0.1:4000";

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@aivoiceos/shared"],
  // Allow Cursor Cloud / VM preview hosts to use dev assets.
  allowedDevOrigins: ["*.cursorvm.com", "*.cursor.sh", "*.trycloudflare.com"],
  // Same-origin proxy so the browser only needs the admin (port 3000) URL.
  // The Next server (in the VM) forwards /api/* to the API on localhost:4000.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_INTERNAL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
