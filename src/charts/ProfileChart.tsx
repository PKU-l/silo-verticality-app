/**
 * 立面曲线（通用）：横轴为有符号偏移 mm（或合成偏移量，从 0 开始），纵轴为标高 m。
 * 用于 X 立面、Y 立面、合成偏移量曲线、单测点局部读数视图。
 * 相邻点之间的细虚线仅为示意，不代表未测标高的实测值。
 */
import type { Ref } from 'react';
import type { Level } from '../calc/compare';
import { fmt, fmtSigned } from '../calc/direction';
import { linear, profileDomain, ticks } from './geometry';
import type { Tip, TipHandler } from './tips';
import { COLORS, FONT } from './theme';

export interface PPoint {
  id: string;
  selectKey: string;
  elevation: number;
  value: number;
  series: string;
  hollow?: boolean;
  level: Level;
  tip: Tip;
  /** 叠加比较时区分：平台偏移 / 成型仓壁偏移 */
  variant?: 'platform' | 'wall';
}

interface Props {
  title: string;
  subtitle: string;
  points: PPoint[];
  wallHeight: number;
  negLabel: string;
  posLabel: string;
  zeroLabel: string;
  nonNegative?: boolean;
  thresholds?: { warn: number | null; control: number | null; label: string } | null;
  emptyText: string | null;
  latestSeries?: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onTip: TipHandler;
  width?: number;
  height?: number;
  svgRef?: Ref<SVGSVGElement>;
  footnote?: string;
  /** 需要在点旁标注数值的批次；默认只标注最新批次 */
  labelSeries?: string[];
  /** 自定义横轴范围与参考线（如原始距离图以底部基准距离为参考） */
  domain?: [number, number];
  refValue?: number;
  /** 横轴单位文字，默认 mm */
  unitText?: string;
}

