import puppeteer from 'puppeteer-core';
// 说明书目录：环境变量 MANUAL_DIR(默认 ./manual/)，其中需有 manual.html
const DIR = (process.env.MANUAL_DIR || './manual/').replace(/\\/g, '/').replace(/\/?$/, '/');
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const p = await b.newPage();
await p.goto('file:///' + DIR + 'manual.html', { waitUntil: 'networkidle0' });
await p.pdf({
  path: DIR + '筒仓滑模垂直度观测系统_说明及填报指南.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true,
  displayHeaderFooter: true, headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#888;font-family:Microsoft YaHei;padding:0 16mm;display:flex;justify-content:space-between"><span>筒仓滑模垂直度观测系统 · 说明及填报指南</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await b.close();
console.log('ok');
