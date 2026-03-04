import { Mic } from "lucide-react";

export default function VoiceoverPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Mic className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Voiceover Studio</h1>
            <p className="text-gray-400 text-sm max-w-md">
                Add AI-generated voiceover narration to your segments using Kokoro TTS.
                Toggle per-segment, choose voices, and adjust mix levels.
            </p>
        </div>
    );
}
