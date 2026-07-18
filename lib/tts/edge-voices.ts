/**
 * Shared Edge TTS voice list.
 * Exported from one place so the animated page and the tts/voices route stay in sync.
 */
export const EDGE_TTS_VOICES_FULL = [
    { id: "en-US-AnaNeural-Female",        label: "Ana (US Child Female)",    gender: "female", locale: "en-US" },
    { id: "en-US-ChristopherNeural-Male",  label: "Christopher (US Child Male)", gender: "male", locale: "en-US" },
    { id: "en-US-AriaNeural-Female",       label: "Aria (US Female)",         gender: "female", locale: "en-US" },
    { id: "en-US-GuyNeural-Male",          label: "Guy (US Male)",            gender: "male",   locale: "en-US" },
    { id: "en-US-JennyNeural-Female",      label: "Jenny (US Female)",        gender: "female", locale: "en-US" },
    { id: "en-US-EricNeural-Male",         label: "Eric (US Male)",           gender: "male",   locale: "en-US" },
    { id: "en-GB-SoniaNeural-Female",      label: "Sonia (UK Female)",        gender: "female", locale: "en-GB" },
    { id: "en-GB-RyanNeural-Male",         label: "Ryan (UK Male)",           gender: "male",   locale: "en-GB" },
    { id: "en-GB-OliverNeural-Male",       label: "Oliver (UK Child Male)",   gender: "male",   locale: "en-GB" },
    { id: "zh-CN-XiaoyiNeural-Female",     label: "Xiaoyi (CN Child Female)", gender: "female", locale: "zh-CN" },
    { id: "zh-CN-XiaoxiaoNeural-Female",   label: "Xiaoxiao (CN Female)",     gender: "female", locale: "zh-CN" },
    { id: "zh-CN-YunxiNeural-Male",        label: "Yunxi (CN Male)",          gender: "male",   locale: "zh-CN" },
] as const;

export type EdgeTtsVoice = typeof EDGE_TTS_VOICES_FULL[number];
