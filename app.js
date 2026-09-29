import { deleteSong, listSongs, newId, saveSong } from "./library.js";
import { singSong, writeLyrics } from "./make.js";
import {
    balance,
    completeSignIn,
    getSession,
    signIn,
    signOut,
} from "./pollen.js";
import {
    highlight,
    isCorrect,
    MAX_NOTES,
    makeBlanks,
    STYLES,
} from "./songs.js";

const $app = document.getElementById("app");

const EXAMPLES = [
    "Photosynthesis turns carbon dioxide and water into glucose and oxygen, using light energy captured by chlorophyll in the chloroplasts.",
    "The French Revolution began in 1789 with the storming of the Bastille on July 14. Louis XVI was king. The Reign of Terror lasted from 1793 to 1794, led by Robespierre.",
    "The planets in order from the sun: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune.",
];

const esc = (s) =>
    String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );

const state = {
    screen: "landing",
    tab: "make",
    error: "",
    pollen: null,
    notes: "",
    style: "pop",
    working: "",
    draft: null,
    song: null,
    playlist: [],
    quiz: null,
    queue: null, // { ids, at }
};

// Object URLs for saved audio, made once per song.
const urls = new Map();
const urlFor = (song) => {
    if (!urls.has(song.id)) urls.set(song.id, URL.createObjectURL(song.audio));
    return urls.get(song.id);
};
let queueAudio = null;

// --- helpers ---------------------------------------------------------------------

function fail(e) {
    state.working = "";
    state.draft = null;
    state.error = e?.message || "Something went wrong.";
    if (e?.status === 401) state.screen = "landing";
    render();
}

async function refreshPollen() {
    state.pollen = await balance();
    const chip = document.getElementById("pollen");
    if (chip && state.pollen != null) {
        chip.textContent = `${state.pollen.toFixed(2)} Pollen`;
        chip.hidden = false;
    }
}

const slug = (s) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "song";

// --- views -----------------------------------------------------------------------

function header() {
    const signedIn = !!getSession();
    return `<header>
        <h1>Tunemory</h1>
        <div class="right">${
            signedIn
                ? `<span class="chip" id="pollen" title="Your remaining Pollen budget" ${state.pollen == null ? "hidden" : ""}>${state.pollen == null ? "" : `${state.pollen.toFixed(2)} Pollen`}</span><button class="link" data-act="signout">Sign out</button>`
                : ""
        }</div>
    </header>`;
}

const lyricsHtml = (song) =>
    `<ol class="lyrics">${song.lines
        .map(
            (line) =>
                `<li>${highlight(line, song.keywords)
                    .map((p) =>
                        "key" in p ? `<mark>${esc(p.key)}</mark>` : esc(p.text),
                    )
                    .join("")}</li>`,
        )
        .join("")}</ol>`;

function songCard(song) {
    return `<article class="card song">
        <h3>${esc(song.title)} <span class="chip">${esc(STYLES[song.style]?.label ?? song.style)}</span></h3>
        <audio controls src="${urlFor(song)}" preload="metadata"></audio>
        ${lyricsHtml(song)}
        <p class="fine">Remember: ${song.keywords.map((k) => `<mark>${esc(k)}</mark>`).join(" ")}</p>
        <div class="actions">
            <button class="btn primary small" data-act="quiz" data-id="${song.id}">Quiz me</button>
            <a class="btn small" href="${urlFor(song)}" download="${slug(song.title)}.mp3">Download MP3</a>
        </div>
    </article>`;
}

