// End-to-end verification for the Moon Fingers replica.
// Drives headless Chrome over CDP: no npm dependencies required.
// Usage: node tools/verify-replica.mjs  (serve.mjs must already be running)
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4192';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.CDP_PORT || 9333);
const SHOTS = path.join(ROOT, 'screenshots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

await fs.mkdir(SHOTS, { recursive: true });
const report = { startedAt: new Date().toISOString(), base: BASE, checks: [], pages: {}, screenshots: [], errors: [], network: { external: [], failed: [], badStatus: [] } };
const failures = [];
function check(name, ok, detail = '') {
  report.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
}

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'moon-fingers-chrome-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
  '--no-default-browser-check', '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--window-size=1440,1000', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
chrome.stderr.on('data', () => {});

async function target() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(150);
  }
  throw Error('Chrome DevTools endpoint did not start');
}

const ws = new WebSocket(await target());
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let seq = 0;
const pending = new Map();
const listeners = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const p = pending.get(message.id);
    if (!p) return;
    pending.delete(message.id);
    message.error ? p.reject(Error(`${message.error.message} (${p.method})`)) : p.resolve(message.result);
  } else {
    for (const fn of listeners.get(message.method) || []) fn(message.params);
  }
};
function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const on = (event, fn) => listeners.set(event, [...(listeners.get(event) || []), fn]);

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('DOM.enable');

const requests = new Map();
on('Runtime.exceptionThrown', p => report.errors.push({ type: 'exception', text: p.exceptionDetails?.exception?.description || p.exceptionDetails?.text }));
on('Runtime.consoleAPICalled', p => { if (p.type === 'error') report.errors.push({ type: 'console', text: p.args.map(a => a.value ?? a.description).join(' ') }); });
on('Network.requestWillBeSent', p => {
  requests.set(p.requestId, p.request.url);
  if (!p.request.url.startsWith('http')) return;
  if (!p.request.url.startsWith(BASE)) report.network.external.push(p.request.url);
});
on('Network.loadingFailed', p => { if (!p.canceled) report.network.failed.push({ url: requests.get(p.requestId), error: p.errorText }); });
on('Network.responseReceived', p => {
  report.pages[p.requestId] = p.response.url;
  if (p.response.status >= 400) report.network.badStatus.push({ url: p.response.url, status: p.response.status });
});

async function evaluate(expression, awaitPromise = false) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (exceptionDetails) throw Error(exceptionDetails.exception?.description || exceptionDetails.text);
  return result.value;
}
async function waitFor(expression, label, timeout = 30000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try { const value = await evaluate(expression); if (value) return value; } catch (e) { last = e; }
    await sleep(150);
  }
  throw Error(`Timeout waiting for ${label}${last ? ': ' + last.message : ''}`);
}
async function shot(name, { full = false } = {}) {
  const params = { format: 'png', captureBeyondViewport: full };
  if (full) {
    const { cssContentSize: size } = await send('Page.getLayoutMetrics');
    params.clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
  }
  const { data } = await send('Page.captureScreenshot', params);
  const file = path.join(SHOTS, name);
  await fs.writeFile(file, Buffer.from(data, 'base64'));
  report.screenshots.push(name);
  console.log(`SHOT  ${name}`);
}
async function metrics(width, height, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
}
const KEYS = {
  A: { code: 'KeyA', key: 'a', vk: 65 }, S: { code: 'KeyS', key: 's', vk: 83 },
  D: { code: 'KeyD', key: 'd', vk: 68 }, F: { code: 'KeyF', key: 'f', vk: 70 },
  J: { code: 'KeyJ', key: 'j', vk: 74 }, K: { code: 'KeyK', key: 'k', vk: 75 },
  L: { code: 'KeyL', key: 'l', vk: 76 }, ';': { code: 'Semicolon', key: ';', vk: 186 },
};
async function press(key) {
  const k = KEYS[key];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: k.code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: k.code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk });
}
const snapshot = () => evaluate('window.moonlight.snapshot()');

