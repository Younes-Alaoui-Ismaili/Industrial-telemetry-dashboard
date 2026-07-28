/**
 * Capture pipeline for the README media: the demo GIF and the still screenshots.
 *
 * Everything here is a development dependency and pure JavaScript. There is no
 * ffmpeg, no external binary and nothing on PATH to install, so the pipeline
 * runs the same way on a clean checkout and in CI.
 *
 *   node scripts/capture.mjs          both passes
 *   node scripts/capture.mjs gif      the demo GIF only
 *   node scripts/capture.mjs stills   the still screenshots only
 *
 * Requires a production build (`npm run build`); the script serves `dist/`
 * itself with `vite preview`, so the media shows the bundle a visitor gets and
 * not the dev server.
 *
 * Frame rate is not a taste decision. The simulator advances on a 2000 ms tick
 * (`TICK_MS` in src/constants/fleet.ts), trend animation is switched off, and
 * the only CSS transition in the project is a button hover. Nothing on screen
 * changes between two ticks, so one frame per tick is the highest rate that
 * carries information: any frame in between would be a byte for byte duplicate
 * paid for in file size. The two clicks are the exception, since they change
 * the screen immediately, so each one gets its own extra frame.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = gifenc;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CAPTURE_PORT ?? 4173);
const ORIGIN = `http://localhost:${PORT}/`;

/** Laid out at 1280 CSS px: the `xl` breakpoint, below which the alarm column drops under the grid. */
const LAYOUT = { width: 1280, height: 720 };
/** Rasterised at 0.8, so the frame is 1024x576 while the layout stays desktop. */
const GIF_SCALE = 0.8;
const PALETTE_SIZE = 128;
const TICK_MS = 2000;
const TARGET = 'PRESS-01';

const GIF_OUT = path.join(ROOT, 'docs', 'demo.gif');
const SHOTS_DIR = path.join(ROOT, 'docs', 'screenshots');

/** Absolute schedule, in ms from the first frame. Total: 38 frames over 70 s of wall clock. */
function buildPlan() {
  const plan = [];
  const shots = (from, to) => {
    for (let t = from; t <= to; t += TICK_MS) plan.push({ at: t, kind: 'shot' });
  };

  shots(0, 14000); // healthy fleet, 8 frames
  plan.push({ at: 15000, kind: 'inject' });
  plan.push({ at: 15200, kind: 'shot' }); // the click lands between two ticks
  shots(16000, 30000); // alarm raised and climbing, 8 frames
  plan.push({ at: 31000, kind: 'ack' });
  plan.push({ at: 31200, kind: 'shot' });
  shots(32000, 44000); // acknowledged, fault still inside its 30 s window, 7 frames
  shots(46000, 70000); // fault window closed, readings back to normal, 13 frames

  return plan.sort((a, b) => a.at - b.at);
}

function startPreview() {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  child.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  throw new Error(`vite preview never answered on ${ORIGIN}`);
}

async function openDashboard(browser, deviceScaleFactor) {
  const context = await browser.newContext({ viewport: LAYOUT, deviceScaleFactor });
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.getByRole('article', { name: new RegExp(`^${TARGET}`) }).waitFor();
  return { context, page };
}

const injectButton = (page) =>
  page.getByRole('article', { name: new RegExp(`^${TARGET}`) }).getByRole('button', { name: 'Inject fault' });
const ackButton = (page) => page.getByRole('button', { name: 'Ack', exact: true }).first();

async function captureGif(browser) {
  const { context, page } = await openDashboard(browser, GIF_SCALE);
  const plan = buildPlan();
  const frames = [];
  const started = Date.now();

  for (const step of plan) {
    const wait = started + step.at - Date.now();
    if (wait > 0) await sleep(wait);

    if (step.kind === 'shot') {
      frames.push({ at: Date.now(), png: await page.screenshot({ type: 'png' }) });
    } else if (step.kind === 'inject') {
      await injectButton(page).click();
    } else if (step.kind === 'ack') {
      const button = ackButton(page);
      if (await button.count()) await button.click();
      else throw new Error('no alarm to acknowledge: the injected fault never raised one');
    }
  }

  const wallClockMs = frames.at(-1).at - frames[0].at;
  await context.close();

  // Each frame is shown for the time that actually elapsed before the next one,
  // so the GIF runs at the speed of the recording. The last frame holds one tick.
  const delays = frames.map((frame, i) =>
    i === frames.length - 1 ? TICK_MS : frames[i + 1].at - frame.at,
  );

  return { frames: frames.map((f) => f.png), delays, wallClockMs };
}

