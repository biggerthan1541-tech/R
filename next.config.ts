import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads font metrics off disk at runtime; bundling breaks that.
  serverExternalPackages: ["pdfkit"],
  // The register PDF embeds Archivo, so the .ttf files have to ship with the
  // export route's serverless function.
  outputFileTracingIncludes: {
    "/w/[slug]/export/pdf": ["./src/lib/fonts/**"],
  },
};

export default nextConfig;
