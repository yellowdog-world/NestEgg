import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static, _next/image (asset files)
     * - favicon.ico, icons/* (PWA assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|icons).*)",
  ],
};
