/**
 * Genre Presets — Documentary Production Profiles
 *
 * Each genre + sub-style maps to:
 *   1. A prompt block injected into the script writer
 *   2. Smart defaults for all pipeline settings
 *   3. Image style modifiers for genre-appropriate AI image generation
 *
 * The LLM has strong training data for each of these styles,
 * so the prompt blocks produce consistent, genre-appropriate output.
 */

// ─── Types ──────────────────────────────────────────────

export type GenreId =
    | "science"
    | "true_crime"
    | "horror"
    | "history"
    | "children"
    | "sleep"
    | "comedy"
    | "nature"
    | "romance_telenovela"
    | "anthropomorphic_animal"
    | "kung_fu_classics"
    | "dystopian_scifi";

export type VisualMode = "full_ai_video" | "chapter_illustrations" | "broll_only" | "narration_only";
export type ImageModel = "chroma" | "flux" | "juggernaut";

export interface SubStyleDef {
    id: string;
    label: string;
    promptBlock: string;      // Injected into the script writer system prompt
    defaults: SmartDefaults;
}

export interface GenreDef {
    id: GenreId;
    label: string;
    icon: string;             // Emoji for UI
    description: string;
    imageStyle: string;       // Genre-level image prompt modifier
    subStyles: SubStyleDef[];
}

export interface SmartDefaults {
    narratorStyle: string;    // sleep | documentary | dramatic | energetic | conversational
    musicMood: string;        // classical | ambient | dark_ambient | whimsical | epic | none
    useBRoll: boolean;
    useKenBurns: boolean;
    visualMode: VisualMode;
    imageModel: ImageModel;
    pacing: string;           // slow | standard | fast
    audience: string;         // adults | young_adults | kids | toddlers | expert
    perspective: string;      // omniscient | first_person | second_person | investigator
    ending: string;           // ai_decide | hopeful | tragic | cliffhanger | reflective | circular | call_to_action
    contentMode: string;      // factual | creative
}

// ─── Visual Mode Options ───────────────────────────────

export const VISUAL_MODE_OPTIONS = [
    { id: "full_ai_video", label: "Full AI Video", icon: "🎬", description: "Generate reference images + AI video clips via RunPod (GPU-heavy)" },
    { id: "chapter_illustrations", label: "Chapter Illustrations", icon: "🖼️", description: "AI-generated key images (Ken Burns) + Pexels B-Roll between chapters" },
    { id: "broll_only", label: "B-Roll Only", icon: "📹", description: "Pexels stock footage only — no AI image generation" },
    { id: "narration_only", label: "Narration Only", icon: "🎙️", description: "Audio narration only — podcast/audiobook output" },
] as const;

// ─── Image Model Options ───────────────────────────────

export const IMAGE_MODEL_OPTIONS = [
    { id: "chroma", label: "Chroma FP16 (Uncensored)", description: "Best for horror, mature, and unrestricted content. Apache 2.0, 8.9B params." },
    { id: "flux", label: "Flux (Standard)", description: "Fast, safe-content generation. Great for education, children's, nature." },
    { id: "juggernaut", label: "Juggernaut XL (Photorealistic)", description: "Best skin tones and photorealism. Great for true crime, biography, documentary." },
] as const;

// ─── Audience Presets ───────────────────────────────────

export const AUDIENCE_OPTIONS = [
    { id: "adults", label: "Adults (General)", promptBlock: "Write for an adult audience with standard vocabulary and nuanced ideas." },
    { id: "young_adults", label: "Young Adults (16-25)", promptBlock: "Write for young adults. Use vivid language, pop-culture-aware references, and a slightly faster narrative pace." },
    { id: "kids", label: "Kids (8-12)", promptBlock: "Write for children aged 8-12. Use analogies, comparisons to everyday life, and 'imagine if...' moments. Explain complex ideas simply without being patronizing." },
    { id: "toddlers", label: "Toddlers (3-6)", promptBlock: "Write for very young children. Use very short sentences, gentle repetition, rhyming where natural, and a warm soothing tone. Every concept should be grounded in things a small child can see and touch." },
    { id: "expert", label: "Expert / Academic", promptBlock: "Write for a knowledgeable audience. Preserve technical terminology, reference specific studies and methods, and do not oversimplify. Assume the listener has advanced education in the topic." },
] as const;

// ─── Perspective Presets ────────────────────────────────

export const PERSPECTIVE_OPTIONS = [
    { id: "omniscient", label: "Omniscient Narrator", promptBlock: "Use a third-person omniscient narrator who observes events from above, sees all perspectives, and provides context the characters cannot." },
    { id: "first_person", label: "First Person", promptBlock: "Write in first person. The narrator is a participant or witness. Use 'I saw...', 'I remember...', 'What I found next...'. Create intimacy and subjectivity." },
    { id: "second_person", label: "Second Person", promptBlock: "Write in second person. Address the listener directly: 'You open the door. You feel the cold air. You notice...' Create an immersive, guided experience." },
    { id: "investigator", label: "Investigator", promptBlock: "The narrator is an investigator piecing together evidence. Use 'What we discovered...', 'The evidence suggests...', 'But here's where the story takes a turn...' Build suspense through discovery." },
] as const;

