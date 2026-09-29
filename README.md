# Tunemory

Turn a fact, formula or word list into a short, catchy song, then quiz yourself on the lyrics. Paste your notes, pick a style, and get a sung 30-second track that keeps every fact and number. Songs collect in a personal study playlist in your browser.

**Try it:** https://tomdacatto.github.io/pollinations-tunemory/

Runs on [Pollinations](https://pollinations.ai) and is paid with the learner's own Pollen through [Bring Your Own Pollen](https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_POLLEN.md). No backend: the page talks to `gen.pollinations.ai` directly and the key lives in `sessionStorage` for that tab. A song costs about 0.04 Pollen (0.0002 for the lyrics, 0.04 for the singing).

## How it works

1. **Lyrics.** `openai/gpt-5.4-nano` turns the notes into 8 short, rhyming lines plus 5 to 8 keywords (`response_format: json_object`).
2. **Checked in code.** A song that garbles the notes is worse than no song, so [`checkSong`](songs.js) verifies the lyrics before they are sung: enough distinct, non-repeating lines that are short enough to sing, at least three short keywords that really appear in the lyrics, and **every number in your notes present in the lyrics** (dates and quantities are the easiest thing to get wrong). What code can repair is repaired (a keyword that is a whole sentence or missing from the lyrics is dropped); otherwise the model is asked again with the reason.
3. **Singing.** `google/lyria-3-clip-preview` sings the lyrics in the chosen style (pop, hip-hop, folk, lo-fi, rock, nursery rhyme, musical) as a 30-second MP3 with vocals. Running a generated song back through speech-to-text returns the lyrics that were asked for, dates included.
4. **Quiz.** [`makeBlanks`](songs.js) blanks out one keyword on up to six different lines. Answers are checked in code: case, accents and punctuation don't matter, one typo is forgiven in longer words, numbers must be exact, and wrong answers show the right one. Your best score is kept per song.
5. **Playlist.** Songs, lyrics and audio are stored in IndexedDB in your browser (in memory if that is unavailable), with Play, Quiz, Delete and Play all.

## Models

| Job | Endpoint / model |
| --- | --- |
| Lyrics (JSON) | `POST /v1/chat/completions`, `openai/gpt-5.4-nano` |
| Singing | `POST /v1/audio/speech`, `google/lyria-3-clip-preview` |

## Run it

Serve the folder with any static server. Sign-in needs the deployed URL (the App Key's redirect URI is `https://tomdacatto.github.io/pollinations-tunemory/`); to run your own copy, create an App Key at [enter.pollinations.ai/keys](https://enter.pollinations.ai/keys), register your URL as its redirect URI and put the key in `config.js`.

```bash
node --test songs.test.js
```

## Files

- `songs.js`, `songs.test.js`: prompts, lyric checks and repair, quiz blanks, answer marking
- `make.js`: the two AI calls (lyrics with retry, singing)
- `library.js`: the playlist in IndexedDB
- `pollen.js`: Bring Your Own Pollen sign-in (OAuth code + PKCE) and the Pollinations client
- `app.js`, `index.html`, `style.css`: the UI

MIT licensed.
