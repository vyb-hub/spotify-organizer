const http = require("http");
const crypto = require("crypto");
const { buildFixtureTracks } = require("./fixtures");

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// apiBase is filled in after the server starts listening (needs the port for "next" URLs).
function startMockServer() {
  const state = {
    unlikedIds: [],
    createdPlaylists: [], // { id, name, description, public, tracks: [] }
    tokenExchangeCount: 0,
    refreshCount: 0,
    likedRequestCount: 0,
    apiBase: "",
  };
  const tracks = buildFixtureTracks();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const auth = req.headers["authorization"] || "";

    // --- accounts.spotify.com/api/token ---
    if (url.pathname === "/api/token" && req.method === "POST") {
      const body = await readBody(req);
      const params = new URLSearchParams(body);
      const grantType = params.get("grant_type");

      if (grantType === "authorization_code") {
        state.tokenExchangeCount++;
        const code = params.get("code");
        if (code === "bad-code") {
          return json(res, 400, { error: "invalid_grant", error_description: "Invalid authorization code" });
        }
        return json(res, 200, {
          access_token: "access-token-1",
          refresh_token: "refresh-token-1",
          expires_in: 3600,
        });
      }
      if (grantType === "refresh_token") {
        state.refreshCount++;
        const refreshToken = params.get("refresh_token");
        if (refreshToken === "invalid-refresh-token") {
          return json(res, 400, { error: "invalid_grant", error_description: "Refresh token revoked" });
        }
        return json(res, 200, { access_token: "access-token-refreshed", expires_in: 3600 });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }

    // --- api.spotify.com/v1/* ---
    if (auth === "Bearer force-401") return json(res, 401, { error: { message: "The access token expired" } });
    if (auth === "Bearer force-403") {
      return json(res, 403, { error: { message: "User not added to app's allow list" } });
    }

    if (url.pathname === "/v1/me" && req.method === "GET") {
      return json(res, 200, { id: "test-user", display_name: "Test User" });
    }

    if (url.pathname === "/v1/me/tracks" && req.method === "GET") {
      state.likedRequestCount++;
      // Force one 429 on the very first page fetch to exercise retry logic.
      if (state.likedRequestCount === 1) {
        res.writeHead(429, { "Retry-After": "0" });
        return res.end();
      }
      const limit = Number(url.searchParams.get("limit")) || 50;
      const offset = Number(url.searchParams.get("offset")) || 0;
      const page = tracks.slice(offset, offset + limit);
      const items = page.map((t) => ({
        added_at: t.added_at,
        track: { id: t.id, name: t.name, artists: t.artist ? [{ name: t.artist }] : [] },
      }));
      const nextOffset = offset + limit;
      const next = nextOffset < tracks.length ? `${state.apiBase}/me/tracks?limit=${limit}&offset=${nextOffset}` : null;
      return json(res, 200, { items, next, total: tracks.length });
    }

    if (url.pathname === "/v1/me/tracks" && req.method === "DELETE") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if ((body.ids || []).length > 50) return json(res, 400, { error: { message: "Too many ids" } });
      state.unlikedIds.push(...(body.ids || []));
      return json(res, 200, {});
    }

    const playlistCreateMatch = url.pathname.match(/^\/v1\/users\/([^/]+)\/playlists$/);
    if (playlistCreateMatch && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const id = `pl-${crypto.randomBytes(4).toString("hex")}`;
      const playlist = { id, name: body.name, description: body.description, public: body.public, tracks: [] };
      state.createdPlaylists.push(playlist);
      return json(res, 201, { id, name: body.name });
    }

    const addTracksMatch = url.pathname.match(/^\/v1\/playlists\/([^/]+)\/tracks$/);
    if (addTracksMatch && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if ((body.uris || []).length > 100) return json(res, 400, { error: { message: "Too many uris" } });
      const playlist = state.createdPlaylists.find((p) => p.id === addTracksMatch[1]);
      if (!playlist) return json(res, 404, { error: { message: "Playlist not found" } });
      playlist.tracks.push(...(body.uris || []));
      return json(res, 201, { snapshot_id: "snap" });
    }

    return json(res, 404, { error: { message: `No mock route for ${req.method} ${url.pathname}` } });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      state.apiBase = `http://127.0.0.1:${port}/v1`;
      state.accountsBase = `http://127.0.0.1:${port}`;
      resolve({ server, state, stop: () => new Promise((r) => server.close(r)) });
    });
  });
}

module.exports = { startMockServer };
