---
name: organize-spotify
description: Organize the current user's Spotify Liked Songs into genre and mood playlists. Use when the user asks to organize, clean up, or sort their Spotify library/liked songs into playlists by genre or mood.
---

# Organize Spotify

This skill is self-contained: the CLI it drives lives in `scripts/` right next to this file,
not in whatever project the user happens to have open. All setup (`.env`, `.token.json`,
`liked.json`, `tagged.json`, `report.html`) lives there too, so this works the same way
regardless of which directory the user is in when they ask for it.

Classification is done by you, using your own music knowledge — not an external LLM API.
Spotify's API no longer returns genre or audio-feature/mood data at all, so every tag here is
an estimate from track/artist name recognition. Say so if the user asks where the data came
from.

## Step 0 — locate this skill's own directory

Before running anything, find where this skill is actually installed on disk (it could be a
personal skill at `~/.claude/skills/organize-spotify/`, or a project-scoped one at
`<project>/.claude/skills/organize-spotify/`). One reliable way:
```
find ~/.claude/skills -maxdepth 1 -iname organize-spotify 2>/dev/null
find "$(git rev-parse --show-toplevel 2>/dev/null || pwd)/.claude/skills" -maxdepth 1 -iname organize-spotify 2>/dev/null
```
Whichever one exists, treat it as `$SKILL_DIR` — every command below runs with
`$SKILL_DIR/scripts` as the working directory (`cd "$SKILL_DIR/scripts"` first).

## Step 1 — one-time setup check

If `$SKILL_DIR/scripts/node_modules` doesn't exist, run `npm install` there first.

If `$SKILL_DIR/scripts/.env` doesn't exist: tell the user to `cp .env.example .env` inside
that folder and fill in `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` from a free app at
https://developer.spotify.com/dashboard (redirect URI must be exactly
`http://127.0.0.1:8888/callback`, or whatever `PORT` they set). Don't proceed until they
confirm this is done — running without it just fails with a clear error anyway.

## Step 2 — login

If `$SKILL_DIR/scripts/.token.json` doesn't exist, tell the user to run
`node cli.js login` themselves from that folder (it opens their browser for Spotify's login —
you can't see or click through their browser, so don't try to do this step for them). Wait
for their confirmation, or check for the file's existence yourself.

## Step 3 — fetch and dedupe

```
node cli.js fetch-liked
```
Writes `liked.json` with `totalLiked`, `duplicateIdsToRemove`, and `tracksToClassify` (already
deduped). Report the counts to the user, and ask whether they want the duplicates removed
(unliked) — don't remove anything without asking first.

## Step 4 — classify every track in `tracksToClassify`

For each track you need a `genre`, and a `mood` ONLY if the genre is an EDM/electronic
sub-genre.

Genre vocabulary (reuse these, don't invent near-duplicate labels unless nothing fits):
Indie/Alternative, Classic Rock, World, Deep House, Downtempo/Chill, Funk/Soul,
Electronic/Dance (generic), Organic House, Hip-Hop, Pop, Reggae, Tech House, Folk,
Psy-trance, Progressive House, Latin, Melodic House/Techno, Afrobeat, R&B, Jazz, Nu-Disco,
Techno, Country, Rock, Blues, Disco, Drum & Bass, Synth-pop, Ambient, Electro Swing,
Afro House, Bass House, Synthwave, Krautrock, Soundtrack, New Wave, Grunge, Latin Jazz,
Folk Rock, Indie Folk, Alternative Rock, Psychedelic Rock, Folk/Americana, Comedy.

Mood vocabulary (EDM/electronic genres only): Energetic/Driving, Euphoric/Uplifting,
Chill/Groovy, Dark/Intense, Melancholic/Moody, Dreamy/Ethereal, Playful/Quirky,
Sensual/Sultry, Hypnotic/Trippy.

**If `tracksToClassify` has more than ~150 tracks and you have access to a subagent/Task
tool**, split it into batches of ~150 and classify in parallel — each batch returns
`id,genre,mood` (CSV or JSON) in the same order it was given. Without subagents, just work
through it yourself in manageable chunks.

Write the merged result as `tagged.json` — a JSON array of `{"id": "...", "genre": "...",
"mood": "..."}` (mood is `""` when not applicable), one entry per track in
`tracksToClassify`, matching `id`s exactly.

## Step 5 — preview, then apply

Before touching anything, tell the user how many playlists would be created and by what
(genre, only for genres with 10+ tracks by default — ask if they want a different threshold;
and mood, for the EDM-adjacent genres). Ask: public or private? remove the duplicates found in
step 3?

Once confirmed:
```
node cli.js create-playlists tagged.json --liked liked.json --min 10 [--public] [--remove-duplicates]
```
Adjust flags per their answers. Report the final created playlists and track counts.

## Notes
- Nothing here calls a paid LLM API — step 4's classification is you, running under the
  user's own Claude subscription.
- `$SKILL_DIR/scripts/.token.json` holds a live Spotify refresh token — never display its
  contents, never commit it.
- If the user has more than ~1,000 liked songs, warn them classification will take a while.