// ─── Pacing Presets ─────────────────────────────────────

export const PACING_OPTIONS = [
    { id: "slow", label: "Slow & Contemplative", wpm: 100, promptBlock: "Use a slow, contemplative pace. Leave space between ideas. Let descriptions breathe. Use longer, flowing sentences with natural pauses." },
    { id: "standard", label: "Standard", wpm: 150, promptBlock: "Use a measured, standard documentary pace — clear and engaging without rushing." },
    { id: "fast", label: "Fast & Punchy", wpm: 180, promptBlock: "Use a fast, punchy pace. Short sentences. Quick cuts between ideas. Dense with information but never confusing. Think Kurzgesagt or Vox." },
] as const;

// ─── Ending Presets ─────────────────────────────────────

export const ENDING_OPTIONS = [
    { id: "ai_decide", label: "Let AI Decide", promptBlock: "" },
    { id: "hopeful", label: "Hopeful / Uplifting", promptBlock: "End the story on a note of hope and optimism. Leave the listener feeling inspired and uplifted about the future." },
    { id: "tragic", label: "Tragic / Somber", promptBlock: "End on a somber note. Reflect on what was lost, what could have been, or the weight of the events described. Let the sadness resonate." },
    { id: "cliffhanger", label: "Cliffhanger", promptBlock: "End with an unanswered question or unresolved mystery that haunts the listener. Make them want more." },
    { id: "reflective", label: "Reflective / Philosophical", promptBlock: "End with a broader philosophical question about humanity, existence, or our place in the universe. Make the listener think long after it ends." },
    { id: "circular", label: "Circular", promptBlock: "Return to the opening image or idea at the end, but show how the journey has changed its meaning. Create a satisfying full-circle moment." },
    { id: "call_to_action", label: "Call to Action", promptBlock: "End by challenging the listener to act, change, or think differently. Make the story personal to them." },
] as const;

// ─── Content Mode ───────────────────────────────────────

export const CONTENT_MODE_OPTIONS = [
    { id: "factual", label: "Factual Only", promptBlock: "Stick strictly to verified facts, data, and sources. Do not embellish, speculate, or invent dialogue. If something is uncertain, say so explicitly." },
    { id: "creative", label: "Creative Liberty", promptBlock: "You may embellish for dramatic effect, create illustrative scenarios, imagine dialogue, and use creative license to make the story more vivid and engaging." },
] as const;

// ─── Music Mood Options ─────────────────────────────────

export const MUSIC_MOOD_OPTIONS = [
    { id: "classical", label: "Classical / Orchestral" },
    { id: "ambient", label: "Ambient / Atmospheric" },
    { id: "dark_ambient", label: "Dark Ambient" },
    { id: "whimsical", label: "Whimsical / Playful" },
    { id: "epic", label: "Epic / Cinematic" },
    { id: "piano", label: "Gentle Piano" },
    { id: "electronic", label: "Electronic / Synth" },
    { id: "none", label: "No Music" },
] as const;

// ─── Genre Definitions ─────────────────────────────────

