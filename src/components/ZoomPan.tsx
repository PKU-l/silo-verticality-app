/**
 * 图形查看缩放：只改变“查看”比例（CSS 变换），不改变计算结果，也不改变偏移箭头的设定放大倍数。
 * 支持双指缩放、拖动平移、Ctrl+滚轮（触控板捏合）、按钮缩放与复位。
 */
import { useRef, useState, type ReactNode } from 'react';

export function ZoomPan({ children, label = '查看缩放' }: { children: ReactNode; label?: string }) {
  const [v, setV] = useState({ s: 1, x: 0, y: 0 });
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ d: number; s: number; cx: number; cy: number; x: number; y: number } | null>(null);
  const moved = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const clampS = (s: number) => Math.min(8, Math.max(1, s));
  const zoomAt = (factor: number, cx: number, cy: number) =>
    setV((p) => {
      const s = clampS(p.s * factor);
      const k = s / p.s;
      const nx = cx - (cx - p.x) * k, ny = cy - (cy - p.y) * k;
      return s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: nx, y: ny };
    });
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="zoompan">
      <div
        ref={box}
        className="zoompan-view"
        style={{ touchAction: v.s > 1 ? 'none' : 'pan-y' }}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          const p = rel(e);
          zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
        }}
        onPointerDown={(e) => {
          ptrs.current.set(e.pointerId, rel(e));
          moved.current = false;
          const pts = [...ptrs.current.values()];
          if (pts.length === 2) {
            const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            start.current = { d, s: v.s, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, x: v.x, y: v.y };
          } else if (pts.length === 1) {
            start.current = { d: 0, s: v.s, cx: pts[0].x, cy: pts[0].y, x: v.x, y: v.y };
          }
        }}
        onPointerMove={(e) => {
          if (!ptrs.current.has(e.pointerId) || !start.current) return;
          ptrs.current.set(e.pointerId, rel(e));
          const pts = [...ptrs.current.values()];
          const st = start.current;
          if (pts.length === 2 && st.d > 0) {
            const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const s = clampS((st.s * d) / st.d);
            const k = s / st.s;
            moved.current = true;
            setV(s === 1 ? { s: 1, x: 0, y: 0 } : { s, x: st.cx - (st.cx - st.x) * k, y: st.cy - (st.cy - st.y) * k });
          } else if (pts.length === 1 && v.s > 1) {
            const dx = pts[0].x - st.cx, dy = pts[0].y - st.cy;
            if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
            if (moved.current) setV((p) => ({ ...p, x: st.x + dx, y: st.y + dy }));
          }
        }}
        onPointerUp={(e) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size === 0) start.current = null; }}
        onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); start.current = null; }}
        onClickCapture={(e) => { if (moved.current) { e.stopPropagation(); moved.current = false; } }}
        onDoubleClick={(e) => { const p = rel(e); zoomAt(v.s > 1 ? 0 : 2, p.x, p.y); }}
      >
        <div style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, transformOrigin: '0 0' }}>{children}</div>
      </div>
      <div className="zoompan-ctl no-print" aria-label={label}>
        <button type="button" onClick={() => zoomAt(1.4, box.current!.clientWidth / 2, box.current!.clientHeight / 2)}>＋</button>
        <button type="button" onClick={() => zoomAt(1 / 1.4, box.current!.clientWidth / 2, box.current!.clientHeight / 2)}>－</button>
        <button type="button" onClick={() => setV({ s: 1, x: 0, y: 0 })}>复位</button>
        <span className="muted small">查看 {v.s.toFixed(1)}×（不影响数值与箭头放大倍数）</span>
      </div>
    </div>
  );
}
