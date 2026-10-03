// Renders promo.html to promo.mp4: steps the animation frame by frame (so it is
// never janky), screenshots each frame, then encodes with ffmpeg. Usage:
//   node promo/render.mjs            full render (needs playwright + ffmpeg)
//   node promo/render.mjs 3 12 20    just write PNG stills at those seconds
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DUR = 30;
const out = process.env.OUT || '/tmp/promo-frames';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { window.__RECORDING = true; });
await page.goto('file://' + dir + '/promo.html');
const stills = process.argv.slice(2).map(Number);
if (stills.length) {
  for (const t of stills) {
    await page.evaluate((t) => render(t), t);
    await page.screenshot({ path: `${out}/still-${t}.png` });
  }
  await browser.close();
  process.exit(0);
}
const audio = process.env.AUDIO;
const args = ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
  ...(audio ? ['-i', audio] : []),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium',
  ...(audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
  '-movflags', '+faststart', path.join(dir, 'sprint-promo.mp4')];
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
for (let f = 0; f < FPS * DUR; f++) {
  await page.evaluate((t) => render(t), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
