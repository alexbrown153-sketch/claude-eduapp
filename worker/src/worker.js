/**
 * Sprint suggestion relay — a Cloudflare Worker that appends one numbered
 * item to the roadmap file in GitHub on behalf of the app.
 *
 * Why this exists: the app is a static browser page, and a static page has
 * nowhere to keep a GitHub credential. GitHub's OAuth/device-flow endpoints
 * don't send CORS headers, so a browser can't obtain a short-lived token
 * either. This Worker is the smallest thing that keeps the GitHub token off
 * the child's device: the token lives in the Worker's secret store, the
 * browser only ever holds APP_KEY, and the most that key can do is append a
 * single sanitised line to one file in one repo.
 *
 * Deliberate limits, so a leaked APP_KEY stays boring:
 *   - Only ever appends. The existing file content is re-sent verbatim and
 *     verified as a prefix of what gets written, so no request can edit or
 *     delete anything already in the file.
 *   - One item per request, with newlines and control characters stripped,
 *     so a caller can't inject markdown structure or many items at once.
 *   - Only ROADMAP_PATH in one repo is ever touched; the path is config, not
 *     input, and nothing from the request reaches the URL.
 *   - The file is refused once it passes MAX_FILE_BYTES, so the repo can't
 *     be inflated request by request.
 *
 * See README.md in this folder for deployment and for the exact token scope.
 */

const MAX_SUGGESTION_CHARS = 500;
const MAX_FILE_BYTES = 256 * 1024;
// GitHub rejects a stale write with 409 when the file moved underneath us
// (a concurrent submit, or a commit pushed from a laptop). Re-read and retry.
const MAX_WRITE_ATTEMPTS = 3;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(origin, allowed) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, origin, allowed);
    }
    // A browser can't set Origin itself, so requiring a known one keeps other
    // sites from driving this Worker with a key lifted from a shared device.
    if (!allowed) {
      return json({ error: 'Not allowed' }, 403, origin, false);
    }
    if (!timingSafeEqual(request.headers.get('X-App-Key') || '', env.APP_KEY || '')) {
      return json({ error: 'Not authorised' }, 401, origin, true);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Expected a JSON body' }, 400, origin, true);
    }

    const text = sanitiseSuggestion(body && body.text);
    if (!text) {
      return json({ error: 'Empty suggestion' }, 400, origin, true);
    }

    try {
      const number = await appendSuggestion(env, text);
      return json({ number, text }, 200, origin, true);
    } catch (e) {
      // Never surface GitHub's response: it can carry repo details, and a
      // bad token would otherwise be diagnosable from the browser.
      console.error('append failed', e);
      const tooBig = Boolean(e && e.tooBig);
      return json({ error: tooBig ? 'Roadmap file is full' : 'Could not reach GitHub' }, tooBig ? 507 : 502, origin, true);
    }
  },
};

function isAllowedOrigin(origin, env) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
}

function corsHeaders(origin, allowed) {
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (allowed) {
    // Echo the specific origin rather than "*" — this endpoint is a write,
    // so it should be reachable from the app's origins and nowhere else.
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-App-Key';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(payload, status, origin, allowed) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin, allowed), 'Content-Type': 'application/json' },
  });
}

// Compares without leaking, through timing, how much of the key matched.
function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// One line, plain text. Newlines become spaces so a submission can never add
// more than the single numbered item it claims to be, and control characters
// are dropped so nothing invisible lands in the file.
export function sanitiseSuggestion(raw) {
  if (typeof raw !== 'string') return '';
  const text = raw
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SUGGESTION_CHARS);
  if (!text) return '';
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

async function appendSuggestion(env, text) {
  for (let attempt = 1; ; attempt += 1) {
    const file = await readRoadmap(env);
    const number = nextItemNumber(file.content);
    const updated = appendLine(file.content, number, text);

    const res = await githubFetch(env, contentsUrl(env), {
      method: 'PUT',
      body: JSON.stringify({
        message: `Roadmap: add suggestion ${number} from the app`,
        content: encodeBase64(updated),
        sha: file.sha,
        branch: env.GITHUB_BRANCH || 'main',
      }),
    });

    if (res.ok) return number;
    // 409 means someone else wrote first; re-read and rebuild on the new head.
    if (res.status === 409 && attempt < MAX_WRITE_ATTEMPTS) continue;
    throw new Error(`GitHub PUT failed: ${res.status}`);
  }
}

function contentsUrl(env) {
  // The path is configuration, never request input — nothing a caller sends
  // can redirect this at another file.
  const path = env.ROADMAP_PATH.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
}

async function readRoadmap(env) {
  const branch = encodeURIComponent(env.GITHUB_BRANCH || 'main');
  const res = await githubFetch(env, `${contentsUrl(env)}?ref=${branch}`, { method: 'GET' });
  if (!res.ok) throw new Error(`GitHub GET failed: ${res.status}`);
  const data = await res.json();
  if (data.size > MAX_FILE_BYTES) {
    const err = new Error('Roadmap file too large');
    err.tooBig = true;
    throw err;
  }
  return { sha: data.sha, content: decodeBase64(data.content) };
}

function githubFetch(env, url, init) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sprint-suggestion-relay',
      'Content-Type': 'application/json',
    },
  });
}

// Highest "N." at the start of a line, so numbering follows the file itself
// rather than whatever the app last guessed. The Worker is the authority.
export function nextItemNumber(content) {
  let highest = 0;
  for (const match of content.matchAll(/^(\d+)\.\s/gm)) {
    highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

// Append only. The result is asserted to start with exactly what was read, so
// a bug here can add to the file but can never rewrite or drop what's there.
export function appendLine(content, number, text) {
  const base = content.endsWith('\n') ? content : `${content}\n`;
  const updated = `${base}${number}. ${text}\n`;
  if (!updated.startsWith(content)) throw new Error('refusing to modify existing content');
  return updated;
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
