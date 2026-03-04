import { DollarSign } from "lucide-react";

export default function WhopPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Whop Monetization</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Browse Content Rewards campaigns and track your earnings
                </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                <DollarSign className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Connect Whop</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Browse available Content Rewards campaigns, match your shorts to campaigns,
                    and track earnings — all powered by the Whop API.
                </p>
            </div>
        </div>
    );
}
