import { Scissors } from "lucide-react";

export default function EditorPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Scissors className="w-8 h-8 text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Segment Editor</h1>
            <p className="text-gray-400 text-sm max-w-md">
                Select a video from your library to start editing segments.
                The waveform timeline, drag handles, and preview will appear here.
            </p>
            <a
                href="/dashboard/library"
                className="mt-6 px-5 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
                Open Library
            </a>
        </div>
    );
}