/**
 * One global palette for the whole animation, built from frames spread across
 * the timeline so the alarm reds are represented and colours do not shift when
 * the fleet goes abnormal.
 */
function buildPalette(decoded) {
  const picks = [0, 8, 12, 17, 24, 30, decoded.length - 1].filter(
    (i, at, all) => i >= 0 && i < decoded.length && all.indexOf(i) === at,
  );
  const stride = 4 * 4; // every fourth pixel
  const perFrame = Math.floor(decoded[0].data.length / stride);
  const sample = new Uint8Array(picks.length * perFrame * 4);

  let out = 0;
  for (const index of picks) {
    const { data } = decoded[index];
    for (let p = 0; p + 3 < data.length; p += stride) {
      sample[out] = data[p];
      sample[out + 1] = data[p + 1];
      sample[out + 2] = data[p + 2];
      sample[out + 3] = 255;
      out += 4;
    }
  }

  return quantize(sample.subarray(0, out), PALETTE_SIZE);
}

async function encodeGif({ frames, delays }) {
  const decoded = frames.map((buffer) => PNG.sync.read(buffer));
  const { width, height } = decoded[0];
  const expected = [Math.round(LAYOUT.width * GIF_SCALE), Math.round(LAYOUT.height * GIF_SCALE)];
  if (width !== expected[0] || height !== expected[1]) {
    throw new Error(`frame is ${width}x${height}, expected ${expected[0]}x${expected[1]}`);
  }

  const palette = buildPalette(decoded);
  const gif = GIFEncoder();

  decoded.forEach((frame, i) => {
    const indexed = applyPalette(frame.data, palette);
    gif.writeFrame(indexed, width, height, {
      palette: i === 0 ? palette : undefined,
      repeat: i === 0 ? 0 : undefined,
      delay: delays[i],
    });
  });
  gif.finish();

  await mkdir(path.dirname(GIF_OUT), { recursive: true });
  const bytes = Buffer.from(gif.bytesView());
  await writeFile(GIF_OUT, bytes);

  return { width, height, count: decoded.length, bytes: bytes.length, paletteSize: palette.length };
}

async function captureStills(browser) {
  const { context, page } = await openDashboard(browser, 1);
  await mkdir(SHOTS_DIR, { recursive: true });

  const shoot = async (name) => {
    const file = path.join(SHOTS_DIR, name);
    await page.screenshot({ path: file, type: 'png', fullPage: true });
    return file;
  };

  const written = [];
  await sleep(6 * TICK_MS); // let the trends fill in
  written.push(await shoot('01-fleet-healthy.png'));

  await injectButton(page).click();
  await sleep(2 * TICK_MS); // the crossing is detected on the next tick
  written.push(await shoot('02-alarm-raised.png'));

  const button = ackButton(page);
  if (await button.count()) await button.click();
  await sleep(TICK_MS);
  written.push(await shoot('03-alarm-acknowledged.png'));

  await context.close();
  return written;
}

const mode = process.argv[2] ?? 'all';
const preview = startPreview();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch();

  if (mode === 'all' || mode === 'gif') {
    const captured = await captureGif(browser);
    const written = await encodeGif(captured);
    console.log(
      `demo.gif  ${written.count} frames  ${written.width}x${written.height}  ` +
        `palette ${written.paletteSize}  ${written.bytes} bytes  ` +
        `${(captured.wallClockMs / 1000).toFixed(1)} s recorded  ` +
        `${(captured.delays.reduce((a, b) => a + b, 0) / 1000).toFixed(1)} s playback`,
    );
  }

  if (mode === 'all' || mode === 'stills') {
    for (const file of await captureStills(browser)) {
      console.log(`still     ${path.relative(ROOT, file)}`);
    }
  }
} finally {
  await browser?.close();
  preview.kill();
}
