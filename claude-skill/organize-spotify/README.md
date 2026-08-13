# organize-spotify — Claude Skill

A portable Claude Code skill that organizes anyone's Spotify Liked Songs into genre and mood
playlists. Self-contained: the CLI it drives ships inside this folder (`scripts/`), so it
works from any directory once installed — no need to clone or `cd` into a separate project.

**No LLM API key needed.** Classification is done by Claude itself, inside your own Claude
Code session, using your existing subscription.

## Install

Copy this whole `organize-spotify/` folder into either:

- **Personal, works in every project:** `~/.claude/skills/organize-spotify/`
- **One specific project only:** `<that project>/.claude/skills/organize-spotify/`

```bash
mkdir -p ~/.claude/skills
cp -r organize-spotify ~/.claude/skills/
```

Then, one-time setup inside the installed copy:
```bash
cd ~/.claude/skills/organize-spotify/scripts
cp .env.example .env
# edit .env: fill in SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
#   from a free app at https://developer.spotify.com/dashboard
#   redirect URI must be exactly: http://127.0.0.1:8888/callback
npm install
```

Spotify apps in Development Mode only work for up to 25 explicitly-added accounts — add each
person's Spotify account email under the app's "User Management" tab before they log in.

## Use it

From any Claude Code session (any project, any directory), just ask:
> "Organize my Spotify library"

Claude will pick up this skill, walk you through `node cli.js login` (opens your browser,
one-time), fetch your Liked Songs, classify everything itself, show you a preview, and create
the playlists once you confirm.

## What lives where
Everything this skill needs or produces stays inside `scripts/` in this same installed
folder: `.env`, `.token.json` (your Spotify login — treat it like a password), `liked.json`,
`tagged.json`, `report.html`. Nothing is written into whatever project you happened to have
open.

## Updating
If you get a newer version of this skill, just replace the folder — or re-run
`npm install` inside `scripts/` if `package.json` changed. Your `.env` and `.token.json`
aren't touched by that.
