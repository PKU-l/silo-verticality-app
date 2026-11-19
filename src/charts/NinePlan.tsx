/**
 * 九仓平面图（八点仓壁距离差模式）。
 * - 仓号按图纸位置固定；紧密排列、仓间区域与整体外轮廓参照平面示意图。
 * - 八个观测点为绿色发光点 + 水波纹（仅标识位置，不表示数据有效或符合指标）。
 * - 角仓显示两个图纸方向分量与“角仓两测点组合位移示意”箭头；中间五仓不画箭头。
 * - 窄屏自动放大文字与标记；完整图例说明由页面以 HTML 显示（见 NinePlanLegend）。
 */
import { useEffect, useState } from 'react';
import type { LayoutConfig, SiloDef } from '../model/types';
import type { DistPoint } from '../model/distTypes';
import type { CornerResult, ReadingCalc } from '../calc/distance';
import { SIDE_NAME } from '../calc/distance';
import { placeSilos, positionLabel } from '../calc/layout';
import { fmt, fmtSigned } from '../calc/direction';
import { COLORS, FONT } from './theme';

export interface PointView {
  point: DistPoint;
  calc: ReadingCalc | null;
  statusText: string;
  elevation: number | null;
  time: string;
}

interface Props {
  silos: SiloDef[];
  layout: LayoutConfig;
  points: PointView[];
  corners: CornerResult[];
  mag: number;
  selected: string | null;
  onSelect: (pointId: string) => void;
  animate: boolean;
}