export function ProfileChart(p: Props) {
  const W = p.width ?? 380, H = p.height ?? 520;
  const m = { l: 52, r: 18, t: 72, b: 98 };
  const values = p.points.map((q) => q.value);
  const extra: number[] = [];
  if (p.thresholds) for (const v of [p.thresholds.warn, p.thresholds.control]) if (v !== null) extra.push(v);
  const [d0, d1] = p.domain ?? profileDomain(values, extra, !!p.nonNegative);
  const ref = p.refValue ?? 0;
  const plain = !!p.nonNegative || p.refValue !== undefined;
  const sx = linear([d0, d1], [m.l, W - m.r]);
  const topE = Math.max(p.wallHeight, ...p.points.map((q) => q.elevation));
  const sy = linear([0, topE], [H - m.b, m.t]);
  const series = [...new Set(p.points.map((q) => q.series))].sort();
  const latest = p.latestSeries ?? series[series.length - 1];
  const variants = new Set(p.points.map((q) => q.variant).filter(Boolean));
  const labelSet = new Set(p.labelSeries ?? [latest]);
  const colorOf = (q: PPoint) =>
    q.level !== 'none' ? COLORS.alert : q.variant === 'wall' ? COLORS.wall
      : variants.size ? COLORS.measured : q.series === latest ? COLORS.measured : COLORS.measuredOld;
  const lineColor = (s: string) => {
    const q = p.points.find((z) => z.series === s);
    if (q?.variant === 'wall') return COLORS.wall;
    return variants.size || s === latest ? COLORS.measured : COLORS.measuredOld;
  };

  return (
    <svg ref={p.svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block' }}
      fontFamily={FONT} xmlns="http://www.w3.org/2000/svg">
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />
      <text x={12} y={22} fontSize={15} fontWeight={700} fill={COLORS.text}>{p.title}</text>
      <text x={12} y={40} fontSize={11.5} fill={COLORS.sub}>{p.subtitle}</text>

      {/* 网格与标高刻度 */}
      {ticks(0, topE, 8).map((e) => (
        <g key={'e' + e}>
          <line x1={m.l} y1={sy(e)} x2={W - m.r} y2={sy(e)} stroke={COLORS.grid} strokeWidth={0.8} />
          <text x={m.l - 6} y={sy(e) + 4} fontSize={11} fill={COLORS.sub} textAnchor="end">{e}</text>
        </g>
      ))}
      <line x1={m.l} y1={sy(p.wallHeight)} x2={W - m.r} y2={sy(p.wallHeight)} stroke={COLORS.axis} strokeDasharray="3 3" />
      <text x={m.l - 6} y={m.t - 10} fontSize={11} fill={COLORS.sub} textAnchor="end">标高 m</text>
      {ticks(d0, d1, 6).map((v) => (
        <g key={'v' + v}>
          <line x1={sx(v)} y1={m.t} x2={sx(v)} y2={H - m.b} stroke={COLORS.grid} strokeWidth={0.6} />
          <text x={sx(v)} y={H - m.b + 16} fontSize={11} fill={COLORS.sub} textAnchor="middle">{plain ? v : fmtSigned(v, 0)}</text>
        </g>
      ))}
      <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="none" stroke={COLORS.axis} strokeWidth={1} />
      {/* 设计轴线（零线） */}
      <line x1={sx(ref)} y1={m.t} x2={sx(ref)} y2={H - m.b} stroke={COLORS.design} strokeWidth={2} />
      <text x={sx(ref) + 4} y={m.t + 12} fontSize={10.5} fill={COLORS.design}>{p.zeroLabel}</text>
      {/* 方向标注 */}
      <text x={m.l} y={H - m.b + 34} fontSize={12} fill={COLORS.text}>{p.nonNegative ? '' : `← ${p.negLabel}`}</text>
      <text x={(m.l + W - m.r) / 2} y={H - m.b + 34} fontSize={12} fill={COLORS.text} textAnchor="middle">{p.unitText ?? 'mm'}</text>
      <text x={W - m.r} y={H - m.b + 34} fontSize={12} fill={COLORS.text} textAnchor="end">{p.posLabel} →</text>

      {/* 阈值线（仅在阈值已完整配置时传入） */}
      {p.thresholds && ([['warn', '预警'], ['control', '控制']] as const).map(([k, name]) => {
        const v = p.thresholds![k];
        if (v === null) return null;
        const xs = p.nonNegative ? [v] : [v, -v];
        return xs.map((x) => (
          <g key={k + x}>
            <line x1={sx(x)} y1={m.t} x2={sx(x)} y2={H - m.b} stroke={COLORS.threshold} strokeWidth={1.2}
              strokeDasharray={k === 'warn' ? '6 4' : '2 3'} />
            <text x={sx(x) + (x < 0 ? -3 : 3)} y={m.t - 3} fontSize={10} fill={COLORS.threshold} textAnchor={x < 0 ? 'end' : 'start'}>
              {name} {fmt(Math.abs(x), 0)}
            </text>
          </g>
        ));
      })}

      {p.emptyText ? (
        <g>
          <rect x={m.l + 20} y={(m.t + H - m.b) / 2 - 34} width={W - m.l - m.r - 40} height={60} rx={6} fill="#f6f8fb" stroke={COLORS.grid} />
          <text x={(m.l + W - m.r) / 2} y={(m.t + H - m.b) / 2 - 8} fontSize={14} fontWeight={700} fill={COLORS.text} textAnchor="middle">暂无足够数据</text>
          <text x={(m.l + W - m.r) / 2} y={(m.t + H - m.b) / 2 + 12} fontSize={11} fill={COLORS.sub} textAnchor="middle">{p.emptyText}</text>
        </g>
      ) : (
        <>
          {/* 示意连线：按批次、按标高连接相邻实测点 */}
          {series.map((s) => {
            const pts = p.points.filter((q) => q.series === s).sort((a, b) => a.elevation - b.elevation);
            if (pts.length < 2) return null;
            return (
              <polyline key={'s' + s} points={pts.map((q) => `${sx(q.value)},${sy(q.elevation)}`).join(' ')} fill="none"
                stroke={lineColor(s)} strokeWidth={pts[0].variant === 'wall' ? 1.4 : 1} strokeDasharray={pts[0].variant === 'wall' ? '7 4' : '3 3'} />
            );
          })}
          {p.points.map((q) => {
            const sel = q.selectKey === p.selectedKey;
            const c = colorOf(q);
            const x = sx(q.value), y = sy(q.elevation);
            const labelLeft = x > (m.l + W - m.r) / 2 + 40;
            return (
              <g key={q.id} style={{ cursor: 'pointer' }}
                onClick={(e) => { p.onSelect(q.selectKey); p.onTip(q.tip, e, true); }}
                onMouseEnter={(e) => p.onTip(q.tip, e)} onMouseLeave={() => p.onTip(null)}>
                {sel && <circle cx={x} cy={y} r={10} fill="none" stroke={COLORS.text} strokeWidth={1.2} />}
                {q.variant === 'wall'
                  ? <rect x={x - 4.5} y={y - 4.5} width={9} height={9} fill={q.hollow ? '#fff' : c} stroke={c} strokeWidth={q.level === 'warn' ? 3 : 1.8} />
                  : <circle cx={x} cy={y} r={q.hollow ? 4.5 : 5} fill={q.hollow ? '#fff' : c} stroke={c} strokeWidth={q.level === 'warn' ? 3 : 1.8} />}
                <circle cx={x} cy={y} r={12} fill="transparent" />
                {labelSet.has(q.series) && (
                  <text x={labelLeft ? x - 9 : x + 9} y={y + 4} fontSize={10.5} fill={COLORS.text} textAnchor={labelLeft ? 'end' : 'start'}>
                    {fmt(q.elevation, 1)} m　{plain ? fmt(q.value) : fmtSigned(q.value)}
                  </text>
                )}
              </g>
            );
          })}
        </>
      )}

      {/* 图例 */}
      <g transform={`translate(12, ${H - 44})`}>
        {variants.size ? (
          <>
            <circle cx={5} cy={-4} r={4.5} fill={COLORS.measured} />
            <text x={14} y={0} fontSize={10.5} fill={COLORS.text}>平台偏移</text>
            <rect x={78} y={-8.5} width={9} height={9} fill={COLORS.wall} />
            <line x1={92} y1={-4} x2={112} y2={-4} stroke={COLORS.wall} strokeDasharray="7 4" />
            <text x={116} y={0} fontSize={10.5} fill={COLORS.text}>成型仓壁偏移</text>
          </>
        ) : (
          <>
            <circle cx={5} cy={-4} r={4.5} fill={COLORS.measured} />
            <text x={14} y={0} fontSize={10.5} fill={COLORS.text}>实测点{series.length > 1 ? `（${latest}）` : ''}</text>
          </>
        )}
        {!variants.size && series.length > 1 && (
          <>
            <circle cx={150} cy={-4} r={4.5} fill={COLORS.measuredOld} />
            <text x={159} y={0} fontSize={10.5} fill={COLORS.text}>较早批次</text>
          </>
        )}
        <line x1={225} y1={-4} x2={250} y2={-4} stroke={COLORS.design} strokeWidth={2} />
        <text x={255} y={0} fontSize={10.5} fill={COLORS.text}>{p.zeroLabel.replace(/ 0$/, '')}</text>
        <text x={0} y={16} fontSize={10} fill={COLORS.sub}>{p.footnote ?? '点间细虚线仅为示意，不代表未测标高的实测结果'}</text>
        <text x={0} y={30} fontSize={10} fill={COLORS.sub}>顶部虚线为观测高度 {p.wallHeight} m；标高 m，偏移 mm</text>
      </g>
    </svg>
  );
}
