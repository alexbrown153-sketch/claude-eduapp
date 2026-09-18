// Client for the suggestion relay (see worker/README.md) — the one place the
// app talks to a server.
//
// Deliberate exception to this project's offline-first rule, alongside the
// pdf.js CDN script: committing to GitHub needs a credential, and a static
// page has nowhere safe to keep one. The relay holds the GitHub token; the
// app holds only an app key that can append one line to the roadmap file.
//
// Everything here is optional and best-effort. A suggestion is saved locally
// first and only then pushed, so the Suggestions screen works exactly as it
// did before when the relay isn't set up, the iPad is offline, or the request
// fails — the suggestion just stays "not sent yet" and can be retried.

export function isSyncConfigured(config) {
  return Boolean(config && config.workerUrl && config.appKey);
}

// Resolves to the item number GitHub actually assigned, which is the number
// in the file — not the provisional one the app guessed offline.
export async function pushSuggestion(config, text) {
  let url;
  try {
    url = new URL(config.workerUrl);
  } catch {
    throw new Error('That relay address doesn’t look like a web address.');
  }
  // The app key is a bearer credential; refuse to send it over plain http to
  // anywhere but a local test server.
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('The relay address must start with https://');
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Key': config.appKey },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Offline, DNS failure, or the relay's CORS rules rejected this origin —
    // the browser reports all of these the same way.
    throw new Error('Couldn’t reach GitHub. Saved here instead — try sending again later.');
  }

  if (!response.ok) throw new Error(messageForStatus(response.status));

  const data = await response.json().catch(() => ({}));
  if (!Number.isFinite(data.number)) throw new Error('The relay replied with something unexpected.');
  return { number: data.number, text: typeof data.text === 'string' ? data.text : text };
}

function messageForStatus(status) {
  if (status === 401) return 'The app key was rejected. Check it in Settings.';
  if (status === 403) return 'This app isn’t on the relay’s allowed list.';
  if (status === 507) return 'The roadmap file is full — it needs tidying up.';
  return 'GitHub couldn’t be updated just now. Saved here — try sending again later.';
}
