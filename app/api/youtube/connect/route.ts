import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * GET /api/youtube/connect
 * Initiates OAuth flow specifically for YouTube channel access.
 * Requests youtube.readonly + youtube.upload scopes.
 */
export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const callbackBase =
        searchParams.get("origin") ||
        process.env.AUTH_URL ||
        process.env.NEXTAUTH_URL ||
        "http://localhost:3000";

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const redirectUri = `${callbackBase}/api/youtube/callback`;

    const scopes = [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
    ].join(" ");

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        state: session.user.id, // pass userId in state for callback
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return NextResponse.redirect(authUrl);
}
