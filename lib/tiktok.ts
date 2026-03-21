/**
 * TikTok Content Posting API Integration
 *
 * Handles OAuth2 login, video upload, and posting to TikTok.
 * Requires a TikTok Developer account with Content Posting API access.
 *
 * @see https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const TIKTOK_AUTH_BASE = "https://www.tiktok.com";

export interface TikTokTokens {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    open_id: string;
}

export interface TikTokPostResult {
    publish_id: string;
    status: string;
    error?: string;
}

/**
 * Generate the OAuth2 authorization URL for TikTok login
 */
export function getTikTokAuthUrl(redirectUri: string, state: string): string {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) throw new Error("TIKTOK_CLIENT_KEY not configured");

    const scopes = [
        "user.info.basic",
        "video.publish",
        "video.upload",
    ].join(",");

    return `${TIKTOK_AUTH_BASE}/v2/auth/authorize/?client_key=${clientKey}&scope=${scopes}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeTikTokCode(
    code: string,
    redirectUri: string
): Promise<TikTokTokens> {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
        throw new Error("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET required");
    }

    const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`TikTok OAuth error: ${data.error_description || data.error}`);
    }

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        open_id: data.open_id,
    };
}

/**
 * Refresh an expired access token
 */
export async function refreshTikTokToken(
    refreshToken: string
): Promise<TikTokTokens> {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!clientKey || !clientSecret) {
        throw new Error("TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET required");
    }

    const response = await fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`TikTok refresh error: ${data.error_description || data.error}`);
    }

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        open_id: data.open_id,
    };
}

/**
 * Upload and publish a video to TikTok using Direct Post
 *
 * Flow:
 * 1. Initialize upload → get upload URL
 * 2. Upload video file to the URL
 * 3. TikTok processes and publishes
 */
export async function postToTikTok(
    accessToken: string,
    videoBuffer: Buffer,
    options: {
        title?: string;
        description?: string;
        privacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
        disableDuet?: boolean;
        disableStitch?: boolean;
        disableComment?: boolean;
    } = {}
): Promise<TikTokPostResult> {
    const {
        title = "",
        description = "",
        privacyLevel = "PUBLIC_TO_EVERYONE",
        disableDuet = false,
        disableStitch = false,
        disableComment = false,
    } = options;

    // Step 1: Initialize video upload
    const initResponse = await fetch(
        `${TIKTOK_API_BASE}/v2/post/publish/video/init/`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                post_info: {
                    title: title.substring(0, 150), // TikTok max title length
                    description: description.substring(0, 2200),
                    privacy_level: privacyLevel,
                    disable_duet: disableDuet,
                    disable_stitch: disableStitch,
                    disable_comment: disableComment,
                },
                source_info: {
                    source: "FILE_UPLOAD",
                    video_size: videoBuffer.length,
                    chunk_size: videoBuffer.length, // Single chunk for files < 64MB
                    total_chunk_count: 1,
                },
            }),
        }
    );

    const initData = await initResponse.json();
    if (initData.error?.code) {
        throw new Error(
            `TikTok init error: ${initData.error.message || initData.error.code}`
        );
    }

    const uploadUrl = initData.data?.upload_url;
    const publishId = initData.data?.publish_id;

    if (!uploadUrl || !publishId) {
        throw new Error("Failed to get upload URL from TikTok");
    }

    // Step 2: Upload the video file
    const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
            "Content-Type": "video/mp4",
            "Content-Range": `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
        },
        body: new Uint8Array(videoBuffer),
    });

    if (!uploadResponse.ok) {
        throw new Error(`TikTok upload failed: ${uploadResponse.status}`);
    }

    console.log(`[TikTok] Video uploaded, publish_id: ${publishId}`);

    return {
        publish_id: publishId,
        status: "PROCESSING",
    };
}

/**
 * Check the status of a published video
 */
export async function checkTikTokPublishStatus(
    accessToken: string,
    publishId: string
): Promise<{ status: string; video_id?: string; error?: string }> {
    const response = await fetch(
        `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ publish_id: publishId }),
        }
    );

    const data = await response.json();
    if (data.error?.code) {
        return {
            status: "FAILED",
            error: data.error.message || data.error.code,
        };
    }

    return {
        status: data.data?.status || "UNKNOWN",
        video_id: data.data?.publicaly_available_post_id?.[0],
    };
}
