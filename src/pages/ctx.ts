import type { AppData, AxisLabels } from '../model/types';
import type { SyncMeta } from '../model/sync';

export interface Ctx {
  data: AppData;
  setData: (f: (d: AppData) => AppData) => void;
  /** 当前生效的方向名称（方向未确认时为图纸方向名称） */
  labels: AxisLabels;
  showNorth: boolean;
  notify: (msg: string) => void;
  go: (path: string) => void;
  sync: {
    meta: SyncMeta;
    setMeta: (m: SyncMeta) => void;
    pending: number;
    online: boolean;
    busy: boolean;
    run: () => Promise<void>;
  };
}

export const tm = (s: string) => s.replace('T', ' ');
