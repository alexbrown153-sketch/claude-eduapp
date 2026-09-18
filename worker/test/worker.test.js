// Tests for the suggestion relay. The point of most of these is the security
// behaviour: that a caller who has the app key still can't do anything beyond
// adding one clean line to the end of one file.
//
// Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { nextItemNumber, appendLine, sanitiseSuggestion } from '../src/worker.js';

const KEY = 'test-app-key';
const ORIGIN = 'https://sprint.example';

const ENV = {
  APP_KEY: KEY,
  GITHUB_TOKEN: 'ghp_not_a_real_token',
  GITHUB_REPO: 'someone/claude-eduapp',
  GITHUB_BRANCH: 'main',
  ROADMAP_PATH: 'Roadmap ideas and debug.md',
  ALLOWED_ORIGINS: `${ORIGIN}, http://localhost:8777`,
};

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const fromB64 = (s) => Buffer.from(s, 'base64').toString('utf8');

// Stands in for the GitHub Contents API, and records what was written.
function stubGitHub(initialContent, { putStatus = 200, failFirstPut = false } = {}) {
  const calls = { gets: [], puts: [] };
  let content = initialContent;
  let puts = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'GET') {
      calls.gets.push(String(url));
      return new Response(JSON.stringify({ sha: 'sha1', size: content.length, content: b64(content) }), { status: 200 });
    }
    puts += 1;
    const body = JSON.parse(init.body);
    calls.puts.push({ url: String(url), body, written: fromB64(body.content) });
    if (failFirstPut && puts === 1) return new Response('{}', { status: 409 });
    if (putStatus !== 200) return new Response('{"message":"secret internal detail"}', { status: putStatus });
    content = fromB64(body.content);
    return new Response('{}', { status: 200 });
  };
  return calls;
}

