# Untangle

Paste (or photograph) any confusing bill, letter, or official notice — medical bills, insurance EOBs, collection notices, subscription disputes, government benefit letters — and get back:

1. A plain-language explanation of what it is and what it wants from you.
2. Red flags: billing errors, denials without reasons, suspicious deadlines, scam indicators.
3. A complete, editable draft response (dispute, appeal, or cancellation letter) ready to send.

This is a separate, standalone app — it shares no code with the `lumaball-eclipse` game and lives in this folder only because the session that built it couldn't provision a new GitHub repo. It is plain static files (no build step, no dependencies) and can be copied into its own repo at any time: copy this folder's contents to a new repo root and push.

## Running it

Any static file server works, e.g.:

```bash
cd untangle
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## How it works

- It's a single page (`index.html` + `style.css` + `app.js`), no framework, no build tool.
- Click the gear icon and paste an Anthropic API key (get one at [console.anthropic.com](https://console.anthropic.com/settings/keys)). The key is stored only in your browser's `localStorage` and is sent directly from your browser to `api.anthropic.com` — it never touches any server of ours.
- Calls `claude-opus-4-8` with extended thinking and a forced structured-output tool call, so the response always comes back as a typed `{ document_type, summary, red_flags, draft_response, suggested_next_steps }` object.

## Security note

This bring-your-own-key, browser-direct pattern is fine for personal use, since you're the only one who ever sees your own key. It is **not** suitable for a multi-user public product — anyone who opens devtools can read the key out of `localStorage`. A real public version of this app would need a small backend that holds the API key server-side and proxies requests.
