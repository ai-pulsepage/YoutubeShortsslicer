import { Type } from "lucide-react";

export default function StylePage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                <Type className="w-8 h-8 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Subtitle Styles</h1>
            <p className="text-gray-400 text-sm max-w-md">
                Customize fonts, colors, sizes, and positions for your subtitles.
                Create and save presets for quick reuse.
            </p>
        </div>
    );
}
