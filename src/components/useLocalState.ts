/** 记住界面偏好（非观测数据），读写失败时退回默认值 */
import { useState } from 'react';

export function useLocalState<T>(key: string, init: T): [T, (v: T) => void] {
  const k = 'silo-ui:' + key;
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(k);
      return s === null ? init : (JSON.parse(s) as T);
    } catch {
      return init;
    }
  });
  return [v, (nv: T) => {
    setV(nv);
    try { localStorage.setItem(k, JSON.stringify(nv)); } catch { /* ignore */ }
  }];
}
