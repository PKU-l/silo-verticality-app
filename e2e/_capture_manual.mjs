// 为说明书截取界面图（演示数据）
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:5178/';
// 截图输出目录：环境变量 MANUAL_DIR(默认 ./manual/)下的 img/
const OUT = (process.env.MANUAL_DIR || './manual/').replace(/\\/g, '/').replace(/\/?$/, '/') + 'img/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, userDataDir: mkdtempSync(join(tmpdir(), 'silo-man-')) });
const page = await browser.newPage();
const mobile = () => page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const desktop = (h = 900) => page.setViewport({ width: 1440, height: h, deviceScaleFactor: 1.5 });
async function go(hash, wait = 700) { await page.goto(BASE + hash); await sleep(wait); }
async function shot(name, opts = {}) { await page.screenshot({ path: OUT + name + '.png', ...opts }); console.log('saved', name); }
async function shotEl(name, sel) { const el = await page.$(sel); await el.screenshot({ path: OUT + name + '.png' }); console.log('saved', name); }

await mobile();
await go('#/overview', 1200);
await shot('m_overview');
await go('#/round');
await shot('m_round');
// 录入示例（不保存）
await go('#/entry/18?round=demo-round-2');
const inputs = await page.$$('.entry input[inputmode=decimal]');
await inputs[0].type('23.5');
await inputs[1].type('6');
await inputs[2].type('2');
const dirs = await page.$$('.dir-btn');
await dirs[0].click();
await dirs[3].click();
const surveyor = (await page.$$('.entry-row input'))[2];
await surveyor.type('张工');
await sleep(300);
await page.evaluate(() => window.scrollTo(0, 0));
await shot('m_entry', { fullPage: true });
await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('silo-draft')).forEach((k) => localStorage.removeItem(k)));
await go('#/silo/12');
await shot('m_silo');
await go('#/data');
await page.evaluate(() => [...document.querySelectorAll('.sync-settings .seg button')].find((b) => b.textContent === 'Supabase')?.click());
await sleep(300);
await shotEl('m_sync', '.card-panel');

await desktop(1000);
await go('#/overview', 1000);
await shot('d_overview');
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent === '图纸参考图')?.click());
await sleep(400);
await shotEl('d_overview_ref', '.ov-plan');
await page.evaluate(() => [...document.querySelectorAll('.seg button')].find((b) => b.textContent === '简洁观测图')?.click());
await go('#/silo/12', 900);
await shot('d_silo12');
await go('#/points/12');
await shot('d_points');
await go('#/settings');
await shotEl('d_settings_dir', '.settings .card-panel');
await go('#/wall/15', 900);
await shot('d_wall');
await browser.close();
