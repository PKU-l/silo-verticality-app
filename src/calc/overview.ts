/**
 * 九仓总览取数：默认比较同一指定标高；“各仓最近一次”模式下各仓标高可能不同，须同时显示实际标高与时间。
 * 无数据的仓返回 'none'（未观测）或 'no-elev'（该标高无数据），绝不当作零偏移。
 */
import type { CenterObs, SiloDef } from '../model/types';

export type CompareMode = { kind: 'elevation'; elevation: number | null; tolerance: number } | { kind: 'latest' };

export type CellState = 'ok' | 'x-only' | 'y-only' | 'base-pending' | 'insufficient' | 'no-elev' | 'none';

export interface Cell {
  silo: SiloDef;
  obs: CenterObs | null;
  state: CellState;
}

export const CELL_TEXT: Record<CellState, string> = {
  ok: '',
  'x-only': '仅 X 方向',
  'y-only': '仅 Y 方向',
  'base-pending': '基准待确认',
  insufficient: '中心偏移数据不足',
  'no-elev': '该标高无数据',
  none: '未观测',
};

export function isBasePending(o: CenterObs): boolean {
  return (o.problems ?? []).some((p) => p.startsWith('基准待确认'));
}

function stateOf(o: CenterObs): CellState {
  if (isBasePending(o)) return 'base-pending';
  return o.status === 'complete' ? 'ok' : o.status;
}

export function overviewCells(silos: SiloDef[], obs: CenterObs[], mode: CompareMode): Cell[] {
  return silos.map((silo) => {
    const mine = obs.filter((o) => o.siloId === silo.id);
    if (mine.length === 0) return { silo, obs: null, state: 'none' };
    let pick: CenterObs[];
    if (mode.kind === 'latest') pick = mine;
    else {
      if (mode.elevation === null) return { silo, obs: null, state: 'no-elev' };
      pick = mine.filter((o) => Math.abs(o.elevation - (mode.elevation as number)) <= mode.tolerance + 1e-9);
      if (pick.length === 0) return { silo, obs: null, state: 'no-elev' };
    }
    const o = [...pick].sort((a, b) => b.time.localeCompare(a.time))[0];
    return { silo, obs: o, state: stateOf(o) };
  });
}

/** 所有出现过的观测标高（降序） */
export function elevationsOf(obs: CenterObs[]): number[] {
  return [...new Set(obs.map((o) => Math.round(o.elevation * 1000) / 1000))].sort((a, b) => b - a);
}
