/**
 * Instagram Content Publishing API Integration
 *
 * Uses the Instagram Graph API to publish Reels.
 * Requires a Facebook/Meta Developer account with Instagram API access.
 *
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
 */

const INSTAGRAM_API_BASE = "https://graph.instagram.com";
const FB_AUTH_BASE = "https://www.instagram.com";

export interface InstagramTokens {
    access_token: string;
    user_id: string;
    expires_in?: number;
}

/**
 * Generate Instagram OAuth URL
 * Uses Instagram Basic Display API for login
 */
export function getInstagramAuthUrl(redirectUri: string, state: string): string {
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    if (!clientId) throw new Error("INSTAGRAM_CLIENT_ID not configured");

    const scopes = [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_comments",
    ].join(",");

    return `${FB_AUTH_BASE}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeInstagramCode(
    code: string,
    redirectUri: string
): Promise<InstagramTokens> {
    const clientId = process.env.INSTAGRAM_CLIENT_ID;
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error("INSTAGRAM_CLIENT_ID and INSTAGRAM_CLIENT_SECRET required");
    }

    // Short-lived token exchange
    const response = await fetch("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            code,
        }),
    });

    const data = await response.json();
    if (data.error_message) {
        throw new Error(`Instagram OAuth error: ${data.error_message}`);
    }

    // Exchange for long-lived token (60 days)
    const longLivedResponse = await fetch(
        `${INSTAGRAM_API_BASE}/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${data.access_token}`
    );

    const longLivedData = await longLivedResponse.json();

    return {
        access_token: longLivedData.access_token || data.access_token,
        user_id: data.user_id?.toString(),
        expires_in: longLivedData.expires_in,
    };
}

/**
 * Refresh a long-lived Instagram token
 */
export async function refreshInstagramToken(
    accessToken: string
): Promise<InstagramTokens> {
    const response = await fetch(
        `${INSTAGRAM_API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`
    );

    const data = await response.json();
    if (data.error) {
        throw new Error(`Instagram refresh error: ${data.error.message}`);
    }

    return {
        access_token: data.access_token,
        user_id: "", // not returned on refresh
        expires_in: data.expires_in,
    };
}

/**
 * Publish a Reel to Instagram
 *
 * Flow:
 * 1. Create media container with video URL
 * 2. Wait for processing
 * 3. Publish the container
 *
 * Note: Instagram requires the video to be hosted at a public URL.
 * We use R2 signed URLs for this.
 */
export async function postReelToInstagram(
    accessToken: string,
    userId: string,
    videoUrl: string,  // Must be a publicly accessible URL
    options: {
        caption?: string;
        coverUrl?: string;
        shareToFeed?: boolean;
    } = {}
): Promise<{ creation_id: string; status: string }> {
    const { caption = "", shareToFeed = true } = options;

    // Step 1: Create media container
    const createResponse = await fetch(
        `${INSTAGRAM_API_BASE}/v21.0/${userId}/media`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                media_type: "REELS",
                video_url: videoUrl,
                caption: caption.substring(0, 2200),
                share_to_feed: shareToFeed,
                access_token: accessToken,
            }),
        }
    );

    const createData = await createResponse.json();
    if (createData.error) {
        throw new Error(
            `Instagram create error: ${createData.error.message}`
        );
    }

    const creationId = createData.id;
    if (!creationId) {
        throw new Error("Failed to create Instagram media container");
    }

    // Step 2: Poll for processing completion
    let status = "IN_PROGRESS";
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes max

    while (status === "IN_PROGRESS" && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 10000)); // Wait 10s
        attempts++;

        const statusResponse = await fetch(
            `${INSTAGRAM_API_BASE}/v21.0/${creationId}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusResponse.json();
        status = statusData.status_code || "UNKNOWN";

        console.log(`[Instagram] Processing: attempt ${attempts}/${maxAttempts}, status: ${status}`);
    }

    if (status !== "FINISHED") {
        throw new Error(`Instagram processing failed: ${status}`);
    }

    // Step 3: Publish
    const publishResponse = await fetch(
        `${INSTAGRAM_API_BASE}/v21.0/${userId}/media_publish`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken,
            }),
        }
    );

    const publishData = await publishResponse.json();
    if (publishData.error) {
        throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    console.log(`[Instagram] Reel published: ${publishData.id}`);

    return {
        creation_id: publishData.id,
        status: "PUBLISHED",
    };
}

/**
 * Get basic info about the connected Instagram account
 */
export async function getInstagramProfile(
    accessToken: string
): Promise<{ username: string; account_type: string; media_count: number }> {
    const response = await fetch(
        `${INSTAGRAM_API_BASE}/me?fields=username,account_type,media_count&access_token=${accessToken}`
    );

    const data = await response.json();
    if (data.error) {
        throw new Error(`Instagram profile error: ${data.error.message}`);
    }

    return data;
}
