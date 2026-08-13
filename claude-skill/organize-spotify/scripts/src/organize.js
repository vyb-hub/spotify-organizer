const EDM_GENRES = new Set([
  "Deep House", "Tech House", "Progressive House", "Organic House", "Techno",
  "Melodic House/Techno", "Psy-trance", "Electronic/Dance", "Electronic/Dance (generic)",
  "Nu-Disco", "Drum & Bass", "Synth-pop", "Synthwave", "Afro House", "Bass House",
  "Electro Swing",
]);

function norm(s) {
  return (s || "").trim().toLowerCase();
}

function findDuplicates(tracks) {
  const groups = new Map();
  for (const t of tracks) {
    const key = `${norm(t.name)}::${norm(t.artist)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const toUnlike = [];
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => new Date(a.added_at) - new Date(b.added_at));
    for (const dup of sorted.slice(1)) toUnlike.push(dup.id);
  }
  const blank = tracks.filter((t) => !t.name && !t.artist).map((t) => t.id);
  return [...new Set([...toUnlike, ...blank])];
}

class ValidationError extends Error {}

// Throws a specific, actionable message rather than a generic parse/shape error.
function validateTagged(tagged, path) {
  if (!Array.isArray(tagged)) {
    throw new ValidationError(
      `${path} should be a JSON array of {id, genre, mood} objects, but got ${typeof tagged}. ` +
        `See SKILL.md for the exact format Claude should write.`
    );
  }
  if (tagged.length === 0) {
    throw new ValidationError(`${path} is an empty array — nothing to build playlists from.`);
  }
  const badIndex = tagged.findIndex((t) => !t || typeof t.id !== "string" || !t.id);
  if (badIndex !== -1) {
    throw new ValidationError(
      `${path}[${badIndex}] is missing a valid "id" field. Every entry needs the track's ` +
        `Spotify id copied over from liked.json's "tracksToClassify".`
    );
  }
  const missingGenre = tagged.filter((t) => !t.genre || typeof t.genre !== "string");
  if (missingGenre.length) {
    throw new ValidationError(
      `${missingGenre.length} track(s) in ${path} are missing a "genre" string ` +
        `(e.g. id ${missingGenre[0].id}). Every track needs a genre — mood is optional.`
    );
  }
}

// taggedTracks: [{id, name, artist, genre, mood}] — genre/mood filled in by Claude, not this script.
function buildPlaylistPlan(taggedTracks, { minGenreCount = 10 } = {}) {
  const genreGroups = new Map();
  const moodGroups = new Map();
  for (const t of taggedTracks) {
    if (t.genre) {
      if (!genreGroups.has(t.genre)) genreGroups.set(t.genre, []);
      genreGroups.get(t.genre).push(t.id);
    }
    if (t.mood && EDM_GENRES.has(t.genre)) {
      if (!moodGroups.has(t.mood)) moodGroups.set(t.mood, []);
      moodGroups.get(t.mood).push(t.id);
    }
  }

  const genrePlaylists = [...genreGroups.entries()]
    .filter(([, ids]) => ids.length >= minGenreCount)
    .map(([genre, ids]) => ({ type: "genre", label: genre, trackIds: ids }));

  const moodPlaylists = [...moodGroups.entries()].map(([mood, ids]) => ({
    type: "mood",
    label: mood,
    trackIds: ids,
  }));

  return [...genrePlaylists, ...moodPlaylists];
}

async function createPlaylists(spotify, userId, plan, { isPublic = false } = {}) {
  const created = [];
  for (const p of plan) {
    const name = p.type === "genre" ? `${p.label} — Liked` : `EDM Mood: ${p.label} — Liked`;
    const description =
      p.type === "genre"
        ? "Auto-generated from Liked Songs. Genre estimated by Claude from artist/track knowledge (Spotify no longer provides genre tags via its API)."
        : "Auto-generated from EDM Liked Songs. Mood estimated by Claude from artist/track knowledge (Spotify no longer exposes audio-feature/mood data via its API).";
    const playlist = await spotify.createPlaylist(userId, name, description, isPublic);
    await spotify.addTracksToPlaylist(playlist.id, p.trackIds);
    created.push({ name, id: playlist.id, trackCount: p.trackIds.length });
  }
  return created;
}

module.exports = {
  findDuplicates,
  buildPlaylistPlan,
  createPlaylists,
  validateTagged,
  ValidationError,
  EDM_GENRES,
};
