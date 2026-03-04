import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { refreshAllChannelTokens } from "@/lib/youtube";

/**
 * POST /api/channels/refresh
 * Silently refreshes OAuth tokens for all connected channels.
 * Called when user visits the Channels page.
 */
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const results = await refreshAllChannelTokens(session.user.id);
        return NextResponse.json({ results });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
