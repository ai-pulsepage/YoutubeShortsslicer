import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Analytics</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Track performance across all your published content
                </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No Data Yet</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                    Analytics will populate once you start publishing shorts.
                    Track views, engagement, revenue, and per-channel performance.
                </p>
            </div>
        </div>
    );
}
