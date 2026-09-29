// The personal playlist: songs and their audio live in this browser's
// IndexedDB. If that is unavailable (some private windows), songs are kept
// in memory for the session instead, so the app still works.
const DB = "tunemory";
const STORE = "songs";

const memory = new Map();
let dbPromise = null;

function open() {
    dbPromise ??= new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB, 1);
            request.onupgradeneeded = () =>
                request.result.createObjectStore(STORE, { keyPath: "id" });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        } catch (e) {
            reject(e);
        }
    });
    return dbPromise;
}

async function tx(mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const result = work(t.objectStore(STORE));
        t.oncomplete = () => resolve(result.result);
        t.onerror = () => reject(t.error);
    });
}

async function withFallback(work, fallback) {
    try {
        return await work();
    } catch {
        return fallback();
    }
}

export const newId = () =>
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const saveSong = (song) =>
    withFallback(
        () => tx("readwrite", (s) => s.put(song)),
        () => memory.set(song.id, song),
    );

export async function listSongs() {
    const songs = await withFallback(
        () => tx("readonly", (s) => s.getAll()),
        () => [...memory.values()],
    );
    return songs.sort((a, b) => b.created - a.created);
}

export const deleteSong = (id) =>
    withFallback(
        () => tx("readwrite", (s) => s.delete(id)),
        () => memory.delete(id),
    );
