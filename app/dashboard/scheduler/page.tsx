import { Calendar } from "lucide-react";

export default function SchedulerPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white">Content Scheduler</h1>
                <p className="text-gray-400 text-sm mt-1">
                    Plan and automate your posting calendar across all channels
                </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-12 text-center">
                <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Schedule Coming Soon</h3>
                <p className="text-gray-400 text-sm max-w-md mx-auto">
                    The content calendar with drag-and-drop scheduling, batch posting,
                    and auto-publish will be available after rendering is set up.
                </p>
            </div>
        </div>
    );
}
