/**
 * YouTube Service — Token Refresh + Video Upload + Shorts Metadata
 *
 * Handles:
 * 1. Silent OAuth token refresh (no user interaction needed)
 * 2. YouTube Data API video upload (videos.insert)
 * 3. Auto-tagging with #Shorts metadata
 */
import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YT_UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos";
const YT_API_URL = "https://www.googleapis.com/youtube/v3";

// ─── Token Refresh ───────────────────────────────

export interface TokenRefreshResult {
    accessToken: string;
    expiresAt: Date;
    refreshed: boolean;
}

/**
 * Ensures a channel has a valid (non-expired) access token.
 * If expired, silently refreshes using the refresh token.
 * Returns the valid access token.
 */
export async function ensureValidToken(channelId: string): Promise<TokenRefreshResult> {
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { accessToken: true, refreshToken: true, tokenExpiry: true },
    });

    if (!channel) throw new Error(`Channel ${channelId} not found`);
    if (!channel.accessToken) throw new Error("Channel has no access token. Re-connect the channel.");

    // Check if token is still valid (5 min buffer)
    const now = new Date();
    const bufferMs = 5 * 60 * 1000;
    const isExpired = !channel.tokenExpiry || channel.tokenExpiry.getTime() - bufferMs < now.getTime();

    if (!isExpired) {
        return {
            accessToken: channel.accessToken,
            expiresAt: channel.tokenExpiry!,
            refreshed: false,
        };
    }

    // Token expired — refresh it
    if (!channel.refreshToken) {
        throw new Error("Token expired and no refresh token available. Re-connect the channel.");
    }

    console.log(`[YouTube] Refreshing token for channel ${channelId}...`);

    const res = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: channel.refreshToken,
            grant_type: "refresh_token",
        }),
    });

    const data = await res.json();

    if (!data.access_token) {
        console.error("[YouTube] Token refresh failed:", data);
        throw new Error(`Token refresh failed: ${data.error_description || data.error || "Unknown error"}. Re-connect the channel.`);
    }

    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    // Update token in DB
    await prisma.channel.update({
        where: { id: channelId },
        data: {
            accessToken: data.access_token,
            tokenExpiry: expiresAt,
        },
    });

    console.log(`[YouTube] Token refreshed, expires at ${expiresAt.toISOString()}`);

    return {
        accessToken: data.access_token,
        expiresAt,
        refreshed: true,
    };
}

/**
 * Refresh tokens for ALL channels of a user.
 * Returns a summary of results per channel.
 */
export async function refreshAllChannelTokens(userId: string) {
    const channels = await prisma.channel.findMany({
        where: { userId, isActive: true },
        select: { id: true, channelName: true },
    });

    const results = [];

    for (const ch of channels) {
        try {
            const result = await ensureValidToken(ch.id);
            results.push({
                channelId: ch.id,
                channelName: ch.channelName,
                status: "ok",
                refreshed: result.refreshed,
                expiresAt: result.expiresAt,
            });
        } catch (err: any) {
            results.push({
                channelId: ch.id,
                channelName: ch.channelName,
                status: "error",
                error: err.message,
            });
        }
    }

    return results;
}

// ─── Shorts Metadata ─────────────────────────────

/**
 * Formats title and description for YouTube Shorts.
 * - Ensures #Shorts is in the title (required by YouTube)
 * - Adds hashtags to description
 * - Keeps title under 100 chars
 */
export function formatShortsMetadata(
    title: string,
    description?: string | null,
    hashtags?: string[]
): { title: string; description: string } {
    // Ensure #Shorts is in the title
    let shortsTitle = title.trim();
    if (!shortsTitle.toLowerCase().includes("#shorts")) {
        // Keep title short — YouTube has 100 char limit
        if (shortsTitle.length > 85) {
            shortsTitle = shortsTitle.substring(0, 85) + "...";
        }
        shortsTitle += " #Shorts";
    }

    // Build description
    let shortsDesc = (description || "").trim();

    // Add hashtags
    const allTags = new Set<string>();
    allTags.add("#Shorts");
    if (hashtags) {
        for (const tag of hashtags) {
            const formatted = tag.startsWith("#") ? tag : `#${tag}`;
            allTags.add(formatted);
        }
    }

    const tagLine = Array.from(allTags).join(" ");

    if (shortsDesc) {
        shortsDesc += `\n\n${tagLine}`;
    } else {
        shortsDesc = tagLine;
    }

    return { title: shortsTitle, description: shortsDesc };
}

