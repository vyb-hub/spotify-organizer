const { saveToken } = require("./tokenStore");

const SCOPES = [
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

// Read per-call (not frozen at module load) — overridable for tests, which point these at a
// local mock server instead of real Spotify.
function accountsBase() {
  return process.env.SPOTIFY_ACCOUNTS_BASE || "https://accounts.spotify.com";
}
function apiBase() {
  return process.env.SPOTIFY_API_BASE || "https://api.spotify.com/v1";
}

class SpotifyAuthError extends Error {}
class SpotifyApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function getAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope: SCOPES,
    state,
  });
  return `${accountsBase()}/authorize?${params.toString()}`;
}

function basicAuthHeader() {
  return Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
}

async function parseErrorBody(res) {
  const text = await res.text().catch(() => "");
  try {
    const json = JSON.parse(text);
    return json.error_description || json.error?.message || json.error || text;
  } catch {
    return text || res.statusText;
  }
}

async function fetchOrThrow(url, opts, networkErrorHint) {
  try {
    return await fetch(url, opts);
  } catch (e) {
    throw new SpotifyAuthError(
      `${networkErrorHint} (${e.message}). Check your internet connection and try again.`
    );
  }
}

async function exchangeCodeForTokens(code) {
  const res = await fetchOrThrow(
    `${accountsBase()}/api/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuthHeader()}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
    },
    "Couldn't reach Spotify to complete login"
  );
  if (!res.ok) {
    const detail = await parseErrorBody(res);
    throw new SpotifyAuthError(
      `Spotify rejected the login (${res.status}): ${detail}. ` +
        `Double-check SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET in .env, and that the redirect URI ` +
        `in your Spotify app settings matches SPOTIFY_REDIRECT_URI exactly.`
    );
  }
  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

async function refreshAccessToken(refreshToken) {
  const res = await fetchOrThrow(
    `${accountsBase()}/api/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuthHeader()}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    },
    "Couldn't reach Spotify to refresh your session"
  );
  if (!res.ok) {
    const detail = await parseErrorBody(res);
    throw new SpotifyAuthError(
      `Your saved Spotify login is no longer valid (${res.status}: ${detail}). ` +
        `Delete .token.json and run "node cli.js login" again.`
    );
  }
  return res.json();
}

class SpotifyClient {
  constructor(token) {
    if (!token || !token.accessToken || !token.refreshToken) {
      throw new SpotifyAuthError(
        ".token.json is missing or corrupted. Delete it and run \"node cli.js login\" again."
      );
    }
    this.token = token;
  }

  async ensureFreshToken() {
    if (Date.now() < this.token.expiresAt - 30_000) return;
    const refreshed = await refreshAccessToken(this.token.refreshToken);
    this.token.accessToken = refreshed.access_token;
    this.token.expiresAt = Date.now() + refreshed.expires_in * 1000;
    if (refreshed.refresh_token) this.token.refreshToken = refreshed.refresh_token;
    saveToken(this.token);
  }

  async request(path, opts = {}, _retries = 0) {
    await this.ensureFreshToken();
    const res = await fetchOrThrow(
      `${apiBase()}${path}`,
      {
        ...opts,
        headers: {
          Authorization: `Bearer ${this.token.accessToken}`,
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
      },
      "Couldn't reach Spotify"
    );

    if (res.status === 429) {
      if (_retries >= 5) {
        throw new SpotifyApiError(
          "Spotify keeps rate-limiting this request even after retrying. Wait a few minutes and try again.",
          429
        );
      }
      const retryAfter = Number(res.headers.get("Retry-After") || "1");
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      return this.request(path, opts, _retries + 1);
    }

    if (res.status === 401) {
      throw new SpotifyAuthError(
        'Your Spotify session expired or was revoked (401). Run "node cli.js login" again.'
      );
    }
    if (res.status === 403) {
      const detail = await parseErrorBody(res);
      throw new SpotifyApiError(
        `Spotify refused this request (403: ${detail}). If your Spotify app is in Development ` +
          `Mode, make sure this account was added under the app's "User Management" tab in the ` +
          `Spotify Developer Dashboard.`,
        403
      );
    }
    if (res.status === 404) {
      const detail = await parseErrorBody(res);
      throw new SpotifyApiError(`Spotify couldn't find that (404: ${detail}).`, 404);
    }
    if (!res.ok) {
      const detail = await parseErrorBody(res);
      throw new SpotifyApiError(`Spotify API error ${res.status}: ${detail}`, res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  getMe() {
    return this.request("/me");
  }

  async getAllLikedSongs(onProgress) {
    const tracks = [];
    let url = "/me/tracks?limit=50";
    while (url) {
      const page = await this.request(url);
      for (const item of page.items) {
        if (!item.track) continue;
        tracks.push({
          id: item.track.id,
          name: item.track.name,
          artist: (item.track.artists || []).map((a) => a.name).join(", "),
          added_at: item.added_at,
        });
      }
      if (onProgress) onProgress(tracks.length, page.total);
      url = page.next ? page.next.replace(apiBase(), "") : null;
    }
    return tracks;
  }

  async unlikeTracks(ids) {
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      await this.request("/me/tracks", { method: "DELETE", body: JSON.stringify({ ids: chunk }) });
    }
  }

  createPlaylist(userId, name, description, isPublic) {
    return this.request(`/users/${userId}/playlists`, {
      method: "POST",
      body: JSON.stringify({ name, description, public: isPublic }),
    });
  }

  async addTracksToPlaylist(playlistId, trackIds) {
    for (let i = 0; i < trackIds.length; i += 100) {
      const chunk = trackIds.slice(i, i + 100).map((id) => `spotify:track:${id}`);
      await this.request(`/playlists/${playlistId}/tracks`, {
        method: "POST",
        body: JSON.stringify({ uris: chunk }),
      });
    }
  }
}

module.exports = {
  getAuthorizeUrl,
  exchangeCodeForTokens,
  SpotifyClient,
  SpotifyAuthError,
  SpotifyApiError,
};
