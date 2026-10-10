import type { NextConfig } from "next";
import { hasOwnedE2eEnvironment } from './scripts/e2e-environment.mjs';

const nextConfig: NextConfig = {
  ...(hasOwnedE2eEnvironment() ? {
    distDir: `.next/e2e-${process.env.MIMS_E2E_TOKEN}`,
    typescript: { tsconfigPath: `.next/e2e-${process.env.MIMS_E2E_TOKEN}/tsconfig.json` },
  } : {}),
};

export default nextConfig;
