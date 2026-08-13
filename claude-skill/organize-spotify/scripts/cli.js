#!/usr/bin/env node
require("dotenv").config();
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const { execFile } = require("child_process");
const { URL } = require("url");

const {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  SpotifyClient,
  SpotifyAuthError,
  SpotifyApiError,
} = require("./src/spotify");
const { loadToken, saveToken } = require("./src/tokenStore");
const {
  findDuplicates,
  buildPlaylistPlan,
  createPlaylists,
  validateTagged,
  ValidationError,
} = require("./src/organize");
const { writeReport } = require("./src/report");
const ui = require("./src/ui");

function openBrowser(target) {
  if (process.env.SPOTIFY_ORGANIZER_NO_OPEN) return; // set by tests
  const opener =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  execFile(opener, [target], (err) => {
    if (err) ui.warn(`Couldn't open your browser automatically — open this yourself:\n    ${target}`);
  });
}

function readJsonOrThrow(filePath, whatFor) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ValidationError(
      `${filePath} isn't valid JSON (${e.message}). If ${whatFor} is still being written, wait ` +
        `for it to finish before running this command again.`
    );
  }
}

function requireEnv() {
  const missing = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    throw new ValidationError(
      `Missing env var(s): ${missing.join(", ")}.\n  Run: cp .env.example .env, then fill those ` +
        `in from your Spotify app at https://developer.spotify.com/dashboard`
    );
  }
}

function requireToken() {
  const token = loadToken(); // throws its own descriptive error if the file is corrupted
  if (!token) {
    throw new SpotifyAuthError('Not logged in yet. Run: node cli.js login');
  }
  return token;
}

const CALLBACK_HTML = (body, ok) => `<!doctype html>
<html><head><meta charset="utf-8" /><title>Spotify Organizer</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #0e0f12; color: #f1f2f4;
    display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; padding: 32px 40px; border-radius: 16px; background: #17181c; border: 1px solid #262830; }
  .icon { font-size: 2.5rem; margin-bottom: 8px; }
  p { color: #9a9ea6; }
</style></head>
<body><div class="card">
  <div class="icon">${ok ? "✅" : "❌"}</div>
  <h2>${ok ? "Logged in" : "Login failed"}</h2>
  <p>${body}</p>
</div></body></html>`;

// Resolves once login succeeds; rejects (never process.exit) on any failure, so callers —
// the real CLI entrypoint below, or tests — decide what to do with the outcome.
function cmdLogin() {
  requireEnv();
  ui.header("Spotify Login");
  const state = crypto.randomBytes(16).toString("hex");
  const port = Number(process.env.PORT) || 8888;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      server.close();
      fn(arg);
    };

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(CALLBACK_HTML("You can close this tab.", false));
        finish(
          reject,
          new SpotifyAuthError(
            `Spotify returned an error: "${error}". This usually means the login was cancelled, or ` +
              `this account hasn't been added under your Spotify app's "User Management" tab yet.`
          )
        );
        return;
      }
      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(CALLBACK_HTML("You can close this tab and try again.", false));
        finish(
          reject,
          new SpotifyAuthError(
            "Login callback didn't match what we expected (missing code or state mismatch). " +
              'Run "node cli.js login" again and don\'t reuse an old login link.'
          )
        );
        return;
      }

      try {
        const token = await exchangeCodeForTokens(code);
        saveToken(token);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(CALLBACK_HTML("You can close this tab and go back to the terminal.", true));
        ui.success("Logged in — credentials saved to .token.json");
        finish(resolve);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(CALLBACK_HTML("Something went wrong — check the terminal.", false));
        finish(reject, e);
      }
    });

    server.on("error", (e) => {
      if (e.code === "EADDRINUSE") {
        finish(
          reject,
          new Error(
            `Port ${port} is already in use, so the login callback server can't start.\n  Either ` +
              `stop whatever's using port ${port}, or set a different PORT in .env (and update the ` +
              `redirect URI in your Spotify app settings to match).`
          )
        );
      } else {
        finish(reject, new Error(`Couldn't start the local login server: ${e.message}`));
      }
    });

    server.listen(port, () => {
      const authUrl = getAuthorizeUrl(state);
      ui.info("Opening your browser to log in with Spotify...");
      ui.info(`If it doesn't open automatically:\n    ${ui.c.cyan(authUrl)}\n`);
      openBrowser(authUrl);
    });
  });
}

