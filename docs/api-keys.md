# API keys

An API key lets a tool call your apps without a browser session: Home Assistant, a script, an iOS Shortcut, or an
MCP server that wraps these routes. It is an alternative to the sign-in token, not a separate API: a key goes to the
**same routes the web app uses** (`/api/xennote/...`, `/api/xendrive/...`).

## Create one
Profile → Profile tab → **API Keys** → *New key*. Pick a name, optionally limit it to some apps, make it read-only,
or give it an expiry. The key (`xd_...`) is shown **once**; the hub stores only its hash. Revoke it from the same
list and it stops working immediately. Up to 20 keys per account.

## Use one
```bash
curl -H "Authorization: Bearer xd_YOUR_KEY" https://your-hub/api/xennote/notebooks
```
Responses use the usual `{ status, message, data }` envelope. The key acts as you: it can see exactly what you can
(your own things plus whatever is shared with you), nothing more.

## What a key can reach
- Routes of the apps on the allowlist in `src/shared/apiKeys.ts` (`API_KEY_APPS`), limited to the apps chosen on the
  key, and `GET /api/user/profile` as a "who am I" check.
- **Never**: sign-in and account routes, key management, the shop, push, admin. They answer `403`.
- A *read-only* key may only send `GET`/`HEAD`.
- A bad, revoked or expired key is `401`. A key is rate limited on its own (600 requests / 15 minutes).

Adding a sub-app? Add its key and path prefixes to `API_KEY_APPS`, or keys can't reach it (a test fails if an app in
the client registry is missing).

## Home Assistant
```yaml
rest:
  - resource: https://your-hub/api/xenroutine/routines
    headers:
      Authorization: "Bearer xd_YOUR_KEY"
    scan_interval: 600
    sensor:
      - name: "XenRoutine routines"
        value_template: "{{ value_json.data.routines | length }}"

rest_command:
  add_note:
    url: https://your-hub/api/xennote/notes
    method: post
    headers:
      Authorization: "Bearer xd_YOUR_KEY"
      Content-Type: application/json
    payload: '{"title": "{{ title }}"}'
```
Check each route's body in the app's route file before relying on a payload.

## MCP
A small MCP server can expose chosen routes as tools and pass the key as the bearer token. Nothing server-side is
needed beyond the key.
