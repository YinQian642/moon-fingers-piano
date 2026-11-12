import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.TEST_URL || 'http://127.0.0.1:4192';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
try {
  await fs.mkdir('.local', {recursive: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 1080}}), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  const snap = () => page.evaluate(() => window.moonlight.snapshot());
  const moscow = '[data-song-id="moscow-nights-eop-1024-piano"]';
  const select = async selector => {await page.locator('#library-button').click();await page.locator(selector).click();};
  await page.waitForFunction(() => window.moonlight?.snapshot().notes === 1468);
  await select(moscow);
  await page.waitForFunction(() => window.moonlight.snapshot().notes === 199);
  assert.equal((await snap()).cues, 58);assert.equal((await snap()).revision, 'r0001');
  assert.equal(await page.locator('#song-title').textContent(), '莫斯科郊外的晚上');
  assert.equal(await page.locator('#pitch-label').textContent(), 'A · 小调');
  await page.locator('#play-button').click();
  await page.waitForFunction(() => window.moonlight.snapshot().state === 'waiting');
  await page.keyboard.press('s');assert.equal((await snap()).index, 0);
  await page.keyboard.press('a');assert.equal((await snap()).index, 1);
  await page.locator('[data-mode="free"]').click();
  const before = (await snap()).audioAttacks;
  for (const key of ['a', 's', 'd', 'f', 'j', 'k', 'l', ';']) await page.keyboard.press(key);
  assert.equal((await snap()).audioAttacks, before + 8);assert.equal((await snap()).index, 1);
  await page.locator('[data-mode="dream"]').click();await page.locator('#reset-button').click();
  assert.equal((await snap()).dreamAccompaniment, false);
  for (let i = 0; i < 58; i++) {
    await page.locator('[data-slot="0"]').click();assert.equal((await snap()).index, i + 1);
    if (i === 9) {await page.waitForTimeout(500);assert.equal((await snap()).index, 10);}
  }
  await page.waitForFunction(() => window.moonlight.snapshot().state === 'ended');
  await page.locator('#reset-button').click();await page.locator('#accompaniment-toggle').click();
  assert.equal((await snap()).dreamAccompaniment, true);
  const beforeBacking = (await snap()).audioAttacks;
  await page.keyboard.press('a');await page.waitForTimeout(150);
  assert((await snap()).audioAttacks > beforeBacking + 1);
  await page.locator('#accompaniment-toggle').click();
  await page.screenshot({path: '.local/moscow-desktop.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path: '.local/moscow-mobile.png', fullPage: true});
  await page.locator('#library-button').click();
  await page.screenshot({path: '.local/moscow-library.png', fullPage: true});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#builtin-song').click();
  await page.waitForFunction(() => window.moonlight.snapshot().notes === 1468);
  assert.equal((await snap()).index, 0);assert.equal((await snap()).state, 'ready');

  // A late fetch must never override the user's subsequent selection.
  let release, entered;
  const pending = new Promise(resolve => {release = resolve;});
  const requested = new Promise(resolve => {entered = resolve;});
  const routePattern = '**/music-library/**/performance.json';
  await page.route(routePattern, async route => {entered();await pending;await route.continue();});
  const response = page.waitForResponse(r => r.url().endsWith('/performance.json'));
  await select(moscow);await requested;await select('#builtin-song');release();await response;
  await page.waitForTimeout(200);assert.equal((await snap()).notes, 1468);
  await page.unroute(routePattern);

  // A failed archive read leaves Moonlight playable and offers a retry through the library.
  await page.route(routePattern, route => route.fulfill({status: 503, body: ''}));
  await select(moscow);await page.waitForSelector('#toast:not([hidden])');
  assert.equal((await snap()).notes, 1468);await page.unroute(routePattern);
  await select(moscow);await page.waitForFunction(() => window.moonlight.snapshot().notes === 199);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({passed: true, checks: ['archived melody and key', 'three modes', '58 distinct dream taps', 'optional accompaniment', 'Moonlight switch', 'stale fetch cancellation', 'load failure and retry', 'mobile overflow'], snapshot: await snap()}));
} finally {await browser.close();}