try {
  await metrics(1440, 1000);
  await send('Page.navigate', { url: BASE + '/' });
  await waitFor(`window.moonlight && window.moonlight.snapshot().cues === 306`, 'song load', 30000);
  await sleep(900);

  const initial = await snapshot();
  report.initial = initial;
  check('built-in Clair de lune exposes 306 gesture cues', initial.cues === 306, `${initial.cues} cues`);
  check('built-in MIDI keeps all 1468 piano notes', initial.notes === 1468, `${initial.notes} notes`);
  check('page starts in guided mode, ready to play', initial.mode === 'guided' && initial.state === 'ready', `${initial.mode}/${initial.state}`);
  check('first cue matches score (Sol / A♭4 expected)', initial.cue?.slot === 4 && initial.cue?.midi === 68, JSON.stringify(initial.cue));
  const ui = await evaluate(`({title:document.querySelector('#song-title').innerText.trim(),counter:document.querySelector('#next-counter').textContent,details:document.querySelector('#song-details').textContent,duration:document.querySelector('#duration-label').textContent})`);
  check('song header and progress UI populated', ui.title.includes('月光') && ui.counter === '1 / 306' && ui.duration === '05:22', JSON.stringify(ui));
  await shot('01-guided-ready.png');

  // MIDI import + library dialog
  const midiFile = path.join(ROOT, 'dist', 'assets', 'clair-de-lune.mid');
  const { root: doc } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#midi-file' });
  await send('DOM.setFileInputFiles', { nodeId, files: [midiFile] });
  await waitFor(`document.querySelector('#library-dialog').open && document.querySelector('#imported-section') && !document.querySelector('#imported-section').hidden`, 'MIDI import dialog', 20000);
  const imported = await evaluate(`({options:document.querySelectorAll('#melody-track option').length,name:document.querySelector('#imported-name').textContent,notes:window.moonlight.snapshot().notes})`);
  check('imported MIDI parses and opens track picker', imported.options > 0 && imported.notes > 0, JSON.stringify(imported));
  await shot('02-library-import.png');
  await evaluate(`document.querySelector('#library-dialog').close()`);
  await evaluate(`document.querySelector('#library-button').click()`);
  await evaluate(`document.querySelector('#builtin-song').click()`);
  await waitFor(`document.querySelector('#song-title').innerText.includes('月光')`, 'builtin restore', 15000);
  await waitFor(`document.querySelector('#toast').hidden === true`, 'import toast dismissal', 8000);

  // Load piano samples and start guided transport
  await evaluate(`document.querySelector('#play-button').click()`);
  await waitFor(`window.moonlight.snapshot().audioReady === true`, 'piano samples', 60000);
  const audio = await snapshot();
  check('all 28 Salamander samples decode in browser', audio.audioReady === true, `${audio.audioReady}`);
  const mp3 = [...new Set(Object.values(report.pages))].filter(u => u.endsWith('.mp3'));
  check('28 piano samples requested from local assets', mp3.length === 28, `${mp3.length} mp3`);
  await waitFor(`['playing','waiting'].includes(window.moonlight.snapshot().state)`, 'guided transport start', 20000);
  await waitFor(`window.moonlight.snapshot().state === 'waiting'`, 'first cue boundary', 20000);
  const beforeHit = await snapshot();
  const keyForSlot = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'][beforeHit.cue.slot];
  await press(keyForSlot);
  await waitFor(`window.moonlight.snapshot().index === 1`, 'guided cue advance', 10000);
  const afterHit = await snapshot();
  check('guided mode advances after the prompted finger', afterHit.index === 1 && afterHit.hits === 1, `index ${afterHit.index}, hits ${afterHit.hits}`);
  check('guided hit triggers a real piano attack', afterHit.audioAttacks >= 1, `${afterHit.audioAttacks} attacks`);
  await sleep(250);
  await shot('03-guided-playing.png');

  // Free play with all eight keyboard lanes
  await evaluate(`document.querySelector('[data-mode="free"]').click()`);
  const baseline = (await snapshot()).inputCounts;
  for (const key of Object.keys(KEYS)) { await press(key); await sleep(80); }
  await sleep(500);
  const free = await snapshot();
  const deltas = free.inputCounts.map((n, i) => n - baseline[i]);
  check('free mode sounds all eight keyboard lanes', deltas.every(n => n === 1), JSON.stringify(deltas));
  check('free mode keeps mode-local transport idle', free.mode === 'free', free.mode);
  const freeUi = await evaluate(`({pitch:document.querySelector('#next-pitch').textContent,solfege:document.querySelector('#next-solfege').textContent,keyboard:[...document.querySelectorAll('.piano-key .solfege')].map(e=>e.textContent).join(' ')})`);
  check('free mode shows C4–C5 pitch labels', freeUi.keyboard === 'Do Re Mi Fa Sol La Si Do', JSON.stringify(freeUi));
  await shot('04-free-play.png');

  // Dream mode: taps advance one melody event each, accompaniment toggle live
  await evaluate(`document.querySelector('[data-mode="dream"]').click()`);
  await evaluate(`document.querySelector('#play-button').click()`);
  await waitFor(`window.moonlight.snapshot().state === 'waiting'`, 'dream transport start', 10000);
  const dreamStart = await snapshot();
  for (let i = 0; i < 4; i++) { await press('K'); await sleep(220); }
  await sleep(400);
  const dream = await snapshot();
  check('dream mode advances one cue per tap', dream.index === dreamStart.index + 4, `${dreamStart.index} -> ${dream.index}`);
  await evaluate(`document.querySelector('#accompaniment-toggle').click()`);
  const accompaniment = await evaluate(`({pressed:document.querySelector('#accompaniment-toggle').getAttribute('aria-pressed'),snap:window.moonlight.snapshot().dreamAccompaniment})`);
  check('dream accompaniment toggle switches on', accompaniment.pressed === 'true' && accompaniment.snap === true, JSON.stringify(accompaniment));
  await sleep(300);
  await shot('05-dream-mode.png');
  await evaluate(`document.querySelector('#reset-button').click()`);
  const reset = await snapshot();
  check('reset returns score to the beginning', reset.index === 0 && reset.state === 'ready', `${reset.index}/${reset.state}`);

  // Seek via progress slider
  await evaluate(`(()=>{const p=document.querySelector('#progress');p.value='100';p.dispatchEvent(new Event('change'));return true})()`);
  const seek = await snapshot();
  check('progress slider seeks to a later cue', seek.index === 100, `index ${seek.index}`);

  // Screen piano keys are real pointer targets
  const screenKey = await evaluate(`(()=>{const b=document.querySelector('.piano-key[data-slot="2"]');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}));return window.moonlight.snapshot().inputCounts[2]})()`);
  check('on-screen piano key accepts pointer input', screenKey >= 1, `${screenKey} hits`);

  // Camera + MediaPipe worker (Chrome fake camera: model still loads and infers)
  await evaluate(`document.querySelector('#reset-button').click()`);
  await evaluate(`document.querySelector('#play-button').click()`);
  await waitFor(`window.moonlight.snapshot().state === 'waiting'`, 'dream restart', 10000);
  await evaluate(`document.querySelector('#camera-button').click()`);
  await waitFor(`window.moonlight.snapshot().cameraReady === true`, 'MediaPipe worker ready', 150000);
  await waitFor(`window.moonlight.snapshot().workerFrames > 0`, 'first MediaPipe inference', 60000);
  await sleep(2500);
  const camera = await snapshot();
  check('camera stream opens and MediaPipe worker becomes ready', camera.cameraReady === true, `frames ${camera.workerFrames}, ${Math.round(camera.inferenceMs)} ms`);
  check('worker runs inference on live frames', camera.workerFrames > 0, `${camera.workerFrames} frames`);
  const cameraUi = await evaluate(`({handCount:document.querySelector('#hand-count').textContent,status:document.querySelector('#recognition-status').textContent,placeholder:document.querySelector('#camera-placeholder').hidden})`);
  check('camera UI reports tracking state', cameraUi.handCount.includes('/ 2') && cameraUi.placeholder === true, JSON.stringify(cameraUi));
  await shot('06-camera-worker.png');
  await evaluate(`document.querySelector('#camera-button').click()`);
  await sleep(600);

  // Clean desktop reload for the main visual capture
  await metrics(1440, 1000);
  await send('Page.reload');
  await waitFor(`window.moonlight && window.moonlight.snapshot().cues === 306`, 'desktop reload', 30000);
  await sleep(900);
  await evaluate(`document.querySelector('#help-button').click()`);
  await sleep(300);
  await shot('10-help-dialog.png');
  await evaluate(`document.querySelector('#help-dialog').close()`);
  await shot('07-desktop-full.png', { full: true });

  // Mobile layout
  await metrics(390, 844, true);
  await send('Page.reload');
  await waitFor(`window.moonlight && window.moonlight.snapshot().cues === 306`, 'mobile song load', 30000);
  await sleep(900);
  const mobile = await evaluate(`({overflow:document.documentElement.scrollWidth-window.innerWidth,width:innerWidth,height:document.documentElement.scrollHeight})`);
  check('mobile layout has no horizontal overflow', mobile.overflow <= 1, JSON.stringify(mobile));
  await shot('08-mobile.png');
  await shot('09-mobile-full.png', { full: true });

  check('no uncaught page exceptions', report.errors.filter(e => e.type === 'exception').length === 0, `${report.errors.filter(e => e.type === 'exception').length}`);
  check('no failed local asset requests', report.network.failed.length === 0, JSON.stringify(report.network.failed.slice(0, 4)));
  check('no 4xx/5xx responses', report.network.badStatus.length === 0, JSON.stringify(report.network.badStatus.slice(0, 4)));
  check('no external network dependencies', report.network.external.length === 0, `${report.network.external.length} external`);
} catch (error) {
  check('verification run completed without harness error', false, error.message);
  report.fatal = error.stack;
} finally {
  report.finishedAt = new Date().toISOString();
  report.failures = failures;
  await fs.writeFile(path.join(SHOTS, 'report.json'), JSON.stringify(report, null, 2));
  ws.close();
  chrome.kill();
  await sleep(700);
  try { await fs.rm(profile, { recursive: true, force: true }); } catch {}
  console.log(`\n${failures.length ? 'FAILURES: ' + failures.join('; ') : 'All checks passed.'}`);
  process.exitCode = failures.length ? 1 : 0;
}
