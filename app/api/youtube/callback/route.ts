import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/youtube/callback
 * Handles the OAuth callback from Google after the user grants YouTube access.
 * Exchanges the auth code for tokens, fetches channels, saves them to DB.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const userId = searchParams.get("state");
    const error = searchParams.get("error");

    if (error || !code || !userId) {
        const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
        return NextResponse.redirect(`${base}/dashboard/channels?error=${error || "missing_code"}`);
    }

    const base = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
    const redirectUri = `${base}/api/youtube/callback`;

    try {
        // Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID!,
                client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
            }),
        });

        const tokens = await tokenRes.json();
        if (!tokens.access_token) {
            console.error("[YouTube Callback] Token exchange failed:", tokens);
            return NextResponse.redirect(`${base}/dashboard/channels?error=token_failed`);
        }

        // Fetch user's YouTube channels
        const ytRes = await fetch(
            "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
            {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            }
        );

        const ytData = await ytRes.json();
        const ytChannels = ytData.items || [];

        if (ytChannels.length === 0) {
            return NextResponse.redirect(`${base}/dashboard/channels?error=no_channels`);
        }

        // Save all channels to DB (upsert to avoid duplicates)
        for (const ch of ytChannels) {
            await prisma.channel.upsert({
                where: {
                    // Use a composite-like lookup: find by userId + channelId
                    id: await getExistingChannelId(userId, ch.id) || "new-" + ch.id,
                },
                create: {
                    userId,
                    platform: "YOUTUBE",
                    channelName: ch.snippet.title,
                    channelId: ch.id,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || null,
                    tokenExpiry: tokens.expires_in
                        ? new Date(Date.now() + tokens.expires_in * 1000)
                        : null,
                    isActive: true,
                    defaults: {
                        thumbnail: ch.snippet.thumbnails?.default?.url || null,
                        subscriberCount: ch.statistics?.subscriberCount || "0",
                        videoCount: ch.statistics?.videoCount || "0",
                        description: ch.snippet.description || "",
                    },
                },
                update: {
                    channelName: ch.snippet.title,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token || undefined,
                    tokenExpiry: tokens.expires_in
                        ? new Date(Date.now() + tokens.expires_in * 1000)
                        : undefined,
                    isActive: true,
                    defaults: {
                        thumbnail: ch.snippet.thumbnails?.default?.url || null,
                        subscriberCount: ch.statistics?.subscriberCount || "0",
                        videoCount: ch.statistics?.videoCount || "0",
                        description: ch.snippet.description || "",
                    },
                },
            });
        }

        const count = ytChannels.length;
        return NextResponse.redirect(
            `${base}/dashboard/channels?connected=${count}`
        );
    } catch (err: any) {
        console.error("[YouTube Callback] Error:", err.message);
        return NextResponse.redirect(`${base}/dashboard/channels?error=server_error`);
    }
}

/**
 * Helper: find existing channel ID by userId + YouTube channelId
 */
async function getExistingChannelId(
    userId: string,
    ytChannelId: string
): Promise<string | null> {
    const existing = await prisma.channel.findFirst({
        where: { userId, channelId: ytChannelId },
        select: { id: true },
    });
    return existing?.id || null;
}
