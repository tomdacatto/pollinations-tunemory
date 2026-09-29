// The two AI steps: write the lyrics, then have them sung.
import { chatJson, postJson } from "./pollen.js";
import { checkSong, cleanSong, lyricsPrompt, songPrompt } from "./songs.js";

// google/lyria-3-clip-preview sings a fixed 30-second clip with vocals.
export const MUSIC_MODEL = "google/lyria-3-clip-preview";

// Asks for lyrics and checks them in code; if a fact or number got lost, the
// model is asked again with the reason.
export async function writeLyrics(notes, style) {
    let problem = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        // Gen caches identical requests; a token makes "make it again" a new song.
        const prompt = `${lyricsPrompt(notes, style)}\nVariety token: ${Math.random().toString(36).slice(2, 8)}`;
        const song = await chatJson(
            [
                {
                    role: "system",
                    content:
                        "You write short songs that help people memorize facts accurately. Reply with JSON only.",
                },
                {
                    role: "user",
                    content: problem
                        ? `${prompt}\nYour previous attempt was rejected: ${problem}. Fix that.`
                        : prompt,
                },
            ],
            { temperature: 0.9 },
        );
        problem = checkSong(notes, song);
        if (!problem) return cleanSong(song);
    }
    throw new Error(
        `The song could not be written faithfully to your notes (${problem}). Try shorter notes.`,
    );
}

export async function singSong(song, style, signal) {
    const res = await postJson(
        "/v1/audio/speech",
        {
            model: MUSIC_MODEL,
            input: songPrompt(song, style),
            response_format: "mp3",
        },
        signal,
    );
    return res.blob();
}