const post = (body, { key = KEY, origin = ORIGIN, method = 'POST' } = {}) =>
  worker.fetch(new Request('https://relay.example/', {
    method,
    headers: { 'Content-Type': 'application/json', ...(key === null ? {} : { 'X-App-Key': key }), ...(origin ? { Origin: origin } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }), ENV);

const ROADMAP = '80. Reset the question generation.\n81. add a "changes" section.\n82. On the main screen, add a "Suggestions" option.\n';

test('appends the next number and returns it', async () => {
  const calls = stubGitHub(ROADMAP);
  const res = await post({ text: 'add a dark mode' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { number: 83, text: 'Add a dark mode.' });
  assert.equal(calls.puts[0].written, `${ROADMAP}83. Add a dark mode.\n`);
});

test('numbering follows the file, not the caller', async () => {
  stubGitHub('1. one\n47. forty seven\n9. nine\n');
  const res = await post({ text: 'next please', });
  assert.equal((await res.json()).number, 48);
});

test('rejects a wrong app key', async () => {
  const calls = stubGitHub(ROADMAP);
  const res = await post({ text: 'sneaky' }, { key: 'wrong-key-xx' });
  assert.equal(res.status, 401);
  assert.equal(calls.puts.length, 0);
});

test('rejects a missing app key', async () => {
  const calls = stubGitHub(ROADMAP);
  const res = await post({ text: 'sneaky' }, { key: null });
  assert.equal(res.status, 401);
  assert.equal(calls.puts.length, 0);
});

test('rejects an unknown origin before checking the key', async () => {
  const calls = stubGitHub(ROADMAP);
  const res = await post({ text: 'sneaky' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal(calls.puts.length, 0);
});

test('rejects a request with no origin at all', async () => {
  stubGitHub(ROADMAP);
  const res = await post({ text: 'curl from anywhere' }, { origin: '' });
  assert.equal(res.status, 403);
});

test('rejects non-POST', async () => {
  stubGitHub(ROADMAP);
  assert.equal((await post(null, { method: 'GET' })).status, 405);
});

test('preflight echoes only the allowed origin', async () => {
  stubGitHub(ROADMAP);
  const ok = await post(null, { method: 'OPTIONS' });
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const bad = await post(null, { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), null);
});

test('a multi-line suggestion still becomes exactly one item', async () => {
  const calls = stubGitHub(ROADMAP);
  await post({ text: 'first idea\n84. injected second item\n\n85. and a third' });
  const added = calls.puts[0].written.slice(ROADMAP.length);
  assert.equal(added.split('\n').filter(Boolean).length, 1);
  assert.equal(added, '83. First idea 84. injected second item 85. and a third.\n');
});

test('control characters are stripped', async () => {
  const calls = stubGitHub(ROADMAP);
  await post({ text: 'bell and a zero width​ space' });
  assert.match(calls.puts[0].written.slice(ROADMAP.length), /^83\. Bell and a zero width space\.\n$/);
});

test('caps the suggestion length', async () => {
  const calls = stubGitHub(ROADMAP);
  await post({ text: 'x'.repeat(5000) });
  const added = calls.puts[0].written.slice(ROADMAP.length);
  assert.ok(added.length < 520, `line was ${added.length} chars`);
});

test('rejects an empty or non-string suggestion without writing', async () => {
  const calls = stubGitHub(ROADMAP);
  for (const text of ['', '   ', null, 42, { nested: 'object' }]) {
    assert.equal((await post({ text })).status, 400);
  }
  assert.equal(calls.puts.length, 0);
});

test('rejects a body that is not JSON', async () => {
  stubGitHub(ROADMAP);
  const res = await worker.fetch(new Request('https://relay.example/', {
    method: 'POST',
    headers: { 'X-App-Key': KEY, Origin: ORIGIN },
    body: 'not json at all',
  }), ENV);
  assert.equal(res.status, 400);
});

test('the request cannot redirect the write at another file', async () => {
  const calls = stubGitHub(ROADMAP);
  await post({ text: 'hello', path: '../../.github/workflows/deploy.yml', repo: 'someone/other' });
  assert.equal(calls.puts.length, 1);
  assert.ok(calls.puts[0].url.endsWith('/repos/someone/claude-eduapp/contents/Roadmap%20ideas%20and%20debug.md'));
});

test('retries once when GitHub reports a conflicting write', async () => {
  const calls = stubGitHub(ROADMAP, { failFirstPut: true });
  const res = await post({ text: 'raced' });
  assert.equal(res.status, 200);
  assert.equal(calls.puts.length, 2);
});

test('does not leak GitHub error detail to the browser', async () => {
  stubGitHub(ROADMAP, { putStatus: 401 });
  const res = await post({ text: 'whatever' });
  assert.equal(res.status, 502);
  const body = await res.text();
  assert.doesNotMatch(body, /secret internal detail/);
  assert.doesNotMatch(body, /ghp_/);
});

test('refuses to write once the file is oversized', async () => {
  stubGitHub('1. x\n'.padEnd(300 * 1024, 'y'));
  const res = await post({ text: 'one more' });
  assert.equal(res.status, 507);
});

// --- the append-only guarantee, directly ---

test('appendLine never rewrites what was already there', () => {
  for (const before of ['', 'a\n', 'no trailing newline', '1. one\n2. two\n']) {
    const after = appendLine(before, 9, 'new item');
    assert.ok(after.startsWith(before), `lost content for ${JSON.stringify(before)}`);
    assert.equal(after.slice(before.length).includes('\n9. new item\n') || after.endsWith('9. new item\n'), true);
  }
});

test('nextItemNumber ignores numbers that are not list items', () => {
  assert.equal(nextItemNumber('1. one\nsee item 99 above\n2. two\n'), 3);
  assert.equal(nextItemNumber('no items here'), 1);
  assert.equal(nextItemNumber(''), 1);
});

test('sanitiseSuggestion tidies without changing meaning', () => {
  assert.equal(sanitiseSuggestion('  make   the timer bigger '), 'Make the timer bigger.');
  assert.equal(sanitiseSuggestion('Why not sounds?'), 'Why not sounds?');
  assert.equal(sanitiseSuggestion('already done.'), 'Already done.');
});
