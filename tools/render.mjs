// Renders the games' procedural music to audio/<game>/<track>.m4a.
// Needs: a local server whose root mirrors the site (/<repo>/... and /music-gallery/...), Chrome, ffmpeg,
// and puppeteer-core (point PPTR at its folder if it is not installed next to this file).
//   node tools/render.mjs --base http://127.0.0.1:8401 [--only SpireTide,Earthfall] [--track key] [--force]
// Specs are tools/games/<Folder>.json (see README.md). Results are logged to tools/render-log.json.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const BASE = arg('base', 'http://127.0.0.1:8401');
const ONLY = arg('only', '') ? arg('only').split(',') : null;
const ONLYTRACK = arg('track', '');
const FORCE = flag('force');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pptrDir = process.env.PPTR || path.join(here, 'node_modules', 'puppeteer-core');
const puppeteer = (await import(pathToFileURL(path.join(pptrDir, 'lib', 'esm', 'puppeteer', 'puppeteer-core.js')).href)).default;
const tmp = path.join(process.env.TEMP || '/tmp', 'mg-render');
fs.mkdirSync(tmp, { recursive: true });

const specDir = path.join(here, 'games');
const logPath = path.join(here, 'render-log.json');
const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {};

function wav(pcm, sr) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const specs = fs.readdirSync(specDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf8')))
  .filter((s) => (s.kind === 'procedural' || s.kind === 'mixed') && (!ONLY || ONLY.includes(s.folder)));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-gpu'] });
try {
  for (const spec of specs) {
    const outDir = path.join(root, 'audio', spec.lobbyId);
    for (const tr of spec.tracks.filter((t) => t.play && !t.sameAs)) {   // sameAs: identical song data in another game, rendered once there
      if (ONLYTRACK && tr.key !== ONLYTRACK) continue;
      const out = path.join(outDir, tr.key + '.m4a');
      const id = spec.lobbyId + '/' + tr.key;
      if (fs.existsSync(out) && !FORCE) { continue; }
      const dur = Math.max(20, Math.min(180, tr.renderSec || 75));
      const page = await browser.newPage();
      let res;
      try {
        await page.goto(`${BASE}/music-gallery/tools/render.html?dur=${dur}`, { waitUntil: 'load' });
        res = await page.evaluate((s, t) => window.__run(s, t), spec, tr);
        const chunks = [];
        const step = 3 << 20;
        for (let off = 0; off < res.bytes; off += step) chunks.push(Buffer.from(await page.evaluate((o, l) => window.__chunk(o, l), off, step), 'base64'));
        const w = path.join(tmp, 'r.wav');
        fs.writeFileSync(w, wav(Buffer.concat(chunks), res.sr));
        // gentle level matching: lift quiet songs so the peak is about -1 dB (at most +30 dB), fade the tail
        const gainDb = res.peak > 0 ? Math.min(30, Math.max(-6, 20 * Math.log10(0.89 / res.peak))) : 0;
        const fade = Math.min(4, dur / 10);
        fs.mkdirSync(outDir, { recursive: true });
        execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', w, '-af',
          `volume=${gainDb.toFixed(2)}dB,afade=t=in:d=0.05,afade=t=out:st=${(dur - fade).toFixed(2)}:d=${fade}`,
          '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
        const vd = spawnSync('ffmpeg', ['-hide_banner', '-i', out, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
        const mean = +((vd.match(/mean_volume: (-?[\d.]+)/) || [])[1]), max = +((vd.match(/max_volume: (-?[\d.]+)/) || [])[1]);
        log[id] = { dur, mean, max, peak: +res.peak.toFixed(4), clip: res.clip, gainDb: +gainDb.toFixed(1), made: res.made, errs: res.errs,
          ok: mean > -45 && res.clip < res.sr * 0.5 };
        if (!log[id].ok) fs.rmSync(out, { force: true });   // never keep a silent or broken render
        console.log(id, JSON.stringify(log[id]));
      } catch (e) {
        log[id] = { error: String(e).slice(0, 400), errs: res && res.errs };
        console.log(id, 'FAILED', String(e).slice(0, 200));
      } finally {
        await page.close();
        fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
      }
    }
  }
} finally {
  await browser.close();
}
