import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MDX 페이지는 next-mdx-remote/rsc로 동적 처리 (app/wiki/[...slug]/page.tsx).
  // @next/mdx는 Turbopack과 직렬화 호환 이슈가 있어 사용하지 않음.
  allowedDevOrigins: ["192.168.55.222"],
};

export default nextConfig;
