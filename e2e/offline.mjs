// 端到端离线测试。用法：npm run build → npm run sync-server → npm run e2e [截图目录]
// 需本机安装 Microsoft Edge；如用 Chrome，请修改下方 EDGE 路径。
// 端到端：PWA 离线录入、离线刷新不丢数据、恢复网络后同步、冲突提示
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:8787/';
const OUT = process.argv[2] || '.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('•', ...a);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'silo-')), args: ['--no-first-run'] });
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => log('页面错误', e.message));

await page.goto(BASE + '#/round', { waitUntil: 'networkidle0' });
const swOk = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active));
await page.reload({ waitUntil: 'networkidle0' });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
const cached = await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).length; });
log('Service Worker 已激活:', swOk, '页面受控:', controlled, '缓存条目:', cached);

// —— 断网 ——
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
const offline = (on) => cdp.send('Network.emulateNetworkConditions', { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await offline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
await page.goto(BASE + '#/entry/13?round=demo-round-2');
await sleep(500);
const inputs = await page.$$('.entry input[inputmode=decimal]');
await inputs[0].type('23.5');
await inputs[1].type('6');
await inputs[2].type('2');
const dirs = await page.$$('.dir-btn'); // X负 X正 Y负 Y正
await dirs[1].click(); // 光斑在原点 +X 侧
await dirs[2].click(); // 光斑在原点 −Y 侧
await sleep(200);
log('离线录入复述：', await page.$eval('.recap-text', (e) => e.textContent));
await page.screenshot({ path: join(OUT, 'e2e_entry_mobile.png') });
const saveBtn = await page.$('.entry-btns .primary');
await saveBtn.click();
await sleep(500);
log('保存后页头状态：', await page.$eval('.net', (e) => e.textContent));
const createdId = await page.evaluate(() => JSON.parse(localStorage.getItem('silo-verticality:v2')).plumbObs.filter((o) => !o.demo && o.siloId === '13').sort((a, b) => a.time.localeCompare(b.time)).pop().id);

// 离线刷新
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(1000);
const card18 = await page.evaluate(() => [...document.querySelectorAll('.round-card')].find((c) => c.querySelector('.rc-id')?.textContent === '13')?.innerText.replace(/\n/g, ' '));
log('离线刷新后 13 号仓卡片：', card18);
log('离线刷新后页头状态：', await page.$eval('.net', (e) => e.textContent));
await page.screenshot({ path: join(OUT, 'e2e_round_offline.png') });

// —— 恢复网络并同步 ——
await offline(false);
await page.goto(BASE + '#/data');
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('.sync-settings .seg button')].find((b) => b.textContent === '自建服务器')?.click());
await sleep(200);
const ep = await page.$('.sync-settings input[placeholder^="/api"]');
await ep.type('/api');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === '保存同步设置')?.click());
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await sleep(3500);
log('恢复网络后：', await page.$eval('.net', (e) => e.textContent), '|', await page.evaluate(() => document.querySelector('.card-panel p.small')?.textContent));
const server = await (await fetch(BASE + 'api/pull')).json();
log('服务器记录数：', server.items.length, server.items.map((i) => i.key.split(':')[0]).join(','));

// —— 冲突：另一台设备先修改了同一条记录 ——
const item = server.items.find((i) => i.key === 'plumbObs:' + createdId);
await fetch(BASE + 'api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: [{ key: item.key, baseVersion: item.version, data: { ...item.data, note: '另一台设备修改' } }] }) });
// 本机也修改同一记录（备注）
const id = item.key.split(':')[1];
await page.goto(BASE + `#/entry/13?rec=${id}&round=demo-round-2`);
await sleep(500);
const note = (await page.$$('.entry-row input'))[3];
await note.type('本机修改');
await (await page.$('.entry-btns .primary')).click();
await sleep(300);
await page.goto(BASE + '#/data');
await sleep(300);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === '立即同步')?.click());
await sleep(1500);
log('冲突提示：', await page.evaluate(() => document.querySelector('.conflicts h4')?.textContent ?? '无'));
const localNote = await page.evaluate((id) => JSON.parse(localStorage.getItem('silo-verticality:v2')).plumbObs.find((o) => o.id === id)?.note, createdId);
log('本机数据未被覆盖，备注 =', localNote);
await page.screenshot({ path: join(OUT, 'e2e_conflict.png'), fullPage: true });
await browser.close();