async function cmdFetchLiked(outPath = "liked.json") {
  const token = requireToken();
  const spotify = new SpotifyClient(token);
  ui.header("Fetching Liked Songs");
  const tracks = await spotify.getAllLikedSongs((done, total) => {
    ui.progressLine(done, total);
  });
  process.stdout.write("\n");

  if (tracks.length === 0) {
    ui.warn(
      "Your Liked Songs is empty — there's nothing to organize yet. Like some songs on " +
        "Spotify first, then run this again."
    );
    return;
  }
  ui.success(`Fetched ${ui.c.bold(tracks.length)} liked songs.`);

  const duplicateIdsToRemove = findDuplicates(tracks);
  const dupSet = new Set(duplicateIdsToRemove);
  const tracksToClassify = tracks
    .filter((t) => !dupSet.has(t.id))
    .map(({ id, name, artist }) => ({ id, name, artist }));

  const out = {
    fetchedAt: new Date().toISOString(),
    totalLiked: tracks.length,
    duplicateIdsToRemove,
    tracksToClassify,
  };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  ui.info(`${duplicateIdsToRemove.length} duplicate/blank entries found (excluded from classification).`);
  ui.success(`Wrote ${tracksToClassify.length} tracks to classify → ${ui.c.bold(outPath)}`);
  console.log(
    ui.c.dim(
      `\nNext: ask Claude to classify the tracks in ${outPath} (field "tracksToClassify") by genre ` +
        `(and mood, for house/techno/trance-style genres), and write the result as an array of ` +
        `{id, genre, mood} to tagged.json — see SKILL.md for the exact instructions.`
    )
  );
}

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { flags, positional };
}

async function cmdCreatePlaylists(args) {
  const { flags, positional } = parseFlags(args);
  const taggedPath = positional[0] || "tagged.json";
  const likedPath = flags.liked || "liked.json";
  const minGenreCount = Number(flags.min) || 10;
  const isPublic = !!flags.public;
  const removeDuplicates = !!flags["remove-duplicates"];

  ui.header("Create Playlists");

  if (!fs.existsSync(taggedPath)) {
    throw new ValidationError(
      `Can't find ${taggedPath}. Run "node cli.js fetch-liked" first, then have Claude classify ` +
        `the tracks and write ${taggedPath} — see SKILL.md.`
    );
  }
  const tagged = readJsonOrThrow(taggedPath, "the classification step");
  validateTagged(tagged, taggedPath);

  const token = requireToken();
  const spotify = new SpotifyClient(token);
  const me = await spotify.getMe();

  let totalLiked = tagged.length;
  let duplicatesRemoved = 0;

  if (removeDuplicates) {
    if (!fs.existsSync(likedPath)) {
      throw new ValidationError(
        `--remove-duplicates needs ${likedPath} (written by fetch-liked) to know which track IDs ` +
          `to unlike. Run "node cli.js fetch-liked" first, or drop --remove-duplicates.`
      );
    }
    const liked = readJsonOrThrow(likedPath, "fetch-liked's output");
    totalLiked = liked.totalLiked ?? totalLiked;
    duplicatesRemoved = liked.duplicateIdsToRemove?.length || 0;
    if (duplicatesRemoved) {
      ui.info(`Unliking ${duplicatesRemoved} duplicate/blank tracks...`);
      await spotify.unlikeTracks(liked.duplicateIdsToRemove);
      ui.success("Duplicates removed.");
    } else {
      ui.info("No duplicates were recorded in liked.json — nothing to unlike.");
    }
  }

  const plan = buildPlaylistPlan(tagged, { minGenreCount });

  if (plan.length === 0) {
    ui.warn(
      `No genre had ${minGenreCount}+ tracks, so no playlists would be created. Try a lower ` +
        `--min (e.g. --min 3), or double-check ${taggedPath} actually has varied genres in it.`
    );
    return;
  }

  ui.info(`Creating ${ui.c.bold(plan.length)} playlists (${isPublic ? "public" : "private"})...`);
  const created = await createPlaylists(spotify, me.id, plan, { isPublic });

  ui.header("Done");
  ui.table(created.map((p) => ({ name: p.name, count: p.trackCount })));

  const reportPath = writeReport(process.cwd(), { totalLiked, duplicatesRemoved, created });
  ui.success(`Report written → ${reportPath}`);
  openBrowser(reportPath);
}

function printUsage() {
  console.log(`Usage:
  node cli.js login                          Log in with Spotify (one-time, opens browser)
  node cli.js fetch-liked [out.json]         Fetch Liked Songs, find duplicates, write tracks to classify
  node cli.js create-playlists <tagged.json> [--liked liked.json] [--min 10] [--public] [--remove-duplicates]
                                              Create genre/mood playlists from Claude's classifications`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "login":
      return cmdLogin();
    case "fetch-liked":
      return cmdFetchLiked(rest[0]);
    case "create-playlists":
      return cmdCreatePlaylists(rest);
    case undefined:
    case "-h":
    case "--help":
    case "help":
      return printUsage();
    default:
      throw new ValidationError(`Unknown command "${cmd}". Run "node cli.js help" to see usage.`);
  }
}

function handleFatal(e) {
  ui.fail(e.message);
  if (process.env.DEBUG) console.error(e.stack);
  else if (!(e instanceof ValidationError)) ui.info("Set DEBUG=1 to see the full stack trace.");
  process.exit(1);
}

// Only run the CLI entrypoint when this file is executed directly (`node cli.js ...`) —
// requiring it from tests must not trigger main() against the real process.argv.
if (require.main === module) {
  main().catch(handleFatal);
}

module.exports = {
  cmdLogin,
  cmdFetchLiked,
  cmdCreatePlaylists,
  main,
  handleFatal,
};
