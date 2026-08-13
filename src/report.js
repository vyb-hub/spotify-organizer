const fs = require("fs");
const path = require("path");

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function section(title, items, maxCount) {
  if (!items.length) return "";
  const rows = items
    .sort((a, b) => b.trackCount - a.trackCount)
    .map((p) => {
      const pct = Math.max(6, Math.round((p.trackCount / maxCount) * 100));
      const url = `https://open.spotify.com/playlist/${p.id}`;
      return `
        <a class="row" href="${url}" target="_blank" rel="noopener">
          <div class="row-top">
            <span class="row-name">${escapeHtml(p.name)}</span>
            <span class="row-count">${p.trackCount}</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        </a>`;
    })
    .join("\n");
  return `
    <section>
      <h2>${title}</h2>
      <div class="rows">${rows}</div>
    </section>`;
}

function generateHtmlReport({ totalLiked, duplicatesRemoved, created }) {
  const genrePlaylists = created.filter((p) => !p.name.startsWith("EDM Mood:"));
  const moodPlaylists = created.filter((p) => p.name.startsWith("EDM Mood:"));
  const maxCount = Math.max(1, ...created.map((p) => p.trackCount));
  const totalTagged = created.reduce((sum, p) => sum + p.trackCount, 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Spotify Library Organizer — Report</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fafafa; --fg: #16181d; --card: #ffffff; --border: #e7e7ea;
    --accent: #1db954; --accent2: #7c4dff; --muted: #6b6f76;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0e0f12; --fg: #f1f2f4; --card: #17181c; --border: #262830; --muted: #9a9ea6; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  }
  main { max-width: 880px; margin: 0 auto; padding: 56px 24px 96px; }
  h1 { font-size: 1.75rem; margin: 0 0 6px; letter-spacing: -0.02em; }
  .tagline { color: var(--muted); margin: 0 0 36px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 44px; }
  .stat {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    padding: 18px 16px;
  }
  .stat .num { font-size: 1.6rem; font-weight: 700; }
  .stat .label { color: var(--muted); font-size: 0.82rem; margin-top: 2px; }
  section { margin-bottom: 40px; }
  h2 {
    font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--muted); margin: 0 0 14px; font-weight: 700;
  }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .row {
    display: block; background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 12px 16px; text-decoration: none; color: var(--fg);
    transition: border-color 0.15s;
  }
  .row:hover { border-color: var(--accent); }
  .row-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .row-name { font-weight: 600; font-size: 0.95rem; }
  .row-count { color: var(--muted); font-size: 0.82rem; font-variant-numeric: tabular-nums; }
  .bar-track { height: 6px; border-radius: 999px; background: var(--border); overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
  footer { color: var(--muted); font-size: 0.8rem; text-align: center; margin-top: 48px; }
</style>
</head>
<body>
<main>
  <h1>🎧 Your library, organized</h1>
  <p class="tagline">Genre &amp; mood estimated by Claude — Spotify's API no longer exposes that data directly.</p>

  <div class="stats">
    <div class="stat"><div class="num">${totalLiked}</div><div class="label">Liked songs</div></div>
    <div class="stat"><div class="num">${duplicatesRemoved}</div><div class="label">Duplicates removed</div></div>
    <div class="stat"><div class="num">${created.length}</div><div class="label">Playlists created</div></div>
    <div class="stat"><div class="num">${totalTagged}</div><div class="label">Tracks organized</div></div>
  </div>

  ${section("By genre", genrePlaylists, maxCount)}
  ${section("By EDM mood", moodPlaylists, maxCount)}

  <footer>Generated locally by spotify-organizer — click any row to open it on Spotify.</footer>
</main>
</body>
</html>`;
}

function writeReport(outDir, data) {
  const html = generateHtmlReport(data);
  const outPath = path.join(outDir, "report.html");
  fs.writeFileSync(outPath, html);
  return outPath;
}

module.exports = { generateHtmlReport, writeReport };
