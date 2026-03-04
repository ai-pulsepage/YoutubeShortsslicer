import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const isLoginPage = req.nextUrl.pathname === "/login";
    const isApiRoute = req.nextUrl.pathname.startsWith("/api");
    const isPublicRoute = req.nextUrl.pathname === "/" || isLoginPage;

    // Allow API routes and public routes
    if (isApiRoute || isPublicRoute) {
        return NextResponse.next();
    }

    // Redirect to login if not authenticated
    if (!isLoggedIn) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // Redirect from login page if already authenticated
    if (isLoggedIn && isLoginPage) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
};
