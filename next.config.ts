import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: `next build` emits a self-contained `out/` directory that
  // any static host can serve. The graph is a client-rendered view over three
  // committed JSON files, so there is nothing for a server to do — and no
  // server means no server-side attack surface.
  output: "export",

  // No runtime image optimisation is available in an export. The site ships
  // no raster images, but this keeps the build honest if one is ever added.
  images: { unoptimized: true },
};

export default nextConfig;
