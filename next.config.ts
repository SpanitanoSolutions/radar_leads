import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      // /cartera era la subida de la planilla, ahora es "Importar cartera".
      { source: "/cartera", destination: "/importar", permanent: false },
    ];
  },
};

export default nextConfig;