const screens = {
    landing: () => `<section class="hero">
        <p class="kicker">Study by singing</p>
        <h2>Turn what you need to remember into a song.</h2>
        <p>Paste your notes: a fact, a formula, a list of words. Tunemory writes short catchy lyrics that keep every fact and number, has them sung in the style you pick, and then quizzes you by blanking out the key words. Your songs collect in a personal study playlist.</p>
        <p class="fine">Runs on Pollinations and is paid with <b>your own Pollen</b>: about 0.04 per song. You choose the budget when you sign in.</p>
        <button class="btn primary big" data-act="signin">Sign in with Pollen</button>
    </section>`,

    studio: () => `<div class="tabs" role="tablist">
            <button role="tab" class="${state.tab === "make" ? "on" : ""}" data-act="tab" data-t="make">Make a song</button>
            <button role="tab" class="${state.tab === "playlist" ? "on" : ""}" data-act="tab" data-t="playlist">My playlist (${state.playlist.length})</button>
        </div>
        ${state.tab === "make" ? make() : playlist()}`,

    quiz() {
        const q = state.quiz;
        let n = 0;
        const rows = q.rows
            .map((parts) => {
                const html = parts
                    .map((p) => {
                        if (!("blank" in p)) return esc(p.text);
                        const i = n++;
                        const result = q.results?.[i];
                        return `<input class="blank ${result === undefined ? "" : result ? "ok" : "bad"}" data-blank="${i}" size="${Math.max(6, p.blank.length)}" aria-label="Blank ${i + 1}" autocomplete="off" autocapitalize="off" spellcheck="false" ${q.checked ? "readonly" : ""} value="${esc(q.values[i] ?? "")}">${result === false ? `<span class="answer">${esc(p.blank)}</span>` : ""}`;
                    })
                    .join("");
                return `<li>${html}</li>`;
            })
            .join("");
        return `<section>
            <p class="kicker">Quiz</p>
            <h2>${esc(q.song.title)}</h2>
            <audio controls src="${urlFor(q.song)}" preload="metadata"></audio>
            <p class="fine">Listen, then fill in the missing words.</p>
            <ol class="lyrics quiz">${rows}</ol>
            ${
                q.checked
                    ? `<div class="score ${q.score === q.total ? "perfect" : ""}"><b>${q.score} of ${q.total}</b> ${q.score === q.total ? "Perfect. You know this one." : q.score >= q.total / 2 ? "Getting there. Listen again and retry." : "Keep singing it, you will get it."}${q.best != null ? ` <span class="fine">Best: ${q.best}/${q.total}</span>` : ""}</div>
                       <div class="actions"><button class="btn primary" data-act="retry">Try new blanks</button><button class="btn" data-act="back">Back to songs</button></div>`
                    : `<div class="actions"><button class="btn primary" data-act="check">Check my answers</button><button class="btn ghost" data-act="back">Back</button></div>`
            }
        </section>`;
    },
};

function make() {
    const busy = !!state.working;
    return `<section>
        <label>Your notes
            <textarea id="notes" rows="6" maxlength="${MAX_NOTES}" placeholder="Paste the facts you want to remember…" ${busy ? "disabled" : ""}>${esc(state.notes)}</textarea>
        </label>
        <div class="examples">${EXAMPLES.map((e, i) => `<button class="chipbtn" data-act="example" data-i="${i}" ${busy ? "disabled" : ""}>${esc(e.split(/[.,:]/)[0].slice(0, 40))}</button>`).join("")}</div>
        <fieldset ${busy ? "disabled" : ""}><legend>Style</legend><div class="styles">${Object.entries(
            STYLES,
        )
            .map(
                ([k, s]) =>
                    `<label class="style ${state.style === k ? "on" : ""}"><input type="radio" name="style" value="${k}" ${state.style === k ? "checked" : ""}>${s.label}</label>`,
            )
            .join("")}</div></fieldset>
        <button class="btn primary big" data-act="make" ${busy ? "disabled" : ""}>${busy ? esc(state.working) : "Write and sing my song"}</button>
        <p class="fine center">${busy ? "" : "About 0.04 Pollen per song, ready in around 20 seconds."}</p>
        ${busy && state.draft ? `<article class="card"><h3>${esc(state.draft.title)}</h3>${lyricsHtml(state.draft)}<p class="fine">The lyrics are ready and are being sung…</p></article>` : ""}
        ${!busy && state.song ? songCard(state.song) : ""}
    </section>`;
}

function playlist() {
    if (!state.playlist.length)
        return `<section class="center"><p class="fine">Your playlist is empty. Songs you make are saved here, in this browser.</p></section>`;
    const now = state.queue ? state.queue.ids[state.queue.at] : null;
    return `<section>
        <div class="actions"><button class="btn primary small" data-act="${state.queue ? "stop" : "playall"}">${state.queue ? "Stop" : "Play all"}</button></div>
        <ul class="list">${state.playlist
            .map(
                (s) => `<li class="card ${s.id === now ? "now" : ""}">
                    <div><b>${esc(s.title)}</b> <span class="chip">${esc(STYLES[s.style]?.label ?? s.style)}</span>${s.best != null ? ` <span class="chip good">best ${s.best}/${s.total}</span>` : ""}
                        <p class="fine">${esc(s.keywords.slice(0, 4).join(", "))}</p></div>
                    <div class="actions">
                        <button class="btn small" data-act="open" data-id="${s.id}">Play</button>
                        <button class="btn small primary" data-act="quiz" data-id="${s.id}">Quiz</button>
                        <button class="btn small ghost" data-act="remove" data-id="${s.id}" aria-label="Delete ${esc(s.title)}">Delete</button>
                    </div></li>`,
            )
            .join("")}</ul>
    </section>`;
}

function render() {
    const body = (screens[state.screen] ?? screens.landing)();
    $app.innerHTML = `${header()}${state.error ? `<div class="error" role="alert">${esc(state.error)}</div>` : ""}${body}`;
}

