/** 把若干 SVG 图形拼成一张带说明信息的 PNG */
import { FONT } from './theme';

function svgToImage(svg: SVGSVGElement): Promise<{ img: HTMLImageElement; w: number; h: number }> {
  const vb = svg.viewBox.baseVal;
  const w = vb.width, h = vb.height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('style');
  const s = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ img, w, h });
    img.onerror = rej;
    img.src = url;
  });
}

export async function composePng(svgs: SVGSVGElement[], meta: string[]): Promise<Blob> {
  const imgs = await Promise.all(svgs.map(svgToImage));
  const scale = 2, pad = 20, headerH = 34 + meta.length * 22;
  // 第一张（平面图）单独一行，其余并排
  const [first, ...rest] = imgs;
  const restW = rest.reduce((a, b) => a + b.w + pad, -pad);
  const W = Math.max(first?.w ?? 0, restW) + pad * 2;
  const restH = Math.max(0, ...rest.map((r) => r.h));
  const H = headerH + (first ? first.h + pad : 0) + restH + pad * 2;
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b3440';
  ctx.font = `bold 18px ${FONT}`;
  ctx.fillText('筒仓滑模垂直度观测与偏移可视化', pad, pad + 16);
  ctx.font = `13px ${FONT}`;
  meta.forEach((m, i) => ctx.fillText(m, pad, pad + 42 + i * 22));
  let y = pad + headerH;
  if (first) {
    ctx.drawImage(first.img, pad, y, first.w, first.h);
    y += first.h + pad;
  }
  let x = pad;
  for (const r of rest) {
    ctx.drawImage(r.img, x, y, r.w, r.h);
    x += r.w + pad;
  }
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}
