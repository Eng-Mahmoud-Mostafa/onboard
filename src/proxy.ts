import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasSession = request.cookies.has("onboard_session");

  if (!hasSession && ["/dashboard", "/leads", "/clients", "/packages", "/bookings", "/payments", "/tasks", "/reports", "/admin", "/settings"].some((path) => pathname.startsWith(path))) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/leads/:path*", "/clients/:path*", "/packages/:path*", "/bookings/:path*", "/payments/:path*", "/tasks/:path*", "/reports/:path*", "/admin/:path*", "/settings/:path*"],
};
