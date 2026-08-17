# Spotify Library Organizer

Turns anyone's Liked Songs into genre and mood playlists. **No LLM API key, no per-track
billing**: genre/mood classification is done by whichever Claude you run this with, inside a
Claude Code session, covered by your existing Claude subscription — not a separate paid API.

There are two ways to get this, depending on what you want:

| | **Standalone repo** (this folder) | **Claude Code plugin** (`claude-skill/`) |
|---|---|---|
| What it is | This whole project — CLI + an in-repo skill | An installable plugin containing the skill |
| Where it works | Only when this repo is open in Claude Code, or run by hand | Any project, any directory, once installed |
| Best for | Developing/testing this, or running the CLI yourself | Anyone who just wants to say "organize my Spotify" from anywhere |
| Setup | Clone + `npm install` here | `/plugin marketplace add vyb-hub/spotify-organizer` |

Both variants share the exact same underlying code — `claude-skill/skills/organize-spotify/scripts/`
contains a vendored copy of this repo's `cli.js` + `src/`, kept in sync via `./build-skill.sh`.

## What it does
1. Log in with Spotify once (OAuth via your browser — your credentials go to Spotify's login
   page, never through this code).
2. `fetch-liked` pulls your Liked Songs and finds exact duplicates.
3. Claude classifies each track's genre — and mood, for house/techno/trance-style tracks —
   using its own knowledge, since Spotify's API no longer returns genre or audio-feature data.
4. You review the proposed playlists.
5. `create-playlists` removes duplicate likes (if you asked for that) and creates the
   playlists on your account.

## Option A: run the standalone repo

### 1. Create a Spotify app (free)
- https://developer.spotify.com/dashboard → "Create app"
- Redirect URI: `http://127.0.0.1:8888/callback` (must match exactly)
- Copy the **Client ID** and **Client Secret**

Spotify apps in Development Mode only work for up to 25 explicitly-added users — add each
person's Spotify account email under the app's "User Management" tab before they log in.

### 2. Configure and install
```bash
cp .env.example .env
# edit .env: fill in SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET
npm install
```

### 3. Run it
With Claude Code: open this folder and ask it to organize your Spotify library — it picks up
the `organize-spotify` skill from `.claude/skills/` automatically.

By hand:
```bash
node cli.js login                    # opens your browser, one-time
node cli.js fetch-liked              # writes liked.json
# — have Claude (or do it yourself) read liked.json's "tracksToClassify" and write
#   tagged.json as [{ "id", "genre", "mood" }, ...] —
node cli.js create-playlists tagged.json --liked liked.json --min 10 --public --remove-duplicates
```

## Option B: install as a Claude Code plugin (easiest to share)

No cloning, no zip. From inside Claude Code:
```
/plugin marketplace add vyb-hub/spotify-organizer
/plugin install spotify-organizer@vyb-plugins
```
Then, from any Claude Code session in any directory: *"organize my Spotify library."*
Claude walks you through the one-time Spotify setup on first run.

Full details, plus a manual copy-the-folder alternative, in
[`claude-skill/skills/organize-spotify/README.md`](claude-skill/skills/organize-spotify/README.md).

## Testing
```bash
npm test
```
Runs the full pipeline (fetch → dedupe → classify → chunked playlist creation → report) plus
every error path (missing/malformed files, expired/revoked login, 403s, empty results, etc.)
against a local mock Spotify server — no real account or network access to Spotify needed.

## Sharing this with a friend
Easiest: send them the two `/plugin` commands in Option B above — nothing to clone or unzip.

They'll need their own free Spotify Developer app (or you add their Spotify account email to
yours under "User Management") and their own Claude subscription. No hosting, no shared
credentials, no API billing on your side — everything runs locally against their own Spotify
account.

## Maintainers: keeping both variants in sync
If you change `cli.js` or anything in `src/`, re-run:
```bash
./build-skill.sh
```
This re-vendors the CLI into `claude-skill/skills/organize-spotify/scripts/` so the skill package
doesn't drift from the standalone version.

## Notes
- `.token.json` stores your Spotify refresh token locally — never commit it (it's gitignored).
- `--min` controls the minimum tracks for a genre to get its own playlist (default 10).
- Mood playlists are only generated for house/techno/trance-adjacent genres.