export const GENRES: GenreDef[] = [
    // ── Science & Education ─────────────────────────────
    {
        id: "science",
        label: "Science & Education",
        icon: "🔬",
        description: "Explain complex topics with wonder and clarity",
        imageStyle: "Clean scientific illustration, neutral lighting, educational diagram aesthetic, sharp focus, white or neutral backgrounds, infographic quality, stock photography feel.",
        subStyles: [
            {
                id: "bbc_earth",
                label: "BBC Earth",
                promptBlock: "You are narrating a BBC Earth-style science documentary. Speak with warm, quiet reverence for the natural world. Build genuine wonder through patient observation. Use rich, sensory language — describe what the viewer smells, hears, feels. Let the science emerge naturally from the storytelling, never lecture.",
                defaults: { narratorStyle: "documentary", musicMood: "classical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "cosmos",
                label: "Cosmos (Carl Sagan)",
                promptBlock: "You are narrating in the style of Carl Sagan's Cosmos. Speak with awe about the universe's vastness. Use poetic metaphors — 'We are star stuff.' Connect cosmic scales to human experience. Make the listener feel small yet significant. Every fact should trigger existential wonder.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "kurzgesagt",
                label: "Kurzgesagt",
                promptBlock: "You are narrating a Kurzgesagt-style explainer. Be direct, clear, and information-dense but never boring. Use vivid analogies to make abstract concepts concrete. Include occasional dark humor about existential threats. Keep a slightly detached, matter-of-fact delivery that makes terrifying concepts oddly comforting.",
                defaults: { narratorStyle: "conversational", musicMood: "electronic", useBRoll: true, useKenBurns: false, visualMode: "broll_only", imageModel: "flux", pacing: "fast", audience: "young_adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual" },
            },
            {
                id: "ted_talk",
                label: "TED Talk",
                promptBlock: "You are delivering a TED Talk-style presentation. Start with a surprising personal anecdote or counterintuitive fact. Build an argument step by step. Use 'And here's the thing...' moments of revelation. End with a call to rethink assumptions. Be conversational but authoritative.",
                defaults: { narratorStyle: "conversational", musicMood: "none", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "first_person", ending: "call_to_action", contentMode: "factual" },
            },
            {
                id: "bill_nye",
                label: "Bill Nye / Magic School Bus",
                promptBlock: "You are an enthusiastic science educator like Bill Nye. Use exciting demonstrations and 'Consider the following!' moments. Make science feel like an adventure. Use humor, enthusiasm, and hands-on analogies. Every concept should make the listener think 'That's so cool!'",
                defaults: { narratorStyle: "energetic", musicMood: "whimsical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "fast", audience: "kids", perspective: "omniscient", ending: "hopeful", contentMode: "factual" },
            },
            {
                id: "academic",
                label: "Academic Lecture",
                promptBlock: "You are delivering a university-level lecture. Present findings methodically with proper attribution. Discuss methodology, limitations, and implications. Reference competing theories. Use precise academic language but remain engaging. This is peer-level discourse, not popularization.",
                defaults: { narratorStyle: "documentary", musicMood: "none", useBRoll: false, useKenBurns: true, visualMode: "narration_only", imageModel: "flux", pacing: "standard", audience: "expert", perspective: "omniscient", ending: "ai_decide", contentMode: "factual" },
            },
        ],
    },

    // ── True Crime / Mystery ────────────────────────────
    {
        id: "true_crime",
        label: "True Crime / Mystery",
        icon: "🔍",
        description: "Suspenseful investigations and unsolved cases",
        imageStyle: "Forensic evidence photography, cold clinical lighting, desaturated blue-grey tones, police evidence markers, documentary photography, neutral clinical tone, case file aesthetic.",
        subStyles: [
            {
                id: "serial",
                label: "Serial (Podcast)",
                promptBlock: "You are narrating a Serial-style true crime investigation. Build the case piece by piece. Question your own assumptions aloud. Use 'But here's what doesn't add up...' and 'When I spoke to...' framing. Create doubt and intrigue. Never rush to conclusions.",
                defaults: { narratorStyle: "conversational", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "investigator", ending: "cliffhanger", contentMode: "factual" },
            },
            {
                id: "forensic_files",
                label: "Forensic Files",
                promptBlock: "You are narrating a Forensic Files episode. Focus on the physical evidence — fibers, blood spatter, chemical analysis. Be clinical and precise. Let the science solve the crime. Use a steady, authoritative tone that slowly builds the case to an inevitable conclusion.",
                defaults: { narratorStyle: "documentary", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual" },
            },
            {
                id: "unsolved_mysteries",
                label: "Unsolved Mysteries",
                promptBlock: "You are narrating an Unsolved Mysteries-style episode. Build atmospheric dread. Present the known facts, then linger on what remains unexplained. Use phrases like 'To this day, no one knows...' and 'The case remains open.' Leave the listener genuinely unsettled.",
                defaults: { narratorStyle: "dramatic", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "factual" },
            },
            {
                id: "making_murderer",
                label: "Making a Murderer",
                promptBlock: "You are narrating a deep-dive investigative documentary. Question the justice system. Present both sides but let contradictions speak for themselves. Use court transcripts, timeline discrepancies, and witness inconsistencies to build tension. The listener should question everything.",
                defaults: { narratorStyle: "documentary", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "investigator", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "cold_case",
                label: "Cold Case Files",
                promptBlock: "You are reopening a cold case. Start with the original incident, then jump to years later when new evidence emerges. Build dramatic irony — the listener knows things the original investigators didn't. Use time jumps effectively. The passage of time is a character in this story.",
                defaults: { narratorStyle: "documentary", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "investigator", ending: "ai_decide", contentMode: "factual" },
            },
        ],
    },

    // ── Horror / Creepy ─────────────────────────────────
    {
        id: "horror",
        label: "Horror / Creepy",
        icon: "👻",
        description: "Dread, mystery, and the unknown",
        imageStyle: "Desaturated muted palette, deep shadows, 35mm film grain texture, found footage aesthetic, analog photography, unsettling stillness, high contrast chiaroscuro lighting, liminal spaces.",
        subStyles: [
            {
                id: "campfire",
                label: "Campfire Story",
                promptBlock: "You are telling a campfire story. Start casual, then slowly build dread. Use sensory details — crackling branches, cold breath, the smell of wet earth. Build to a climax but never fully explain the horror. Whisper-quiet moments are scarier than screams. End with 'And some say... they're still out there.'",
                defaults: { narratorStyle: "dramatic", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "slow", audience: "adults", perspective: "first_person", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "cryptids",
                label: "Cryptids & Paranormal",
                promptBlock: "You are narrating a paranormal investigation documentary. Treat the subject seriously — present eyewitness accounts, analyze evidence, discuss explanations both natural and supernatural. Build atmosphere through location descriptions. Let the listener decide what to believe. The unknown is more terrifying than any monster.",
                defaults: { narratorStyle: "dramatic", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "slow", audience: "adults", perspective: "investigator", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "urban_legend",
                label: "Urban Legends",
                promptBlock: "You are exploring urban legends. Present each legend as told by locals — with regional detail and cultural context. Then investigate the truth behind it. Some legends have disturbing real origins. Others are pure fiction that reveals deep human fears. The line between the two is the scariest part.",
                defaults: { narratorStyle: "dramatic", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "standard", audience: "young_adults", perspective: "investigator", ending: "reflective", contentMode: "creative" },
            },
            {
                id: "psychological",
                label: "Psychological Horror",
                promptBlock: "You are narrating psychological horror. The terror comes from within — from perception, memory, and the unreliability of the mind. Use subtle wrongness rather than shock. Describe scenes that feel almost normal but something is slightly off. Make the listener question their own perception.",
                defaults: { narratorStyle: "sleep", musicMood: "dark_ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "slow", audience: "adults", perspective: "second_person", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "scp",
                label: "SCP Foundation",
                promptBlock: "You are reading an SCP Foundation-style containment report. Use clinical, bureaucratic language to describe impossible and terrifying anomalies. Include containment procedures, incident logs, and [REDACTED] sections. The contrast between dry academic tone and horrifying content creates unique dread.",
                defaults: { narratorStyle: "documentary", musicMood: "dark_ambient", useBRoll: false, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "standard", audience: "young_adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
        ],
    },

    // ── History ──────────────────────────────────────────
    {
        id: "history",
        label: "History",
        icon: "📜",
        description: "Epic tales from the past, told with gravitas",
        imageStyle: "Historical photography aesthetic, sepia-tinted warmth, archival document texture, aged parchment feel, oil painting quality, classical portraiture lighting, museum exhibit presentation.",
        subStyles: [
            {
                id: "ken_burns",
                label: "Ken Burns",
                promptBlock: "You are narrating a Ken Burns-style historical documentary. Use primary source quotes read slowly. Layer personal stories over the sweep of history. Use the words of the people who lived it — letters, diaries, speeches. Let silence and images do the emotional work. History is people, not dates.",
                defaults: { narratorStyle: "sleep", musicMood: "classical", useBRoll: false, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "epic_cinematic",
                label: "Epic / Cinematic",
                promptBlock: "You are narrating an epic historical documentary. Use sweeping, dramatic language. Paint vast scenes of armies, empires, and turning points. Use the present tense for key moments to create immediacy — 'Caesar crosses the Rubicon. There is no turning back.' Make history feel like it's happening now.",
                defaults: { narratorStyle: "dramatic", musicMood: "epic", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "ancient_civ",
                label: "Ancient Civilizations",
                promptBlock: "You are exploring ancient civilizations. Convey the mystery of lost worlds — what we know, what we've inferred, and what remains unknown. Describe ruins as if walking through them. Use archaeological evidence to reconstruct daily life. Make the ancient feel immediate and human.",
                defaults: { narratorStyle: "documentary", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "war_doc",
                label: "War Documentary",
                promptBlock: "You are narrating a war documentary. Be respectful of the human cost. Focus on individual soldiers' experiences alongside strategic overviews. Use letters home, field reports, and survivor testimony. Never glorify violence — show its weight. The listener should feel the gravity of every decision.",
                defaults: { narratorStyle: "documentary", musicMood: "epic", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "chroma", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "biography",
                label: "Biography",
                promptBlock: "You are telling a person's life story. Begin with a defining moment, then go back to the beginning. Build the character arc — their struggles, turning points, and legacy. Use their own words whenever possible. Make the listener feel they knew this person. Every life contains a universal truth.",
                defaults: { narratorStyle: "conversational", musicMood: "piano", useBRoll: true, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual" },
            },
        ],
    },

    // ── Children's ──────────────────────────────────────
    {
        id: "children",
        label: "Children's",
        icon: "🧸",
        description: "Gentle, playful stories for young listeners",
        imageStyle: "Whimsical storybook illustration, bright saturated watercolors, playful cartoon style, warm golden lighting, soft rounded shapes, children's book aesthetic, hand-drawn texture.",
        subStyles: [
            {
                id: "dr_seuss",
                label: "Dr. Seuss Style",
                promptBlock: "Write in the style of Dr. Seuss. Use AABB rhyming couplets, made-up words that sound delightful (like 'snazzleberry' or 'wibblewomp'), and playful repetition. Characters should have silly alliterative names. The moral should emerge naturally from the absurdity. Keep it bouncy and joyful.",
                defaults: { narratorStyle: "conversational", musicMood: "whimsical", useBRoll: false, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "flux", pacing: "standard", audience: "toddlers", perspective: "omniscient", ending: "hopeful", contentMode: "creative" },
            },
            {
                id: "fairy_tale",
                label: "Fairy Tale",
                promptBlock: "Tell a classic fairy tale. Begin with 'Once upon a time...' Use archetypes — the brave child, the wise animal, the dark forest. Include a trial or quest. Magic should feel natural, not explained. The world should be both wondrous and slightly dangerous. End with 'And they lived...' or a gentle twist.",
                defaults: { narratorStyle: "sleep", musicMood: "whimsical", useBRoll: false, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "flux", pacing: "slow", audience: "kids", perspective: "omniscient", ending: "hopeful", contentMode: "creative" },
            },
            {
                id: "mr_rogers",
                label: "Mr. Rogers",
                promptBlock: "Speak like Mr. Rogers — with genuine warmth, patience, and respect for the child's intelligence. Ask gentle questions: 'Have you ever wondered...?' Validate feelings: 'It's okay to feel scared sometimes.' Use everyday situations to explore big ideas. Never rush. Every child listening should feel safe and valued.",
                defaults: { narratorStyle: "sleep", musicMood: "piano", useBRoll: false, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "toddlers", perspective: "second_person", ending: "hopeful", contentMode: "creative" },
            },
            {
                id: "aesop",
                label: "Aesop's Fables",
                promptBlock: "Tell a fable with animal characters who represent human qualities. Keep it short and focused on one clear moral. The animals should speak and behave in ways that reveal the lesson naturally. End with the moral stated simply. Use timeless, clean language that feels ancient yet fresh.",
                defaults: { narratorStyle: "conversational", musicMood: "piano", useBRoll: false, useKenBurns: true, visualMode: "chapter_illustrations", imageModel: "flux", pacing: "standard", audience: "kids", perspective: "omniscient", ending: "reflective", contentMode: "creative" },
            },
            {
                id: "bedtime_lullaby",
                label: "Bedtime Lullaby",
                promptBlock: "Tell a sleepy bedtime story designed to help a child drift off. Use a slow, repetitive rhythm. Describe cozy, safe scenes — warm blankets, soft moonlight, gentle breezes. Each paragraph should feel softer and sleepier than the last. The story doesn't need a climax — it should gently fade like falling asleep.",
                defaults: { narratorStyle: "sleep", musicMood: "piano", useBRoll: false, useKenBurns: true, visualMode: "narration_only", imageModel: "flux", pacing: "slow", audience: "toddlers", perspective: "second_person", ending: "hopeful", contentMode: "creative" },
            },
        ],
    },

    // ── Sleep / Relaxation ──────────────────────────────
    {
        id: "sleep",
        label: "Sleep / Relaxation",
        icon: "🌙",
        description: "Calming content designed for rest",
        imageStyle: "Soft dreamy atmosphere, gentle bokeh, pastel and muted tones, ethereal glow, calm waterscape photography, golden hour warmth, impressionist painting quality.",
        subStyles: [
            {
                id: "asmr_nature",
                label: "ASMR Nature",
                promptBlock: "Narrate a slow journey through nature designed for relaxation. Describe every sensory detail — the texture of bark, the sound of water over stones, the warmth of dappled sunlight. Speak so softly the listener feels you're whispering beside them. Each scene should be more peaceful than the last.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "second_person", ending: "hopeful", contentMode: "creative" },
            },
            {
                id: "bedtime_science",
                label: "Bedtime Science",
                promptBlock: "Explain fascinating science in the most calming way possible. Choose topics with natural wonder — stars, ocean depths, how plants grow. Speak slowly with long pauses. No urgency, no stakes, just gentle exploration of beautiful ideas. The goal is for the listener to drift off feeling curious and content.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "rain_ocean",
                label: "Rain & Ocean",
                promptBlock: "Narrate a journey through rain-soaked and oceanic landscapes. Focus entirely on water in all its forms — gentle rain on leaves, waves retreating from shore, distant thunder rolling across plains. This is more soundscape than story. Words are sparse, gentle, and rhythmic.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "meditation",
                label: "Guided Meditation",
                promptBlock: "Guide the listener through a meditation. Use second person throughout. Direct their breathing: 'Breathe in slowly... and release.' Visualize peaceful scenes. Let silences stretch. Each instruction should bring deeper relaxation. This is not a story — it is a gentle guided experience.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: false, useKenBurns: true, visualMode: "narration_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "second_person", ending: "hopeful", contentMode: "creative" },
            },
            {
                id: "sleepy_history",
                label: "Sleepy History",
                promptBlock: "Tell a historical story in the most calming way possible. Choose a period with visual beauty — Renaissance Florence, ancient Japanese gardens, the Silk Road. Focus on daily life, not battles. Describe textures, colors, and routines. History as a warm blanket of human continuity.",
                defaults: { narratorStyle: "sleep", musicMood: "classical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "creative" },
            },
        ],
    },

    // ── Comedy / Satire ─────────────────────────────────
    {
        id: "comedy",
        label: "Comedy / Satire",
        icon: "😂",
        description: "Irreverent, funny, and clever",
        imageStyle: "Vibrant pop-art colors, comic book aesthetic, exaggerated expressions, satirical newspaper illustration, bold outlines, retro advertising style, tongue-in-cheek visual humor.",
        subStyles: [
            {
                id: "mock_doc",
                label: "Mock Documentary",
                promptBlock: "You are narrating a mock documentary in the style of The Office or Christopher Guest. Treat an absurd subject with complete seriousness. Use documentary conventions — 'What struck researchers most...', 'In the annals of history...' — applied to ridiculous situations. The humor comes from the gap between tone and content.",
                defaults: { narratorStyle: "documentary", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "drunk_history",
                label: "Drunk History",
                promptBlock: "Tell history like a slightly inebriated friend at a party. Get excited, lose track, go on tangents, then snap back: 'Wait, no, okay so THEN...' Get names slightly wrong, then correct yourself. The facts should be real but the delivery is gloriously chaotic. Include dramatic pauses followed by 'Dude. DUDE.'",
                defaults: { narratorStyle: "energetic", musicMood: "whimsical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "fast", audience: "young_adults", perspective: "first_person", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "absurdist",
                label: "Absurdist",
                promptBlock: "Narrate with complete deadpan while describing increasingly absurd events. Never acknowledge the absurdity. Treat impossible things as mundane. The narrator is unfazed by anything. Use formal, measured language for chaotic scenarios. Think Douglas Adams or Terry Pratchett.",
                defaults: { narratorStyle: "conversational", musicMood: "whimsical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "deadpan_british",
                label: "Deadpan British",
                promptBlock: "Narrate with dry British wit. Understate everything. Use devastating understatement: 'The volcano was, one might say, somewhat inconvenient.' Deploy passive-aggressive observations as comedy. Be deeply polite while describing terrible things. Think David Mitchell or Stephen Fry narrating chaos.",
                defaults: { narratorStyle: "conversational", musicMood: "piano", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "creative" },
            },
            {
                id: "standup",
                label: "Stand-up Narrator",
                promptBlock: "Narrate as a standup comedian doing a bit. Set up premises, build expectations, then subvert them. Use callbacks to earlier jokes. Break the fourth wall. Include 'bits' where you roleplay different characters badly. The information should be real but the framing is pure comedy.",
                defaults: { narratorStyle: "energetic", musicMood: "none", useBRoll: true, useKenBurns: false, visualMode: "narration_only", imageModel: "flux", pacing: "fast", audience: "young_adults", perspective: "first_person", ending: "ai_decide", contentMode: "creative" },
            },
        ],
    },

    // ── Nature / Wildlife ───────────────────────────────
    {
        id: "nature",
        label: "Nature / Wildlife",
        icon: "🌿",
        description: "The natural world observed with patience and awe",
        imageStyle: "8K nature photography, shallow depth of field, golden hour natural light, cinematic landscape composition, vibrant earth tones, macro detail, National Geographic quality.",
        subStyles: [
            {
                id: "planet_earth",
                label: "Planet Earth",
                promptBlock: "Narrate like David Attenborough on Planet Earth. Speak with hushed reverence. Anthropomorphize animals gently — give them motivations without being sentimental. Use the present tense: 'She approaches cautiously...' Let the visuals lead. Your words should enhance silence, not fill it.",
                defaults: { narratorStyle: "sleep", musicMood: "classical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "ocean_deep",
                label: "Ocean Deep",
                promptBlock: "Narrate an ocean documentary. Convey the alien beauty of deep-sea environments. Describe bioluminescence, pressure, darkness, and creatures that defy imagination. Make the ocean feel like outer space on Earth. Build wonder through the sheer impossibility of what lives down there.",
                defaults: { narratorStyle: "sleep", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
            {
                id: "rainforest",
                label: "Rainforest",
                promptBlock: "Narrate a journey through the rainforest canopy. Layer sounds — distant howler monkeys, dripping water, buzzing insects, birdsong. Describe the layers of the forest from floor to canopy. Every square meter contains a universe of life. Move slowly, discovering hidden creatures and symbiotic relationships.",
                defaults: { narratorStyle: "documentary", musicMood: "ambient", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "slow", audience: "adults", perspective: "omniscient", ending: "ai_decide", contentMode: "factual" },
            },
            {
                id: "migration",
                label: "Migration",
                promptBlock: "Tell the epic story of animal migration. Follow one herd, flock, or pod across thousands of miles. Build drama through the journey — predators, weather, exhaustion, birth. Make the listener feel the miles in their bones. This is an odyssey story wearing nature documentary clothes.",
                defaults: { narratorStyle: "documentary", musicMood: "epic", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "circular", contentMode: "factual" },
            },
            {
                id: "micro_world",
                label: "Micro World (Insects)",
                promptBlock: "Narrate the microscopic world of insects and tiny creatures. Describe a blade of grass as a towering forest. A raindrop is a catastrophic flood. A beetle crossing a path is an epic expedition. Use scale shifts to create wonder — zoom in until the familiar becomes alien.",
                defaults: { narratorStyle: "documentary", musicMood: "whimsical", useBRoll: true, useKenBurns: true, visualMode: "broll_only", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "reflective", contentMode: "factual" },
            },
        ],
    },

    // ── Romance & Telenovela Soap Opera Drama ────────────
    {
        id: "romance_telenovela",
        label: "Telenovela & Soap Opera Drama",
        icon: "🌹",
        description: "High-voltage romance, family secrets, dramatic betrayals, and cliffhangers",
        imageStyle: "Glamorous high-contrast cinematic lighting, vibrant saturated colors, dramatic over-the-shoulder framing, soft focus backgrounds, luxury mansion interiors, intense emotional expressions.",
        subStyles: [
            {
                id: "telenovela_classic",
                label: "Classic Telenovela",
                promptBlock: "You are writing a classic Mexican Telenovela drama script. Every scene is overflowing with high emotion, forbidden love, secret heirs, and shocking betrayals. Use passionate dialogue, dramatic gasps, slow-motion face slaps, and dramatic cliffhangers before commercial breaks. Make the stakes personal, urgent, and deeply emotional.",
                defaults: { narratorStyle: "dramatic", musicMood: "epic", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "juggernaut", pacing: "fast", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "kdrama_melodrama",
                label: "K-Drama Romance",
                promptBlock: "You are writing a Korean Drama romance narrative. Focus on emotional intensity, unspoken longing, rain-soaked reunions, and secret identities. Build dramatic tension through subtle glances, character dialogue turns, and emotional climaxes.",
                defaults: { narratorStyle: "dramatic", musicMood: "piano", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "juggernaut", pacing: "standard", audience: "young_adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "dynasty_wealth",
                label: "High-Society Soap Opera (Dynasty)",
                promptBlock: "You are writing a high-society billionaire soap opera. Focus on wealthy estate feuds, corporate backstabbing, wine glass drops, and glamorous betrayals among rich heirs. Dialogue is sharp, witty, and venomous.",
                defaults: { narratorStyle: "dramatic", musicMood: "classical", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "juggernaut", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
        ],
    },

    // ── Anthropomorphic Animal Drama ─────────────────────
    {
        id: "anthropomorphic_animal",
        label: "Anthropomorphic Animal Drama",
        icon: "🦁",
        description: "Humanlike animal royals, mafia bosses, and epic fantasy soap operas",
        imageStyle: "Anthropomorphic animal characters in tailor-made human suits and luxury attire, highly detailed fur and feline textures, cinematic photorealistic lighting, dramatic character portraits.",
        subStyles: [
            {
                id: "lion_royals",
                label: "Animal Kingdom Dynasty",
                promptBlock: "You are writing an epic anthropomorphic animal royal drama — think 'The Lion King meets Succession'. Suit-wearing lions, panther heiresses, and wolf generals fight for control of a luxury savanna estate. Every scene features intense character dialogue, power plays, and regal betrayals.",
                defaults: { narratorStyle: "dramatic", musicMood: "epic", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "noir_detective_cat",
                label: "Anthropomorphic Noir",
                promptBlock: "You are writing a hardboiled detective mystery starring an anthropomorphic cat in a trench coat navigating a rainy, neon-lit 1940s metropolis. Smoke swirls in dark alleys as secrets unfold.",
                defaults: { narratorStyle: "conversational", musicMood: "dark_ambient", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "first_person", ending: "cliffhanger", contentMode: "creative" },
            },
        ],
    },

    // ── Kung-Fu Martial Arts Classics ────────────────────
    {
        id: "kung_fu_classics",
        label: "Kung-Fu Martial Arts Classics",
        icon: "🥋",
        description: "High-octane martial arts choreography, wuxia wirework, and revenge duels",
        imageStyle: "70s Shaw Brothers kung-fu cinema aesthetic, vibrant primary colors, high-contrast dynamic lighting, sweeping mountain temple backgrounds, sharp motion blur, classic wuxia attire.",
        subStyles: [
            {
                id: "wuxia_temple",
                label: "Wuxia Temple Showdown",
                promptBlock: "You are writing an epic Wuxia martial arts film script. Every scene features intense character rivalries, wooden staff duels, tea house confrontations, and high-flying combat stances. Dialogue is honor-bound, intense, and focused on martial arts mastery and clan revenge.",
                defaults: { narratorStyle: "dramatic", musicMood: "epic", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "juggernaut", pacing: "fast", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "shaw_brothers_70s",
                label: "70s Martial Arts Classic",
                promptBlock: "You are writing a 1970s Hong Kong kung-fu action film. Dynamic whip-pans, intense eye-to-eye staring contests, fast combat choreography, and revenge-fueled dialogue turns.",
                defaults: { narratorStyle: "dramatic", musicMood: "epic", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "juggernaut", pacing: "fast", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
        ],
    },

    // ── Dystopian Sci-Fi & Cyberpunk Worlds ──────────────
    {
        id: "dystopian_scifi",
        label: "Dystopian Sci-Fi & Cyberpunk",
        icon: "🌆",
        description: "High-tech low-life megacities, cybernetic rebels, and post-apocalyptic sagas",
        imageStyle: "Cyberpunk Blade Runner aesthetic, rain-soaked asphalt, towering holographic billboards, neon cyan and magenta illumination, dark dystopian megastructures, cybernetic implants.",
        subStyles: [
            {
                id: "cyberpunk_slums",
                label: "Neon Cyberpunk Rebellion",
                promptBlock: "You are writing a high-voltage Cyberpunk sci-fi mini-series. Dystopian megacities, rogue AI hunters, cybernetic mercenaries, and underground hackers. Every scene has high stakes, intense character conflict, and glowing neon atmosphere.",
                defaults: { narratorStyle: "dramatic", musicMood: "electronic", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "flux", pacing: "fast", audience: "young_adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
            {
                id: "wasteland_survival",
                label: "Post-Apocalyptic Wasteland",
                promptBlock: "You are writing a gritty post-apocalyptic survival drama — think 'Mad Max meets Dune'. Desolate desert highways, scavenged armors, scarce resources, and desperate faction clashes.",
                defaults: { narratorStyle: "dramatic", musicMood: "dark_ambient", useBRoll: false, useKenBurns: false, visualMode: "full_ai_video", imageModel: "flux", pacing: "standard", audience: "adults", perspective: "omniscient", ending: "cliffhanger", contentMode: "creative" },
            },
        ],
    },
];

// ─── Helper Functions ───────────────────────────────────

/** Find a genre by ID */
export function getGenre(genreId: string): GenreDef | undefined {
    return GENRES.find((g) => g.id === genreId);
}

/** Find a sub-style within a genre */
export function getSubStyle(genreId: string, subStyleId: string): SubStyleDef | undefined {
    return getGenre(genreId)?.subStyles.find((s) => s.id === subStyleId);
}

/** Get smart defaults for a genre+subStyle combo */
export function getSmartDefaults(genreId: string, subStyleId: string): SmartDefaults | undefined {
    return getSubStyle(genreId, subStyleId)?.defaults;
}

/** Get genre-level image style modifiers for prompt injection */
export function getImageStyleModifiers(genreId: string): string {
    return getGenre(genreId)?.imageStyle || "";
}

/** Get the prompt block for a given configuration */
export function buildPromptContext(config: {
    genre: string;
    subStyle: string;
    audience: string;
    perspective: string;
    pacing: string;
    ending: string;
    endingNote?: string;
    contentMode: string;
}): string {
    const subStyle = getSubStyle(config.genre, config.subStyle);
    const audience = AUDIENCE_OPTIONS.find((a) => a.id === config.audience);
    const perspective = PERSPECTIVE_OPTIONS.find((p) => p.id === config.perspective);
    const pacing = PACING_OPTIONS.find((p) => p.id === config.pacing);
    const ending = ENDING_OPTIONS.find((e) => e.id === config.ending);
    const contentMode = CONTENT_MODE_OPTIONS.find((c) => c.id === config.contentMode);

    const blocks: string[] = [];

    // Core style from genre preset
    if (subStyle) blocks.push(subStyle.promptBlock);

    // Audience
    if (audience) blocks.push(audience.promptBlock);

    // Perspective
    if (perspective) blocks.push(perspective.promptBlock);

    // Pacing
    if (pacing) blocks.push(pacing.promptBlock);

    // Content mode
    if (contentMode) blocks.push(contentMode.promptBlock);

    // Ending
    if (ending?.promptBlock) blocks.push(ending.promptBlock);
    if (config.endingNote) blocks.push(`Additional direction for the ending: ${config.endingNote}`);

    return blocks.join("\n\n");
}

/** Get words-per-minute for a pacing setting */
export function getWordsPerMinute(pacing: string): number {
    return PACING_OPTIONS.find((p) => p.id === pacing)?.wpm ?? 150;
}