export const GREEN = '#16a34a';
const SIDE_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** 窄屏时放大 SVG 内文字与标记，保证手机上可读 */
function useFontScale(): number {
  const calc = () => (window.innerWidth < 520 ? 2.1 : window.innerWidth < 900 ? 1.45 : 1);
  const [fs, setFs] = useState(calc);
  useEffect(() => {
    const on = () => setFs(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return fs;
}

export function NinePlan({ silos, layout, points, corners, mag, selected, onSelect, animate }: Props) {
  const fs = useFontScale();
  const compact = fs > 1.2;
  const { placed, mode } = placeSilos(silos, layout, 0.6);
  const R = Math.max(...silos.map((s) => s.outerDiameter)) / 2;
  const margin = R * (fs > 1.5 ? 1.8 : fs > 1.2 ? 1.3 : 0.95);
  const minX = Math.min(...placed.map((p) => p.x)) - R - margin, maxX = Math.max(...placed.map((p) => p.x)) + R + margin;
  const minY = Math.min(...placed.map((p) => p.y)) - R - margin, maxY = Math.max(...placed.map((p) => p.y)) + R + margin;
  const W = 900, k = W / (maxX - minX);
  const head = (mode === 'schematic' ? 96 : 60) * fs, foot = 34 * fs;
  const H = head + (maxY - minY) * k + foot;
  const X = (m: number) => (m - minX) * k;
  const Y = (m: number) => head + (m - minY) * k;
  const pos = new Map(placed.map((p) => [p.silo.id, p]));
  const pxPerMm = (k * mag) / 1000;
  const hasPoint = new Set(points.map((p) => p.point.siloId));
  const ox0 = Math.min(...placed.map((p) => p.x)) - R - 0.35, ox1 = Math.max(...placed.map((p) => p.x)) + R + 0.35;
  const oy0 = Math.min(...placed.map((p) => p.y)) - R - 0.35, oy1 = Math.max(...placed.map((p) => p.y)) + R + 0.35;
  const neighbors: [typeof placed[number], typeof placed[number]][] = [];
  for (const a of placed) for (const b of placed) {
    if ((a.silo.row === b.silo.row && b.silo.col === a.silo.col + 1) || (a.silo.col === b.silo.col && b.silo.row === a.silo.row + 1)) neighbors.push([a, b]);
  }
  const t = (n: number) => n * fs;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} fontFamily={FONT} xmlns="http://www.w3.org/2000/svg"
      className={'nine-plan' + (animate ? '' : ' paused')}>
      <rect width={W} height={H} fill="#fff" />
      <defs>
        <filter id="ptGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation={3 * fs} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <marker id="npA" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth={t(12)} markerHeight={t(12)} orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={COLORS.measured} /></marker>
        <marker id="npC" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth={t(10)} markerHeight={t(10)} orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#b45309" /></marker>
      </defs>

      <text x={14} y={t(24)} fontSize={t(18)} fontWeight={700} fill={COLORS.text}>九仓平面 · 八点仓壁距离差</text>
      <text x={14} y={t(46)} fontSize={t(13)} fill={COLORS.text}>
        箭头放大 <tspan fontWeight={700} fill={COLORS.measured}>{mag}×</tspan>（仅显示）· 数值为真实 mm
      </text>
      {mode === 'schematic' && (
        <g transform={`translate(14, ${t(58)})`}>
          <rect width={t(214)} height={t(28)} rx={5} fill="#fff1d6" stroke="#e0a526" />
          <text x={t(107)} y={t(19)} fontSize={t(14)} fontWeight={700} fill="#7a4a00" textAnchor="middle">布置示意，非测量比例图</text>
        </g>
      )}

      {/* 整体外轮廓与仓间区域 */}
      <rect x={X(ox0)} y={Y(oy0)} width={(ox1 - ox0) * k} height={(oy1 - oy0) * k} rx={6} fill="#f1f3f6" stroke="#b8c0ca" strokeWidth={1.5} />
      {neighbors.map(([a, b], i) => {
        const w = 0.7;
        if (a.y === b.y) {
          const x1 = a.x + R - 0.2, x2 = b.x - R + 0.2;
          return <rect key={i} x={X(x1)} y={Y(a.y - w)} width={(x2 - x1) * k} height={2 * w * k} fill="#fff" stroke="#b8c0ca" strokeWidth={1} />;
        }
        const y1 = a.y + R - 0.2, y2 = b.y - R + 0.2;
        return <rect key={i} x={X(a.x - w)} y={Y(y1)} width={2 * w * k} height={(y2 - y1) * k} fill="#fff" stroke="#b8c0ca" strokeWidth={1} />;
      })}

      {/* 仓体 */}
      {placed.map(({ silo, x, y }) => {
        const cx = X(x), cy = Y(y), r = (silo.outerDiameter / 2) * k, ri = (silo.innerDiameter / 2) * k;
        return (
          <g key={silo.id}>
            <circle cx={cx} cy={cy} r={r} fill="#fff" stroke="#8e98a4" strokeWidth={1.6} />
            <circle cx={cx} cy={cy} r={ri} fill="none" stroke="#b8c0ca" strokeWidth={1.1} />
            <text x={cx} y={cy - r * 0.45} fontSize={t(compact ? 24 : 30)} fontWeight={800} fill={COLORS.text} textAnchor="middle">{silo.id}</text>
            {!compact && <text x={cx} y={cy - r * 0.45 + 18} fontSize={11} fill={COLORS.sub} textAnchor="middle">{positionLabel(silo)}{silo.group ? ` · ${silo.group}` : ''}</text>}
            {!hasPoint.has(silo.id) && <text x={cx} y={cy + t(8)} fontSize={t(compact ? 10.5 : 13)} fill={COLORS.sub} textAnchor="middle">无直接观测点</text>}
          </g>
        );
      })}

      {/* 角仓分量与组合箭头（只画有真实分量的部分） */}
      {corners.map((c) => {
        const p = pos.get(c.siloId);
        if (!p) return null;
        const cx = X(p.x), cy = Y(p.y) + t(4);
        const du = c.u !== null ? c.u * pxPerMm : null, dv = c.v !== null ? -c.v * pxPerMm : null;
        const r = R * k;
        const diffElev = c.notes.some((n) => n.includes('标高不同'));
        const none = !c.uReading && !c.vReading;
        return (
          <g key={'c' + c.siloId}>
            {du !== null && du !== 0 && <line x1={cx} y1={cy} x2={cx + du} y2={cy} stroke="#b45309" strokeWidth={t(2)} strokeDasharray="5 3" markerEnd="url(#npC)" />}
            {dv !== null && dv !== 0 && <line x1={cx} y1={cy} x2={cx} y2={cy + dv} stroke="#b45309" strokeWidth={t(2)} strokeDasharray="5 3" markerEnd="url(#npC)" />}
            {c.magnitude !== null && du !== null && dv !== null && c.magnitude > 0 && (
              <line x1={cx} y1={cy} x2={cx + du} y2={cy + dv} stroke={COLORS.measured} strokeWidth={t(3)} markerEnd="url(#npA)" />
            )}
            <circle cx={cx} cy={cy} r={t(3)} fill={COLORS.text} />
            <g transform={`translate(${cx}, ${cy + r * 0.36})`}>
              {!none && <text y={0} fontSize={t(compact ? 11 : 12.5)} fontWeight={700} fill={COLORS.text} textAnchor="middle">
                u{c.u === null ? '—' : fmtSigned(c.u)} v{c.v === null ? '—' : fmtSigned(c.v)}{compact ? '' : ' mm'}
              </text>}
              <text y={t(15)} fontSize={t(compact ? 10.5 : 12)} fill={c.magnitude !== null ? COLORS.measured : COLORS.sub} fontWeight={c.magnitude !== null ? 700 : 400} textAnchor="middle">
                {none ? '无记录' : c.magnitude !== null ? `组合 ${fmt(c.magnitude)} mm` : diffElev ? '标高不同，不组合' : c.u !== null || c.v !== null ? '单方向，不组合' : '无有效分量'}
              </text>
            </g>
          </g>
        );
      })}

      {/* 观测点：绿色发光点 + 水波纹；标签按方位放在点外侧，不遮挡点位 */}
      {points.map((pv, i) => {
        const p = pos.get(pv.point.siloId);
        if (!p) return null;
        const side = pv.point.side;
        const [vx, vy] = SIDE_VEC[side];
        const r = (p.silo.outerDiameter / 2) * k;
        const px = X(p.x) + vx * r, py = Y(p.y) + vy * r;
        const sel = selected === pv.point.id;
        const c = pv.calc;
        const val = c === null ? '' : c.component !== null ? `${c.axis}${fmtSigned(c.component)} mm` : c.raw !== null ? `Δ${fmtSigned(c.raw)} 原始` : '';
        const elevText = pv.elevation !== null ? `${fmt(pv.elevation, 1)} m` : '';
        const lines = compact ? [pv.statusText, val, elevText].filter(Boolean) : [`${pv.statusText}${elevText ? ' ' + elevText : ''}`, val].filter(Boolean);
        const anchor = side === 'left' ? 'end' : 'start';
        const bh = t(16 + lines.length * 14);
        const lx = side === 'left' ? px - t(14) : side === 'right' ? px + t(14) : px + t(12);
        const ly = side === 'up' ? py - bh - t(2) : side === 'down' ? py + t(26) : py - t(10);
        const bw = t(compact ? 70 : 96);
        return (
          <g key={pv.point.id} className={'pt' + (sel ? ' sel' : '')} style={{ cursor: 'pointer' }} onClick={() => onSelect(pv.point.id)} role="button" aria-label={`观测点 ${pv.point.id}`}>
            {[0, 1, 2].map((j) => (
              <circle key={j} className="rip" cx={px} cy={py} r={t(7)} fill={GREEN} style={{ animationDelay: `${(i * 0.37 + j * 1.05).toFixed(2)}s` }} />
            ))}
            <circle cx={px} cy={py} r={t(sel ? 8 : 6)} fill={GREEN} stroke="#fff" strokeWidth={t(1.5)} filter={sel ? 'url(#ptGlow)' : undefined} />
            <circle cx={px} cy={py} r={t(18)} fill="transparent" />
            <g transform={`translate(${lx}, ${ly})`}>
              <rect x={anchor === 'end' ? -bw : t(-4)} y={t(-14)} width={bw + t(4)} height={bh} rx={4} fill="#fff" opacity={0.92} stroke={sel ? GREEN : 'none'} />
              <text fontSize={t(13)} fontWeight={700} fill={COLORS.text} textAnchor={anchor}>{pv.point.siloId}-{SIDE_NAME[side]}</text>
              {lines.map((ln, j) => (
                <text key={j} y={t(15 + j * 14)} fontSize={t(ln === val ? 11 : 10.5)} fill={ln === val ? COLORS.text : COLORS.sub} fontWeight={ln === val ? 600 : 400} textAnchor={anchor}>{ln}</text>
              ))}
            </g>
          </g>
        );
      })}

      {/* 简要图例（完整说明见图下） */}
      <g transform={`translate(14, ${H - t(12)})`} fontSize={t(11.5)}>
        <circle cx={t(6)} cy={t(-4)} r={t(5)} fill={GREEN} />
        <text x={t(16)} y={0} fill={COLORS.text}>观测点位置</text>
        <line x1={t(110)} y1={t(-4)} x2={t(136)} y2={t(-4)} stroke={COLORS.measured} strokeWidth={t(3)} markerEnd="url(#npA)" />
        <text x={t(142)} y={0} fill={COLORS.text}>组合位移示意</text>
        <line x1={t(236)} y1={t(-4)} x2={t(262)} y2={t(-4)} stroke="#b45309" strokeWidth={t(2)} strokeDasharray="5 3" />
        <text x={t(268)} y={0} fill={COLORS.text}>单向分量</text>
      </g>
    </svg>
  );
}

/** 图下完整图例（HTML，可换行） */
export function NinePlanLegend() {
  return (
    <ul className="plan-legend small">
      <li><span className="lg-dot" /> 绿色点：观测点所在位置，<b>仅标识位置，不表示数据有效或符合指标</b>；数据状态以文字标注。</li>
      <li><span className="lg-arrow" /> 角仓两测点组合位移示意：同一角仓两个正交仓壁测点的修正后位移合成，<b>不是仓中心偏移</b>；只在两点同一目标标高都有有效分量时绘制。</li>
      <li><span className="lg-dash" /> 单向分量：u 向图纸右为正，v 向图纸上为正。中间五仓无直接观测点，不绘制箭头。</li>
      <li>点位只表示数据所属位置，不作为现场安装位置或作业指令。图形由录入数据生成，不能代替人工复核签认。</li>
    </ul>
  );
}
