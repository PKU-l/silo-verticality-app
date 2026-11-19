/**
 * 本次与上次比较。
 * 注意区分：
 *   中心移动量 = √(ΔX²+ΔY²)：中心点在平面上实际移动的距离；
 *   合成偏移量变化 = |本次| − |上次|：离设计中心的距离变化。
 * 例：中心由 (+10, 0) 移到 (0, +10)，中心移动 14.1 mm，但合成偏移量变化为 0。
 */
import type { CenterObs, ThresholdSet } from '../model/types';
import { elevKey } from './center';

export interface Comparison {
  dx: number | null;
  dy: number | null;
  move: number | null;
  dResultant: number | null;
  sameElevation: boolean;
}

export function compareObs(cur: CenterObs, prev: CenterObs): Comparison {
  const dx = cur.x !== null && prev.x !== null ? cur.x - prev.x : null;
  const dy = cur.y !== null && prev.y !== null ? cur.y - prev.y : null;
  return {
    dx,
    dy,
    move: dx !== null && dy !== null ? Math.sqrt(dx * dx + dy * dy) : null,
    dResultant: cur.resultant !== null && prev.resultant !== null ? cur.resultant - prev.resultant : null,
    sameElevation: elevKey(cur.elevation) === elevKey(prev.elevation),
  };
}

/** 默认比较对：最新观测，与同标高的上一次观测（没有则取时间上的上一次） */
export function defaultPair(obs: CenterObs[]): { cur: CenterObs | null; prev: CenterObs | null } {
  if (obs.length === 0) return { cur: null, prev: null };
  const sorted = [...obs].sort((a, b) => a.time.localeCompare(b.time) || a.elevation - b.elevation);
  // 优先选择存在“同标高上一次”的最新记录
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i];
    for (let j = i - 1; j >= 0; j--) {
      if (elevKey(sorted[j].elevation) === elevKey(c.elevation) && sorted[j].time < c.time) {
        return { cur: c, prev: sorted[j] };
      }
    }
  }
  const cur = sorted[sorted.length - 1];
  return { cur, prev: sorted.length > 1 ? sorted[sorted.length - 2] : null };
}

/** 阈值是否已完整填写（数值 + 来源 + 版本 + 设置人） */
export function thresholdsReady(t: ThresholdSet): boolean {
  const meta = !!(t.source.trim() && t.version.trim() && t.setBy.trim());
  const any = [t.resultantWarning, t.resultantControl, t.componentWarning, t.componentControl].some(
    (v) => v !== null && Number.isFinite(v),
  );
  return meta && any;
}

export type Level = 'none' | 'warn' | 'control';

/** 判断某个非负指标值相对阈值的等级；阈值未启用或数值缺失时返回 'none' */
export function levelOf(value: number | null, warn: number | null, control: number | null, ready: boolean): Level {
  if (!ready || value === null) return 'none';
  const v = Math.abs(value);
  if (control !== null && v > control) return 'control';
  if (warn !== null && v > warn) return 'warn';
  return 'none';
}