// ─── YouTube Upload ──────────────────────────────

export interface UploadResult {
    videoId: string;
    url: string;
    status: string;
}

export interface UploadError {
    code: string;
    message: string;
    suggestion: string;
}

/**
 * Upload a video to YouTube as a Short.
 *
 * @param channelId - Our DB channel ID (to get the access token)
 * @param videoBuffer - The rendered short video as a Buffer
 * @param title - Video title
 * @param description - Video description
 * @param hashtags - Optional hashtags array
 * @param privacyStatus - "public" | "private" | "unlisted"
 */
export async function uploadToYouTube(
    channelId: string,
    videoBuffer: Buffer,
    title: string,
    description?: string | null,
    hashtags?: string[],
    privacyStatus: "public" | "private" | "unlisted" = "public"
): Promise<UploadResult> {
    // Step 1: Ensure valid token
    const { accessToken } = await ensureValidToken(channelId);

    // Step 2: Format Shorts metadata
    const meta = formatShortsMetadata(title, description, hashtags);

    // Step 3: Build upload metadata
    const metadata = {
        snippet: {
            title: meta.title,
            description: meta.description,
            categoryId: "22", // People & Blogs (default, can be overridden)
        },
        status: {
            privacyStatus,
            selfDeclaredMadeForKids: false,
        },
    };

    // Step 4: Resumable upload — initiate
    const initRes = await fetch(
        `${YT_UPLOAD_URL}?uploadType=resumable&part=snippet,status`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "video/mp4",
                "X-Upload-Content-Length": videoBuffer.length.toString(),
            },
            body: JSON.stringify(metadata),
        }
    );

    if (!initRes.ok) {
        const errorBody = await initRes.json().catch(() => ({}));
        throw formatUploadError(initRes.status, errorBody);
    }

    const uploadUrl = initRes.headers.get("Location");
    if (!uploadUrl) {
        throw new Error("YouTube did not return an upload URL");
    }

    // Step 5: Upload the video bytes
    const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": "video/mp4",
            "Content-Length": videoBuffer.length.toString(),
        },
        body: new Uint8Array(videoBuffer),
    });

    if (!uploadRes.ok) {
        const errorBody = await uploadRes.json().catch(() => ({}));
        throw formatUploadError(uploadRes.status, errorBody);
    }

    const result = await uploadRes.json();

    return {
        videoId: result.id,
        url: `https://youtube.com/shorts/${result.id}`,
        status: result.status?.uploadStatus || "uploaded",
    };
}

/**
 * Format YouTube API errors into user-friendly messages.
 */
function formatUploadError(status: number, body: any): Error {
    const reason = body?.error?.errors?.[0]?.reason || "";
    const message = body?.error?.message || "Unknown YouTube API error";

    const suggestions: Record<string, string> = {
        unauthorized: "Your YouTube token has expired. Go to Channels and re-connect.",
        forbidden: "You don't have permission to upload to this channel. Check the channel connection.",
        quotaExceeded: "YouTube API quota exceeded. Try again tomorrow or request a quota increase.",
        rateLimitExceeded: "Too many uploads in a short time. Wait a few minutes and retry.",
        videoLengthExceeded: "Video is too long for a Short. Keep it under 60 seconds.",
        uploadLimitExceeded: "You've hit your daily YouTube upload limit. Try again tomorrow.",
        notFound: "Channel not found on YouTube. It may have been deleted.",
        badRequest: "Invalid video format or metadata. Check the video file and title.",
    };

    const suggestion = suggestions[reason] || `YouTube error (${status}): ${message}`;

    const err = new Error(suggestion);
    (err as any).code = reason || `http_${status}`;
    (err as any).youtubeMessage = message;
    (err as any).suggestion = suggestion;
    return err;
}

/**
 * Get channel info from YouTube to verify connection.
 */
export async function getYouTubeChannelInfo(channelId: string) {
    const { accessToken } = await ensureValidToken(channelId);

    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { channelId: true },
    });

    const res = await fetch(
        `${YT_API_URL}/channels?part=snippet,statistics&id=${channel?.channelId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const data = await res.json();
    return data.items?.[0] || null;
}
