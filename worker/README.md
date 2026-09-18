# Suggestion relay

A ~200-line Cloudflare Worker that lets the app append a suggestion to
`Roadmap ideas and debug.md` in GitHub. Everything else in Sprint stays a
static, offline browser app — this is the one piece that runs on a server, and
it exists for one reason: **so the GitHub token never touches the iPad.**

## Why a Worker at all

A static page has nowhere to hide a credential. `api.github.com` does send
`Access-Control-Allow-Origin: *`, so the browser *could* commit to the repo
directly — but only by storing a long-lived GitHub token in `localStorage`,
readable by anyone holding the unlocked device. GitHub's OAuth and
device-flow endpoints don't send CORS headers, so there's no way for a
browser-only app to get a short-lived token instead.

So the split is:

| Where | Holds | Worst case if stolen |
| --- | --- | --- |
| Worker secret store | the GitHub token | — (never leaves Cloudflare) |
| The child's browser | `APP_KEY` | someone can append junk lines to one file |

`APP_KEY` is a capability to *append one sanitised line to one file*, and
nothing else. That's the whole point of the design: the thing that is exposed
is the thing that barely matters.

## What the Worker will and won't do

- **Append only.** It re-sends the file it just read and asserts the new
  content starts with the old, so no request can edit or delete an existing
  line. A bug here can add rubbish; it can't destroy the roadmap.
- **One item per request.** Newlines and control characters are stripped, so
  a caller can't smuggle in extra numbered items or markdown structure.
- **One file.** The repo, branch and path are configuration. Nothing from the
  request reaches the URL.
- **Bounded.** 500 characters per suggestion, and it refuses to write once the
  file passes 256 KB.
- **Origin-locked.** Only the origins in `ALLOWED_ORIGINS` get past the front
  door, checked before the key is compared.
- **Quiet on failure.** GitHub's own error bodies are never returned to the
  browser.

It does *not* rate-limit by itself. If the endpoint ever gets found, add a
Cloudflare rate-limiting rule on the route — that's a dashboard setting, not
code.

## Deploy

1. **Create a fine-grained personal access token**
   (GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens):
   - Resource owner: your account
   - Repository access: **Only select repositories** → `claude-eduapp`
   - Permissions: **Contents: Read and write** — nothing else
   - Expiration: set one. 90 days is plenty; renewing is one command.

   Do not paste this token into any file in the repo. GitHub's secret
   scanning will revoke it, and rightly so.

2. **Pick an app key.** Any long random string:

   ```sh
   openssl rand -base64 32
   ```

3. **Configure and deploy:**

   ```sh
   cd worker
   npm install -g wrangler        # once
   wrangler login                 # once

   # edit wrangler.toml: set ALLOWED_ORIGINS to wherever the app is served
   wrangler secret put GITHUB_TOKEN   # paste the token from step 1
   wrangler secret put APP_KEY        # paste the key from step 2
   wrangler deploy
   ```

   `wrangler deploy` prints the Worker URL.

4. **Point the app at it:** in the app, Settings → *Send suggestions to
   GitHub* → paste the Worker URL and the app key. Submit a suggestion; it
   should appear as a new numbered line in the roadmap file within a second or
   two, committed as "Roadmap: add suggestion N from the app".

## If the app key leaks

Someone can append lines to the roadmap file. Nothing else — not the repo,
not other files, not history. Fix it with:

```sh
wrangler secret put APP_KEY    # new value
```

then update it in the app's Settings. Delete any junk lines from the roadmap
file in the normal way.

## Tests

```sh
cd worker && node --test
```

Covers the sanitiser, the numbering, the append-only guarantee, and the
request handling (auth, origin checks, method checks) against a stubbed
GitHub.
