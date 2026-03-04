"use client";

import { Share2, Plus, Youtube } from "lucide-react";

export default function ChannelsPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">Channels</h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Connect and manage your YouTube and Instagram channels
                    </p>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors opacity-50 cursor-not-allowed">
                    <Plus className="w-4 h-4" />
                    Connect Channel
                </button>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                <Share2 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No channels connected</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Connect your YouTube and Instagram channels to enable direct publishing.
                    Google OAuth will prompt for upload permissions.
                </p>
            </div>
        </div>
    );
}
