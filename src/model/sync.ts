/**
 * 离线优先的同步：所有数据先保存在本机；配置同步服务器后，联网时上传/拉取。
 * 冲突（服务器版本已被他人修改，而本机也有未同步修改）一律提示人工核对，不静默覆盖。
 * 演示数据（demo: true）不参与同步。
 *
 * 服务器接口（见 server/sync-server.mjs）：
 *   POST {endpoint}/push  { changes: [{ key, baseVersion, data|null }] }
 *        → { results: [{ key, ok: true, version } | { key, conflict: true, server: { version, data } }] }
 *   GET  {endpoint}/pull  → { items: [{ key, version, data|null }] }
 */
import type { AppData, SyncConfig } from './types';

export const SYNC_COLLECTIONS = ['centerRecords', 'lines', 'readings', 'points', 'plumbObs', 'rounds', 'distPoints', 'distReadings', 'indicators'] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export interface Conflict {
  key: string;
  local: unknown | null;
  server: unknown | null;
  serverVersion: number;
  at: string;
}

export interface SyncMeta {
  versions: Record<string, number>;
  snapshots: Record<string, string>;
  conflicts: Conflict[];
  lastSync: string;
  lastResult: string;
}

export const META_KEY = 'silo-verticality:sync-meta';

export function loadMeta(): SyncMeta {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return { versions: {}, snapshots: {}, conflicts: [], lastSync: '', lastResult: '', ...JSON.parse(s) };
  } catch { /* ignore */ }
  return { versions: {}, snapshots: {}, conflicts: [], lastSync: '', lastResult: '' };
}

export function saveMeta(m: SyncMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(m));
}

type Item = { id: string; demo?: boolean };

function items(data: AppData, col: SyncCollection): Item[] {
  return (data[col] as Item[]).filter((x) => !x.demo);
}

export interface Change { key: string; baseVersion: number; data: unknown | null }

/** 本机尚未同步的修改（新增、修改、删除） */
export function pendingChanges(data: AppData, meta: SyncMeta): Change[] {
  const out: Change[] = [];
  const present = new Set<string>();
  const inConflict = new Set(meta.conflicts.map((c) => c.key));
  for (const col of SYNC_COLLECTIONS) {
    for (const it of items(data, col)) {
      const key = `${col}:${it.id}`;
      present.add(key);
      if (inConflict.has(key)) continue;
      if (meta.snapshots[key] !== JSON.stringify(it)) out.push({ key, baseVersion: meta.versions[key] ?? 0, data: it });
    }
  }
  for (const key of Object.keys(meta.snapshots)) {
    if (!present.has(key) && meta.snapshots[key] !== 'null' && !inConflict.has(key))
      out.push({ key, baseVersion: meta.versions[key] ?? 0, data: null });
  }
  return out;
}

function setItem(data: AppData, key: string, value: unknown | null): AppData {
  const [col, id] = splitKey(key);
  const list = (data[col] as Item[]).filter((x) => x.id !== id);
  return { ...data, [col]: value === null ? list : [...list, value as Item] } as AppData;
}

function splitKey(key: string): [SyncCollection, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) as SyncCollection, key.slice(i + 1)];
}

function localValue(data: AppData, key: string): Item | null {
  const [col, id] = splitKey(key);
  return (data[col] as Item[]).find((x) => x.id === id) ?? null;
}

async function errorText(res: Response): Promise<string> {
  try { const j = await res.json(); if (j?.error) return String(j.error); } catch { /* ignore */ }
  return 'HTTP ' + res.status;
}

export interface SyncOutcome { data: AppData; meta: SyncMeta; pushed: number; pulled: number; conflicts: number }

