/** 浏览器本地保存（离线可用：所有数据先写入本机） */
import { useEffect, useRef, useState } from 'react';
import type { AppData } from './types';
import { DEFAULT_CONFIG, DEFAULT_LAYOUT, DEFAULT_VERTICAL_WALL, EMPTY_THRESHOLDS, defaultDistPoints, defaultSilos, demoData, presetSiloIds } from './defaults';
import { DEFAULT_GRID } from '../calc/layout';
import { LEGACY_POINT_IDS, SIDE_FULL } from '../calc/distance';
import type { DistPoint } from './distTypes';

/**
 * 布局迁移：仓号排列改为“上排 12 11 10 / 中排 15 14 13 / 下排 18 17 16”后，
 * 各仓行列按新图纸重排；八点仍在四个角仓外侧，旧点号按图纸位置改为新点号，读数与轮次顺序随之更新。
 */
export function migrateLayout(d: Partial<AppData>): Partial<AppData> {
  const pos = new Map<string, [number, number]>();
  DEFAULT_GRID.forEach((row, r) => row.forEach((id, c) => pos.set(id, [r, c])));
  const silos = d.silos?.map((s) => { const p = pos.get(s.id); return p ? { ...s, row: p[0] as 0 | 1 | 2, col: p[1] as 0 | 1 | 2 } : s; });
  // 新旧点号互不重叠：出现任一旧点号即为旧版数据
  const legacy = (d.distPoints ?? []).some((p) => p.id in LEGACY_POINT_IDS);
  if (!legacy) return { ...d, silos };
  const ren = (id: string) => LEGACY_POINT_IDS[id] ?? id;
  const distPoints: DistPoint[] = (d.distPoints ?? []).map((p) => {
    const id = ren(p.id);
    const siloId = id.split('-')[0];
    const lineDesc = p.demo ? `${siloId} 号仓${SIDE_FULL[p.side]}仓壁外侧铅垂基准线（演示）` : p.lineDesc;
    return { ...p, id, siloId, lineDesc };
  });
  return {
    ...d, silos, distPoints,
    distReadings: (d.distReadings ?? []).map((r) => ({ ...r, pointId: ren(r.pointId) })),
    rounds: (d.rounds ?? []).map((r) => (r.mode === 'distance' ? { ...r, order: r.order.map(ren) } : r)),
  };
}

export const STORE_KEY = 'silo-verticality:v2';

/** 补齐缺失字段（旧版本数据或导入的备份） */
export function normalize(d0: Partial<AppData>): AppData {
  const d = migrateLayout(d0);
  const silos = d.silos && d.silos.length ? d.silos : defaultSilos();
  return {
    config: {
      ...DEFAULT_CONFIG, ...d.config,
      labels: { ...DEFAULT_CONFIG.labels, ...d.config?.labels },
      siloIds: silos.map((s) => s.id),
    },
    centerRecords: d.centerRecords ?? [],
    lines: d.lines ?? [],
    readings: d.readings ?? [],
    thresholds: { ...EMPTY_THRESHOLDS, ...d.thresholds },
    silos,
    layout: { ...DEFAULT_LAYOUT, ...d.layout },
    points: d.points ?? [],
    plumbObs: d.plumbObs ?? [],
    rounds: d.rounds ?? [],
    sync: { endpoint: '', ...d.sync },
    distPoints: d.distPoints && d.distPoints.length ? d.distPoints : defaultDistPoints(),
    distReadings: d.distReadings ?? [],
    indicators: d.indicators ?? [],
    verticalWall: { ...DEFAULT_VERTICAL_WALL, ...d.verticalWall },
  };
}

export function loadData(): AppData {
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s) return normalize(JSON.parse(s));
  } catch {
    /* 读取失败时使用演示数据 */
  }
  return demoData({ ...DEFAULT_CONFIG, siloIds: presetSiloIds() });
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);
  const [savedAt, setSavedAt] = useState<string>('');
  const timer = useRef<number | undefined>(undefined);
  const first = useRef(true);
  useEffect(() => {
    const write = () => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        setSavedAt(new Date().toLocaleTimeString());
      } catch {
        setSavedAt('保存失败（存储空间不足？）');
      }
    };
    // 首次立即写入，之后短暂合并；页面隐藏/关闭前也立即写入，保证离线刷新不丢数据
    if (first.current) { first.current = false; write(); return; }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(write, 150);
    const flush = () => { window.clearTimeout(timer.current); write(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); };
  }, [data]);
  return { data, setData, savedAt };
}
