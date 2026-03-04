import { Film } from "lucide-react";

export default function RenderPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                <Film className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Render Queue</h1>
            <p className="text-gray-400 text-sm max-w-md">
                Your FFmpeg render jobs will appear here. Approved segments will be
                processed into final short-form videos with subtitles.
            </p>
        </div>
    );
}
