---
name: organize-spotify
description: Organize the current user's Spotify Liked Songs into genre and mood playlists. Use when the user asks to organize, clean up, or sort their Spotify library/liked songs into playlists by genre or mood.
---

# Organize Spotify

This skill runs the `spotify-organizer` CLI in the current project and does the genre/mood
classification yourself (no external LLM API — you're doing the classification, using your
own music knowledge, the same way a human curator would).

Spotify's API no longer returns genre or audio-feature/mood data for tracks or artists, so
every tag here is an estimate from track/artist name recognition — say so if the user asks
where the data came from.

## Steps

1. **Check login.** If `.token.json` doesn't exist in this project, tell the user to run
   `node cli.js login` themselves (it opens their browser for Spotify's login — don't try to
   do this for them, you can't see their browser). Wait for them to confirm it's done, or run
   it yourself with the Bash tool if you're able to open a browser in this environment.

2. **Fetch and dedupe.** Run:
   ```
   node cli.js fetch-liked
   ```
   This writes `liked.json` with `totalLiked`, `duplicateIdsToRemove`, and `tracksToClassify`
   (already deduped). Report the counts to the user, and ask whether they want the duplicates
   removed (unliked) — don't remove anything without asking.

3. **Classify every track in `tracksToClassify`.** For each track you need a `genre`, and a
   `mood` ONLY if the genre is an EDM/electronic sub-genre.

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
   tool**, split it into batches of ~150 and classify batches in parallel — each batch should
   return CSV or JSON of `id,genre,mood` in the same order it was given. If you don't have
   subagents available, just work through the list yourself in manageable chunks.

   Write the merged result as `tagged.json` — a JSON array of `{"id": "...", "genre": "...",
   "mood": "..."}` (mood is `""` when not applicable), one entry per track in
   `tracksToClassify`, same `id`s.

4. **Show the user a preview before touching anything.** Group `tagged.json` yourself (or just
   describe it) and tell the user: how many playlists would be created, by genre (only genres
   with 10+ tracks by default — ask if they want a different threshold) and by mood. Ask:
   - Should new playlists be public or private?
   - Should you remove the duplicates found in step 2?

5. **Apply.** Once confirmed, run:
   ```
   node cli.js create-playlists tagged.json --liked liked.json --min 10 [--public] [--remove-duplicates]
   ```
   Adjust `--min`, `--public`, `--remove-duplicates` based on the user's answers. Report the
   final list of created playlists and track counts back to the user.

## Notes
- Nothing here calls a paid LLM API — the classification in step 3 is you, running under the
  user's own Claude subscription.
- `.token.json` holds a live Spotify refresh token — treat it like a password, never display
  its contents, and don't commit it (it's in `.gitignore`).
- If the user has more than ~1,000 liked songs, warn them classification will take a while and
  offer to run it in the background while they do something else.
