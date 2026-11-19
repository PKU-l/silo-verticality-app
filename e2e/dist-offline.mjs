// 八点模式端到端：填写底部基准 → 断网录入 → 断网刷新 → 恢复网络同步 → 手机页面无横向溢出
// 用法：npm run build → npm run sync-server → node e2e/dist-offline.mjs [截图目录]
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:8787/';
const OUT = process.argv[2] || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);
const clickText = (page, sel, text) => page.evaluate((s, t) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t)); el?.click(); return !!el; }, sel, text);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'silo-dist-')) });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(BASE + '#/home', { waitUntil: 'networkidle0' });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'networkidle0' });
log('页面受 Service Worker 控制：', await page.evaluate(() => !!navigator.serviceWorker.controller));

// 1. 通过“八点底部基准”页填写 18-左 的基准
await page.goto(BASE + '#/bases'); await sleep(500);
log('基准一览 18-左：', await page.evaluate(() => [...document.querySelectorAll('.pl-item')].find((e) => e.textContent.includes('18-左'))?.innerText.replace(/\n/g, ' ')));
await clickText(page, '.pl-item', '18-左'); await sleep(600);
const baseInputs = await page.$$('.sg-base input[inputmode=decimal]');
await baseInputs[0].click({ clickCount: 3 }); await baseInputs[0].type('0.5');
await baseInputs[1].click({ clickCount: 3 }); await baseInputs[1].type('150');
await page.evaluate(() => document.querySelectorAll('.sg-base .check-row input').forEach((c) => { if (!c.checked) c.click(); }));
await clickText(page, '.sg-base button', '保存基准'); await sleep(400);
await page.goto(BASE + '#/bases'); await sleep(400);
log('保存后 18-左：', await page.evaluate(() => [...document.querySelectorAll('.pl-item')].find((e) => e.textContent.includes('18-左'))?.innerText.replace(/\n/g, ' ')));

// 2. 断网录入
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
const offline = (on) => cdp.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await offline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
await page.goto(BASE + '#/dentry/' + encodeURIComponent('18-左') + '?round=demo-d2'); await sleep(600);
const ins = await page.$$('.entry input[inputmode=decimal]');
await ins[0].type('20'); await ins[1].type('153');
await sleep(300);
log('断网录入核对：', await page.$eval('.recap-text', (e) => e.textContent));
await page.screenshot({ path: join(OUT, 'dist_entry.png'), fullPage: false });
await clickText(page, '.entry-btns button', '保存'); await sleep(500);
log('保存后页头：', await page.$eval('.net', (e) => e.textContent));

// 3. 断网刷新
await page.reload({ waitUntil: 'domcontentloaded' }); await sleep(1000);
log('断网刷新后 18-左：', await page.evaluate(() => [...document.querySelectorAll('.pl-item')].find((e) => e.textContent.includes('18-左'))?.innerText.replace(/\n/g, ' ')));

// 4. 恢复网络并同步
await offline(false);
await page.goto(BASE + '#/data'); await sleep(400);
await clickText(page, '.sync-settings .seg button', '自建服务器'); await sleep(200);
await (await page.$('.sync-settings input[placeholder^="/api"]')).type('/api');
await clickText(page, 'button', '保存同步设置');
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await sleep(3500);
log('恢复网络后：', await page.$eval('.net', (e) => e.textContent));
const pulled = await (await fetch(BASE + 'api/pull')).json();
log('服务器条目：', pulled.items.map((i) => i.key.split(':')[0]).join(', '));

// 5. 手机竖屏无横向溢出
const widths = {};
for (const h of ['#/home', '#/dist', '#/bases', '#/corners', '#/point/' + encodeURIComponent('12-上'), '#/indicators', '#/more']) {
  await page.goto(BASE + h); await sleep(500);
  widths[h] = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
}
log('各页横向溢出像素（0 为无溢出）：', JSON.stringify(widths));
await page.goto(BASE + '#/corners'); await sleep(500);
await page.screenshot({ path: join(OUT, 'dist_corners.png') });
log('页面错误：', errs.length ? errs : '无');
await browser.close();