export async function syncNow(endpoint: string, data: AppData, meta0: SyncMeta, fetchImpl: typeof fetch = fetch): Promise<SyncOutcome> {
  const base = endpoint.replace(/\/+$/, '');
  const meta: SyncMeta = { ...meta0, versions: { ...meta0.versions }, snapshots: { ...meta0.snapshots }, conflicts: [...meta0.conflicts] };
  let d = data;
  const changes = pendingChanges(d, meta);
  let pushed = 0, pulled = 0;
  const now = new Date().toISOString();

  if (changes.length) {
    const res = await fetchImpl(base + '/push', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }),
    });
    if (!res.ok) throw new Error('上传失败：' + (await errorText(res)));
    const body = (await res.json()) as { results: { key: string; ok?: boolean; version?: number; conflict?: boolean; server?: { version: number; data: unknown | null } }[] };
    for (const r of body.results) {
      const ch = changes.find((c) => c.key === r.key);
      if (r.ok && ch) {
        meta.versions[r.key] = r.version!;
        meta.snapshots[r.key] = JSON.stringify(ch.data);
        pushed++;
      } else if (r.conflict && r.server) {
        meta.conflicts.push({ key: r.key, local: ch?.data ?? null, server: r.server.data, serverVersion: r.server.version, at: now });
      }
    }
  }

  const pr = await fetchImpl(base + '/pull');
  if (!pr.ok) throw new Error('拉取失败：' + (await errorText(pr)));
  const pulledBody = (await pr.json()) as { items: { key: string; version: number; data: unknown | null }[] };
  const inConflict = new Set(meta.conflicts.map((c) => c.key));
  for (const it of pulledBody.items) {
    const known = meta.versions[it.key] ?? 0;
    if (it.version <= known || inConflict.has(it.key)) continue;
    const local = localValue(d, it.key);
    const localJson = local ? JSON.stringify(local) : 'null';
    const clean = (meta.snapshots[it.key] ?? 'null') === localJson;
    if (clean) {
      d = setItem(d, it.key, it.data);
      meta.versions[it.key] = it.version;
      meta.snapshots[it.key] = JSON.stringify(it.data);
      pulled++;
    } else {
      meta.conflicts.push({ key: it.key, local, server: it.data, serverVersion: it.version, at: now });
    }
  }
  meta.lastSync = now;
  meta.lastResult = `上传 ${pushed} 条，下载 ${pulled} 条` + (meta.conflicts.length ? `，${meta.conflicts.length} 条冲突待人工核对` : '');
  return { data: d, meta, pushed, pulled, conflicts: meta.conflicts.length };
}

/** 冲突处理：保留本机（下次同步时以服务器最新版本为基础上传） */
export function keepLocal(meta: SyncMeta, key: string): SyncMeta {
  const c = meta.conflicts.find((x) => x.key === key);
  if (!c) return meta;
  return {
    ...meta,
    versions: { ...meta.versions, [key]: c.serverVersion },
    snapshots: { ...meta.snapshots, [key]: JSON.stringify(c.server) },
    conflicts: meta.conflicts.filter((x) => x.key !== key),
  };
}

/** 冲突处理：采用服务器版本（本机修改被替换；可先导出备份） */
export function useServer(data: AppData, meta: SyncMeta, key: string): { data: AppData; meta: SyncMeta } {
  const c = meta.conflicts.find((x) => x.key === key);
  if (!c) return { data, meta };
  return {
    data: setItem(data, key, c.server),
    meta: {
      ...meta,
      versions: { ...meta.versions, [key]: c.serverVersion },
      snapshots: { ...meta.snapshots, [key]: JSON.stringify(c.server) },
      conflicts: meta.conflicts.filter((x) => x.key !== key),
    },
  };
}

export function describeKey(key: string): string {
  const [col, id] = splitKey(key);
  const name: Record<SyncCollection, string> = {
    centerRecords: '方式A记录', lines: '观测线', readings: '仓壁读数', points: '测点资料', plumbObs: '垂准仪记录', rounds: '观测轮次',
    distPoints: '八点基准', distReadings: '八点读数', indicators: '指标',
  };
  return `${name[col]} ${id}`;
}

/* ---------------- 传输方式 ---------------- */

/** 当前同步配置是否完整 */
export function syncConfigured(c: SyncConfig): boolean {
  if (c.mode === 'supabase') return !!(c.supabaseUrl?.trim() && c.supabaseAnonKey?.trim() && c.token?.trim());
  return !!c.endpoint.trim();
}

/**
 * Supabase：把 /push、/pull 映射到数据库函数 silo_sync_push / silo_sync_pull（见 supabase/001_silo_sync.sql）。
 * 返回与自建服务器相同格式的响应，便于共用 syncNow 的冲突逻辑。
 */
export function supabaseFetch(url: string, anonKey: string, token: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  const base = url.trim().replace(/\/+$/, '') + '/rest/v1/rpc/';
  const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    const isPush = u.endsWith('/push');
    const body = isPush
      ? { p_token: token, p_changes: JSON.parse(String(init?.body ?? '{}')).changes ?? [] }
      : { p_token: token };
    const res = await fetchImpl(base + (isPush ? 'silo_sync_push' : 'silo_sync_pull'), { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.message || j.hint || msg; } catch { /* ignore */ }
      if (res.status === 404) msg += '（未找到同步函数，请先在 Supabase 执行 supabase/001_silo_sync.sql）';
      return new Response(JSON.stringify({ error: msg }), { status: res.status });
    }
    return new Response(await res.text(), { status: 200 });
  }) as typeof fetch;
}

/** 按配置执行一次同步 */
export function runSync(c: SyncConfig, data: AppData, meta: SyncMeta): Promise<SyncOutcome> {
  if (c.mode === 'supabase') return syncNow('supabase', data, meta, supabaseFetch(c.supabaseUrl!, c.supabaseAnonKey!, c.token!));
  return syncNow(c.endpoint, data, meta);
}
