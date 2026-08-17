const fs = require("fs");
const path = require("path");

const DEFAULT_TOKEN_PATH = path.join(__dirname, "..", ".token.json");

function tokenPath() {
  return process.env.SPOTIFY_ORGANIZER_TOKEN_PATH || DEFAULT_TOKEN_PATH;
}

function loadToken() {
  const p = tokenPath();
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  try {
    const token = JSON.parse(raw);
    if (!token.accessToken || !token.refreshToken || !token.expiresAt) {
      throw new Error("missing fields");
    }
    return token;
  } catch (e) {
    throw new Error(`${p} is corrupted (${e.message}). Delete it and run "node cli.js login" again.`);
  }
}

function saveToken(token) {
  fs.writeFileSync(tokenPath(), JSON.stringify(token, null, 2));
}

module.exports = { loadToken, saveToken, tokenPath };
