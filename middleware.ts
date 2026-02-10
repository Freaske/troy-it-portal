import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname === "/register") {
    return true;
  }

  if (pathname.startsWith("/api/auth/")) {
    return true;
  }

  return false;
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/public") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
}

function unauthorized(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const nextPath = `${pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

function forbidden(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const redirectUrl = new URL("/", request.url);
  redirectUrl.searchParams.set("denied", "admin");
  return NextResponse.redirect(redirectUrl);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isStaticPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (isPublicPath(pathname)) {
    if ((pathname === "/login" || pathname === "/register") && session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (!session) {
    return unauthorized(request);
  }

  if (isAdminPath(pathname) && session.role !== "ADMIN") {
    return forbidden(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
