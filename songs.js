// The learning logic of Tunemory, all plain code: prompts, checking that the
// lyrics keep every fact, blanking words for the quiz and marking answers.

export const STYLES = {
    pop: {
        label: "Pop",
        sound: "upbeat catchy pop with a big singalong chorus",
    },
    hiphop: {
        label: "Hip-hop",
        sound: "hip-hop with a steady beat and rhythmic rap vocals",
    },
    folk: {
        label: "Folk",
        sound: "warm acoustic folk with guitar and a gentle melody",
    },
    lofi: {
        label: "Lo-fi",
        sound: "laid-back lo-fi chill with soft beats and a mellow sung melody",
    },
    rock: { label: "Rock", sound: "energetic pop-rock with driving guitars" },
    kids: {
        label: "Nursery rhyme",
        sound: "bouncy nursery-rhyme tune with simple cheerful singing",
    },
    musical: {
        label: "Musical",
        sound: "showtune musical-theatre number with piano and theatrical vocals",
    },
};

export const MAX_NOTES = 1200;
export const LINES = [6, 10];
export const KEYWORDS = [3, 8];

export function lyricsPrompt(notes, style) {
    return `Turn these notes into a catchy ${STYLES[style].label} song that helps a learner memorize them.
Notes:
"""
${notes}
"""
Return JSON with exactly these keys:
- title: a short title, at most 6 words
- keywords: array of 5 to 8 short key terms or numbers a learner must remember (1 to 3 words each), copied exactly from the notes
- lines: array of 8 lyric lines, each at most 9 words, singable, rhyming in pairs. Every line teaches something different; never repeat a line.
Every keyword must appear word for word in the lines. Keep every fact and number exactly as in the notes and add no new facts.`;
}

const words = (text) => text.trim().split(/\s+/).filter(Boolean);
const numbersIn = (text) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word, case-insensitive match position of `keyword` in `line`, or -1.
export function find(line, keyword) {
    const edge = /^[\w]/.test(keyword) ? "\\b" : "";
    const end = /[\w]$/.test(keyword) ? "\\b" : "";
    return line.search(new RegExp(`${edge}${escapeRe(keyword)}${end}`, "i"));
}

// Repairs what code can fix, so a retry is only spent on real problems:
// keywords that are too long to be a quiz blank or that are not in the lyrics
// are dropped, and everything is trimmed.
export function cleanSong(song) {
    const lines = Array.isArray(song?.lines)
        ? song.lines
              .filter((l) => typeof l === "string" && l.trim())
              .map((l) => l.trim())
        : [];
    const seen = new Set();
    const keywords = (Array.isArray(song?.keywords) ? song.keywords : [])
        .filter((k) => typeof k === "string" && k.trim())
        .map((k) => k.trim())
        .filter((k) => !seen.has(k.toLowerCase()) && seen.add(k.toLowerCase()))
        .filter(
            (k) => words(k).length <= 3 && lines.some((l) => find(l, k) >= 0),
        )
        .slice(0, KEYWORDS[1]);
    return {
        title: typeof song?.title === "string" ? song.title.trim() : "",
        lines,
        keywords,
    };
}

const flat = (line) =>
    line
        .toLowerCase()
        .replace(/[^\p{L}\p{N} ]/gu, "")
        .trim();

// Returns a problem string, or null when the song is safe to use for learning.
export function checkSong(notes, raw) {
    const song = cleanSong(raw);
    if (!song.title) return "missing title";
    if (song.lines.length < LINES[0] || song.lines.length > LINES[1])
        return `needs ${LINES[0]} to ${LINES[1]} lines`;
    if (song.lines.some((l) => words(l).length > 14))
        return "a line is too long to sing";
    if (new Set(song.lines.map(flat)).size < song.lines.length)
        return "a line is repeated";
    if (song.keywords.length < KEYWORDS[0])
        return `needs at least ${KEYWORDS[0]} short keywords that appear in the lyrics`;
    const lyrics = song.lines.join(" ");
    const lost = [...new Set(numbersIn(notes))].find(
        (n) => !lyrics.includes(n),
    );
    if (lost)
        return `the number ${lost} from the notes is missing from the lyrics`;
    return null;
}

// Blanks for the quiz: one keyword per line, on up to `count` different lines.
export function makeBlanks(song, count = 6, rng = Math.random) {
    const picks = song.lines
        .map((text, index) => {
            const hit = song.keywords
                .map((k) => ({ k: k.trim(), at: find(text, k.trim()) }))
                .filter((h) => h.at >= 0);
            return hit.length
                ? { index, ...hit[Math.floor(rng() * hit.length)] }
                : null;
        })
        .filter(Boolean);
    const chosen = new Set(
        picks
            .map((p) => ({ p, r: rng() }))
            .sort((a, b) => a.r - b.r)
            .slice(0, count)
            .map(({ p }) => p.index),
    );
    return song.lines.map((text, index) => {
        const pick = chosen.has(index)
            ? picks.find((p) => p.index === index)
            : null;
        if (!pick) return [{ text }];
        const answer = text.slice(pick.at, pick.at + pick.k.length);
        return [
            { text: text.slice(0, pick.at) },
            { blank: answer },
            { text: text.slice(pick.at + pick.k.length) },
        ];
    });
}

const normalize = (s) =>
    s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s.,]/gu, "")
        .replace(/\s+/g, " ")
        .trim();

function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const tmp = row[j];
            row[j] = Math.min(
                row[j] + 1,
                row[j - 1] + 1,
                prev + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            prev = tmp;
        }
    }
    return row[b.length];
}

// Case, accents and punctuation do not matter. One typo is forgiven in longer
// words, but numbers must be exact.
export function isCorrect(expected, given) {
    const a = normalize(expected);
    const b = normalize(given);
    if (!b) return false;
    if (a === b) return true;
    if (/\d/.test(a)) return false;
    return a.length >= 6 && distance(a, b) <= 1;
}

// The prompt for the music model. The lyrics go in unchanged.
export function songPrompt(song, style) {
    return `${STYLES[style].sound}. A complete 30-second song with clear lead vocals singing exactly these lyrics, nothing else:\n${song.lines.join("\n")}`;
}

// Splits a line into plain text and highlighted keywords, for display.
export function highlight(line, keywords) {
    const hits = [];
    for (const k of keywords) {
        const at = find(line, k);
        if (at >= 0) hits.push({ at, end: at + k.length });
    }
    hits.sort((a, b) => a.at - b.at || b.end - a.end);
    const parts = [];
    let cursor = 0;
    for (const h of hits) {
        if (h.at < cursor) continue; // overlaps a keyword already taken
        if (h.at > cursor) parts.push({ text: line.slice(cursor, h.at) });
        parts.push({ key: line.slice(h.at, h.end) });
        cursor = h.end;
    }
    if (cursor < line.length) parts.push({ text: line.slice(cursor) });
    return parts.length ? parts : [{ text: line }];
}
