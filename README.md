# Reshaper web prototype

## Run locally

1. Install Node.js 18 or newer.
2. In this folder, run `npm start`.
3. Open `http://127.0.0.1:3000`.
4. Open **API settings**, select Gemini or OpenAI, and enter your own API key.
5. Upload a photo, choose a style, and generate.

The API key is kept in the browser page's memory and sent to the local Node process for each validation or generation request. The server does not write keys or images to disk. Each visitor brings their own key — there is no shared/server-stored provider key.

Generation is billed by the selected provider. Gemini supports `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, and `gemini-3-pro-image`. OpenAI uses `gpt-image-2` at medium quality.

## Admin panel (manage styles)

Styles (title, prompt, identity-mode, feature image) are stored in `data/styles.json` and served to the public page from `GET /api/styles`. Prompt text is never exposed to the public page — only `id`, `title`, and `imageUrl`.

**⚠️ `/admin` has no authentication.** Anyone who can reach the server can add, edit, or delete every style through `/admin` and `/admin/api/*` — there is no password, login, or session gate. This is intentional for local/single-user use, but it means you must not expose this server to the public internet as-is. If you deploy it anywhere reachable by others, put it behind your own access control (a reverse proxy with basic auth, a VPN, an IP allowlist, etc.) — don't rely on this codebase to gate `/admin` for you.

By default the server binds to `127.0.0.1` (not reachable from other machines). Set `HOST=0.0.0.0` (and put your own auth in front of it) if you need it reachable beyond localhost. `PORT` is also configurable via env var (default `3000`).

Notes:
- The `Standard` style (id `standard`) can be edited but not deleted — it's also the built-in fallback if a requested style is missing or disabled.
- `data/styles.json.bak` is kept as a backup after every successful save; if `data/styles.json` ever becomes corrupted, the public site keeps working (empty style list) but admin writes are blocked until you restore from the backup.
- `data/uploads/` holds feature images used by styles in this repo's own `data/styles.json` — if you fork this and add your own styles/images, review what you're committing.