// --- flow ------------------------------------------------------------------------

async function makeSong() {
    const notes = document.getElementById("notes").value.trim();
    if (notes.length < 20) {
        state.error = "Paste a few sentences of notes first.";
        return render();
    }
    Object.assign(state, {
        notes,
        error: "",
        song: null,
        working: "Writing the lyrics…",
        draft: null,
    });
    render();
    try {
        const lyrics = await writeLyrics(notes, state.style);
        state.draft = lyrics;
        state.working = "Singing it… (about 15 seconds)";
        render();
        const audio = await singSong(lyrics, state.style);
        const song = {
            id: newId(),
            ...lyrics,
            style: state.style,
            notes,
            audio,
            created: Date.now(),
            best: null,
            total: null,
        };
        await saveSong(song);
        state.playlist = await listSongs();
        Object.assign(state, { song, working: "", draft: null });
        render();
        refreshPollen();
    } catch (e) {
        fail(e);
    }
}

function startQuiz(id) {
    const song = state.playlist.find((s) => s.id === id) ?? state.song;
    stopQueue();
    const rows = makeBlanks(song, 6);
    const total = rows.flat().filter((p) => "blank" in p).length;
    state.quiz = {
        song,
        rows,
        total,
        values: [],
        results: undefined,
        checked: false,
        score: 0,
        best: song.best,
    };
    state.screen = "quiz";
    render();
}

async function checkQuiz() {
    const q = state.quiz;
    const values = [...document.querySelectorAll("input.blank")].map(
        (i) => i.value,
    );
    const answers = q.rows
        .flat()
        .filter((p) => "blank" in p)
        .map((p) => p.blank);
    q.values = values;
    q.results = answers.map((a, i) => isCorrect(a, values[i]));
    q.score = q.results.filter(Boolean).length;
    q.checked = true;
    if (q.best == null || q.score > q.best) {
        q.best = q.score;
        Object.assign(q.song, { best: q.score, total: q.total });
        await saveSong(q.song);
        state.playlist = await listSongs();
    }
    render();
}

function stopQueue() {
    queueAudio?.pause();
    queueAudio = null;
    state.queue = null;
}

function playAt(at) {
    const queue = state.queue;
    if (!queue || at >= queue.ids.length) {
        stopQueue();
        return render();
    }
    queue.at = at;
    const song = state.playlist.find((s) => s.id === queue.ids[at]);
    queueAudio = new Audio(urlFor(song));
    queueAudio.onended = () => playAt(at + 1);
    queueAudio.play().catch(() => {});
    render();
}

const actions = {
    signin: () => signIn().catch(fail),
    signout() {
        signOut();
        stopQueue();
        Object.assign(state, { screen: "landing", pollen: null, song: null });
        render();
    },
    tab({ t }) {
        state.tab = t;
        render();
    },
    example({ i }) {
        const box = document.getElementById("notes");
        box.value = EXAMPLES[Number(i)];
        state.notes = box.value;
    },
    make: makeSong,
    quiz: ({ id }) => startQuiz(id),
    check: checkQuiz,
    retry: () => startQuiz(state.quiz.song.id),
    back() {
        state.screen = "studio";
        render();
    },
    open({ id }) {
        state.song = state.playlist.find((s) => s.id === id);
        state.tab = "make";
        stopQueue();
        render();
    },
    async remove({ id }) {
        await deleteSong(id);
        URL.revokeObjectURL(urls.get(id));
        urls.delete(id);
        if (state.song?.id === id) state.song = null;
        state.playlist = await listSongs();
        render();
    },
    playall() {
        state.queue = { ids: state.playlist.map((s) => s.id), at: 0 };
        playAt(0);
    },
    stop() {
        stopQueue();
        render();
    },
};

$app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (el && !el.disabled) actions[el.dataset.act]?.(el.dataset);
});
$app.addEventListener("input", (e) => {
    if (e.target.id === "notes") state.notes = e.target.value;
});
$app.addEventListener("change", (e) => {
    if (e.target.name === "style") {
        state.style = e.target.value;
        for (const l of document.querySelectorAll(".style"))
            l.classList.toggle("on", l.querySelector("input").checked);
    }
});
$app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("input.blank")) {
        const all = [...document.querySelectorAll("input.blank")];
        const next = all[all.indexOf(e.target) + 1];
        if (next) next.focus();
        else actions.check();
    }
});

(async () => {
    try {
        await completeSignIn();
    } catch (e) {
        state.error = e.message;
    }
    if (getSession()) {
        state.screen = "studio";
        state.playlist = await listSongs();
        refreshPollen();
    }
    render();
})();
