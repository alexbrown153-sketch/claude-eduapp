// Startup safety check (Roadmap #187). Each scenario loads a fresh copy of
// storage.js against a fake localStorage. Run: node --test tests
import { test } from 'node:test';
import assert from 'node:assert/strict';

const NS = 'sprint:v1:default';
let n = 0;

// Minimal localStorage: stored keys are own enumerable properties, as in a
// browser, so Object.keys(localStorage) works.
function fakeStore(initial = {}) {
  const store = {};
  Object.defineProperties(store, {
    getItem: { writable: true, value: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null) },
    setItem: { writable: true, value: (k, v) => { store[k] = String(v); } },
    removeItem: { writable: true, value: (k) => { delete store[k]; } },
  });
  Object.entries(initial).forEach(([k, v]) => { store[k] = v; });
  return store;
}
const snapshot = (store) => JSON.stringify(Object.entries(store).sort());

async function load(initial) {
  globalThis.localStorage = fakeStore(initial);
  const mod = await import(`../js/storage.js?case=${n += 1}`);
  return { store: globalThis.localStorage, ...mod };
}

const goodMeta = JSON.stringify({ profileId: 'default', totalPoints: 50 });
const healthy = { [`${NS}:meta`]: goodMeta, [`${NS}:mastery`]: '{}', [`${NS}:sessions`]: '[]' };

test('healthy profile and genuine first run are both fine', async () => {
  assert.equal((await load(healthy)).Storage.startupState(), 'ok');
  assert.equal((await load({})).Storage.startupState(), 'ok');
});

for (const [key, bad] of [
  ['meta', '{not json'], ['meta', '[]'], ['meta', 'null'],
  ['mastery', '{"arithmetic":'], ['mastery', '[1]'],
  ['sessions', 'oops'], ['sessions', '{}'], ['sessions', ''],
]) {
  test(`corrupt ${key} (${JSON.stringify(bad)}) shows the notice and writes nothing`, async () => {
    const { Storage, store } = await load({ ...healthy, [`${NS}:${key}`]: bad });
    assert.equal(Storage.startupState(), 'corrupt');
    const before = snapshot(store);
    // Everything the app might try to save at startup or after.
    Storage.markInitialised();
    Storage.setMeta({ x: 1 });
    Storage.setMastery({});
    Storage.addSession({ a: 1 });
    Storage.setBadges(['b']);
    Storage.clearInProgress();
    Storage.addPoints(10);
    assert.equal(snapshot(store), before);
  });
}

test('meta missing but progress existed shows the notice; marker alone counts too', async () => {
  const { Storage, store } = await load({ [`${NS}:mastery`]: '{}', [`${NS}:sessions`]: '[]' });
  assert.equal(Storage.startupState(), 'missing');
  const before = snapshot(store);
  Storage.setMeta({ x: 1 });
  assert.equal(snapshot(store), before);
  assert.equal((await load({ [`${NS}:initialised`]: '1' })).Storage.startupState(), 'missing');
});

test('non-core corruption keeps today\'s fallback', async () => {
  const { Storage } = await load({ ...healthy, [`${NS}:badges`]: '{{', [`${NS}:shop`]: 'x' });
  assert.equal(Storage.startupState(), 'ok');
  assert.deepEqual(Storage.getBadges(), []);
});

test('Start fresh salvages the raw text first, then gives a working new profile', async () => {
  const { Storage, store } = await load({ ...healthy, [`${NS}:sessions`]: 'garbage' });
  Storage.startFresh();
  const salvage = JSON.parse(store[`${NS}:corruptSalvage`]);
  assert.equal(salvage.raw.sessions, 'garbage');
  assert.equal(salvage.raw.meta, goodMeta);
  assert.equal(Storage.getMeta().totalPoints, 0);
  assert.deepEqual(Storage.getSessions(), []);
  assert.equal(store[`${NS}:initialised`], '1');
  Storage.addSession({ a: 1 }); // writes work again
  assert.equal(Storage.getSessions().length, 1);
});

test('Start fresh erases nothing if the salvage copy cannot be saved', async () => {
  const { Storage, store } = await load({ ...healthy, [`${NS}:sessions`]: 'garbage' });
  store.setItem = (k) => { if (k.endsWith('corruptSalvage')) throw new Error('quota'); };
  const before = snapshot(store);
  assert.throws(() => Storage.startFresh());
  assert.equal(snapshot(store), before);
});

test('a valid backup restores out of the notice; the salvage key is never backed up', async () => {
  const { Storage, store } = await load({ ...healthy, [`${NS}:meta`]: '{bad' });
  store[`${NS}:corruptSalvage`] = '{}';
  const file = {
    app: 'sprint', formatVersion: 1, profileId: 'default', schemaVersion: 1,
    data: { meta: { totalPoints: 7 }, mastery: {}, sessions: [] },
  };
  Storage.restoreBackup(file);
  assert.equal(Storage.getMeta().totalPoints, 7);
  assert.equal(Storage.buildBackup().data.corruptSalvage, undefined);
  assert.equal(Storage.buildBackup().data.initialised, undefined);
});

test('a progress reset leaves defaults and the marker, so it is not "missing" next time', async () => {
  const { Storage, store } = await load(healthy);
  Storage.resetAll();
  assert.equal(store[`${NS}:initialised`], '1');
  assert.ok(store[`${NS}:meta`]);
  globalThis.localStorage = fakeStore({ ...store });
  assert.equal((await import(`../js/storage.js?case=${n += 1}`)).Storage.startupState(), 'ok');
});

test('unavailable storage: no throw, practice can carry on', async () => {
  delete globalThis.localStorage;
  const { Storage } = await import(`../js/storage.js?case=${n += 1}`);
  assert.equal(Storage.startupState(), 'unavailable');
  assert.equal(Storage.markInitialised(), false);
  Storage.setMeta({ x: 1 }); // skipped quietly
  assert.equal(Storage.getMeta().profileId, 'default');
});
