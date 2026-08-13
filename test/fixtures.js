// Deterministic fake "Liked Songs" library used by the mock server / e2e tests.
// Deliberately includes: pagination (>100 tracks), exact duplicates, and a blank entry.

function buildFixtureTracks() {
  const tracks = [];
  let t = Date.parse("2024-01-01T00:00:00Z");
  const nextTime = () => new Date((t += 60_000)).toISOString();

  // Intentional duplicates (same name+artist, different Spotify ids/added_at).
  tracks.push({ id: "dupA-1", name: "Song One", artist: "Artist X", added_at: nextTime() });
  tracks.push({ id: "dupA-2", name: "Song One", artist: "Artist X", added_at: nextTime() });
  tracks.push({ id: "dupA-3", name: "Song One", artist: "Artist X", added_at: nextTime() });
  tracks.push({ id: "dupB-1", name: "Song Two", artist: "Artist Y", added_at: nextTime() });
  tracks.push({ id: "dupB-2", name: "Song Two", artist: "Artist Y", added_at: nextTime() });
  // Blank/unavailable entry.
  tracks.push({ id: "blank-1", name: "", artist: "", added_at: nextTime() });

  // 114 unique filler tracks so total = 120 (3 pages of 50/50/20).
  for (let i = 0; i < 114; i++) {
    tracks.push({ id: `uniq-${i}`, name: `Track ${i}`, artist: `Artist ${i}`, added_at: nextTime() });
  }
  return tracks;
}

const EXPECTED_DUPLICATE_IDS = ["dupA-2", "dupA-3", "dupB-2", "blank-1"];
const EXPECTED_TOTAL = 120;
const EXPECTED_TO_CLASSIFY = EXPECTED_TOTAL - EXPECTED_DUPLICATE_IDS.length; // 116

module.exports = { buildFixtureTracks, EXPECTED_DUPLICATE_IDS, EXPECTED_TOTAL, EXPECTED_TO_CLASSIFY };
