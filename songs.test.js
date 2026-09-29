import assert from "node:assert/strict";
import test from "node:test";
import {
    checkSong,
    cleanSong,
    find,
    highlight,
    isCorrect,
    lyricsPrompt,
    makeBlanks,
    STYLES,
    songPrompt,
} from "./songs.js";

const NOTES =
    "Mitochondria make ATP. The Krebs cycle happens in the matrix. Glycolysis makes 2 ATP and the Krebs cycle makes 2 more.";

const song = (over = {}) => ({
    title: "Powerhouse Beat",
    keywords: [
        "Mitochondria",
        "ATP",
        "Krebs cycle",
        "matrix",
        "Glycolysis",
        "2",
    ],
    lines: [
        "Mitochondria, the powerhouse, hey",
        "They make ATP every day",
        "The Krebs cycle spins in the matrix inside",
        "Energy flows with nowhere to hide",
        "Glycolysis makes 2 ATP",
        "The Krebs cycle makes 2, you see",
        "Mitochondria, sing it once more",
        "ATP is what we're here for",
    ],
    ...over,
});

test("a song that keeps every keyword and number is accepted", () => {
    assert.equal(checkSong(NOTES, song()), null);
});

test("songs that lose a fact are rejected with a reason", () => {
    const cases = [
        ["no title", { title: " " }, /title/],
        ["too few lines", { lines: song().lines.slice(0, 3) }, /lines/],
        [
            "no usable keywords",
            { keywords: ["ribosome", "catalyst", "enzyme", "nucleus"] },
            /keywords/,
        ],
        [
            "long keywords do not count",
            {
                keywords: [
                    "Mitochondria",
                    "ATP",
                    "the Krebs cycle happens in the matrix",
                ],
            },
            /keywords/,
        ],
        [
            "repeated line",
            { lines: [...song().lines.slice(0, 7), `${song().lines[0]}!`] },
            /repeated/,
        ],
        [
            "number dropped",
            {
                keywords: ["Mitochondria", "ATP", "Krebs cycle", "matrix"],
                lines: song().lines.map((l) => l.replace(/2/g, "two")),
            },
            /number 2/,
        ],
        [
            "line too long",
            {
                lines: [
                    ...song().lines.slice(0, 7),
                    "Mitochondria make ATP and the Krebs cycle happens in the matrix and that is why we sing",
                ],
            },
            /too long/,
        ],
    ];
    for (const [name, over, expected] of cases) {
        assert.match(checkSong(NOTES, song(over)) ?? "", expected, name);
    }
    assert.match(checkSong(NOTES, null) ?? "", /title/);
});

test("find matches whole words only, ignoring case", () => {
    assert.equal(find("They make ATP every day", "atp"), 10);
    assert.equal(
        find("Glycolysis makes 22 ATP", "2"),
        -1,
        "2 is not inside 22",
    );
    assert.equal(find("makes 2 ATP", "2"), 6);
    assert.equal(find("the Krebs cycle spins", "Krebs cycle"), 4);
    assert.equal(find("a (b) c", "(b)"), 2);
});

test("blanks hide one keyword per line and keep the rest of the line", () => {
    const rows = makeBlanks(song(), 6, () => 0.3);
    const blanks = rows.flat().filter((p) => "blank" in p);
    assert.equal(blanks.length, 6);
    assert.equal(rows.length, 8);
    for (const row of rows)
        assert.ok(row.filter((p) => "blank" in p).length <= 1);
    for (const [i, row] of rows.entries()) {
        const rebuilt = row
            .map((p) => ("blank" in p ? p.blank : p.text))
            .join("");
        assert.equal(
            rebuilt,
            song().lines[i],
            "text plus answer rebuilds the original line",
        );
    }
    assert.equal(
        makeBlanks(song(), 3)
            .flat()
            .filter((p) => "blank" in p).length,
        3,
    );
});

test("blanks keep the original spelling of the answer", () => {
    const rows = makeBlanks(
        song({ keywords: ["atp", "mitochondria", "matrix"] }),
        8,
        () => 0,
    );
    const answers = rows
        .flat()
        .filter((p) => "blank" in p)
        .map((p) => p.blank);
    assert.ok(answers.includes("ATP"));
    assert.ok(answers.includes("Mitochondria"));
});

test("answers ignore case, accents and punctuation; typos are forgiven only in longer words", () => {
    assert.ok(isCorrect("Mitochondria", "mitochondria"));
    assert.ok(isCorrect("Mitochondria", "  Mitochondria! "));
    assert.ok(
        isCorrect("Mitochondria", "Mitochondrai") === false,
        "a swap is two edits",
    );
    assert.ok(
        isCorrect("Mitochondria", "Mitochondrial"),
        "one extra letter is fine",
    );
    assert.ok(isCorrect("café", "cafe"), "accents do not matter");
    assert.ok(!isCorrect("ATP", "ATQ"), "short answers must be exact");
    assert.ok(isCorrect("2", "2"));
    assert.ok(!isCorrect("2", "3"));
    assert.ok(!isCorrect("1914", "1915"), "numbers must be exact");
    assert.ok(!isCorrect("matrix", ""));
});

test("prompts carry the notes, the style and the lyrics unchanged", () => {
    const p = lyricsPrompt(NOTES, "hiphop");
    assert.match(p, /Hip-hop/);
    assert.ok(p.includes(NOTES));
    assert.match(p, /add no new facts/);
    const music = songPrompt(song(), "folk");
    assert.ok(music.includes(STYLES.folk.sound));
    for (const line of song().lines) assert.ok(music.includes(line));
});

test("cleanSong repairs keywords instead of failing the song", () => {
    const messy = song({
        title: "  Powerhouse Beat ",
        keywords: [
            "ATP",
            "atp",
            "the Krebs cycle happens in the matrix",
            "ribosome",
            "Mitochondria",
            "matrix",
            "  ",
            7,
            "Glycolysis",
            "2",
            "Krebs cycle",
            "Extra",
        ],
    });
    const clean = cleanSong(messy);
    assert.equal(clean.title, "Powerhouse Beat");
    assert.deepEqual(clean.keywords, [
        "ATP",
        "Mitochondria",
        "matrix",
        "Glycolysis",
        "2",
        "Krebs cycle",
    ]);
    assert.equal(
        checkSong(NOTES, messy),
        null,
        "a repairable song is accepted",
    );
    assert.deepEqual(cleanSong(null), { title: "", lines: [], keywords: [] });
});

test("highlight marks keywords, keeps the rest, and skips overlaps", () => {
    assert.deepEqual(highlight("They make ATP every day", ["ATP"]), [
        { text: "They make " },
        { key: "ATP" },
        { text: " every day" },
    ]);
    assert.deepEqual(
        highlight("The Krebs cycle spins", ["Krebs cycle", "cycle"]),
        [{ text: "The " }, { key: "Krebs cycle" }, { text: " spins" }],
    );
    assert.deepEqual(highlight("no match here", ["ATP"]), [
        { text: "no match here" },
    ]);
    assert.deepEqual(highlight("2 and 2", ["2"]), [
        { key: "2" },
        { text: " and 2" },
    ]);
});
