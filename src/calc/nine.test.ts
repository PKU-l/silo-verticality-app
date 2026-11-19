import { describe, expect, it } from 'vitest';
import type { AppData, PlumbObs } from '../model/types';
import { DEFAULT_LAYOUT, defaultSilos, demoData } from '../model/defaults';
import { nextPending, platformCenters, platformOffset, reviewReasons, roundStatus, signed } from './plumb';
import { DEFAULT_GRID, isValidSiloId, placeSilos, positionLabel, projToDrawing, siloTitle } from './layout';
import { describeOffset } from './direction';
import { importCenterRecordsChecked } from './csv';
import { pendingChanges, syncNow, keepLocal, useServer, type SyncMeta } from '../model/sync';

function obs(p: Partial<PlumbObs>): PlumbObs {
  return {
    id: 'o' + Math.random(), siloId: '14', roundId: 'r', time: '2026-09-20T08:00', elevation: 20, plateId: 'p',
    qx: null, qxDir: null, qy: null, qyDir: null, bx: 0, by: 0, bConfirmed: true, quality: 'clear', surveyor: '', note: '', ...p,
  };
}

describe('九仓编号与图纸位置', () => {
  it('上排 12 11 10，中排 15 14 13，下排 18 17 16', () => {
    expect(DEFAULT_GRID).toEqual([['12', '11', '10'], ['15', '14', '13'], ['18', '17', '16']]);
    const s = defaultSilos();
    const at = (id: string) => s.find((x) => x.id === id)!;
    expect(positionLabel(at('14'))).toBe('中排中列');
    expect(positionLabel(at('12'))).toBe('上排左列');
    expect(positionLabel(at('10'))).toBe('上排右列');
    expect(positionLabel(at('18'))).toBe('下排左列');
    expect(positionLabel(at('16'))).toBe('下排右列');
    expect(positionLabel(at('13'))).toBe('中排右列');
    expect(siloTitle(at('14'))).toBe('14 号仓｜中排中列');
  });
  it('示意布置时 12 在左上、16 在右下；有中心距时按比例', () => {
    const { placed, mode } = placeSilos(defaultSilos(), DEFAULT_LAYOUT);
    expect(mode).toBe('schematic');
    const p = (id: string) => placed.find((x) => x.silo.id === id)!;
    expect(p('12').x).toBeLessThan(p('10').x);
    expect(p('12').y).toBeLessThan(p('18').y);
    expect(p('16').x).toBeGreaterThan(p('18').x);
    expect(p('16').y).toBeGreaterThan(p('10').y);
    const sp = placeSilos(defaultSilos(), { ...DEFAULT_LAYOUT, spacingX: 13, spacingY: 14 });
    expect(sp.mode).toBe('spacing');
    expect(sp.placed.find((x) => x.silo.id === '13')!.x).toBe(26);
  });
  it('仓号校验 10～18', () => {
    const s = defaultSilos();
    expect(isValidSiloId('14', s)).toBe(true);
    expect(isValidSiloId('19', s)).toBe(false);
    expect(isValidSiloId('A1', s)).toBe(false);
  });
  it('导入时拒绝不属于本组的仓号', () => {
    const r = importCenterRecordsChecked('19,2026-09-10 08:00,10,1,1,\n14,2026-09-10 08:00,10,1,1,', defaultSilos());
    expect(r.items.map((x) => x.siloId)).toEqual(['14']);
    expect(r.messages[0]).toContain('19');
  });
});

describe('项目坐标与图纸方向', () => {
  it('夹角 0：项目 +X 为图纸右，+Y 为图纸上', () => {
    expect(projToDrawing(1, 0, 0)).toEqual({ right: 1, up: 0 });
    expect(projToDrawing(0, 1, 0)).toEqual({ right: 0, up: 1 });
  });
  it('夹角 90°（项目 +Y 指向图纸右）：+X 指向图纸下', () => {
    const a = projToDrawing(0, 1, 90);
    expect(a.right).toBeCloseTo(1);
    expect(a.up).toBeCloseTo(0);
    const b = projToDrawing(1, 0, 90);
    expect(b.right).toBeCloseTo(0);
    expect(b.up).toBeCloseTo(-1);
  });
});

describe('垂准仪换算 −(q + b)', () => {
  it('b = 0：光斑在原点东 8、南 5 → 平台中心向西 8、向北 5', () => {
    const r = platformOffset(obs({ qx: 8, qxDir: 'pos', qy: 5, qyDir: 'neg' }));
    expect(r.qx).toBe(8);
    expect(r.qy).toBe(-5);
    expect(r.x).toBe(-8);
    expect(r.y).toBe(5);
    expect(r.resultant).toBeCloseTo(Math.hypot(8, 5));
  });
  it('固定偏置参与计算：q=(−31, +14)，b=(+35, −20) → 平台偏移 (−4, +6)', () => {
    const r = platformOffset(obs({ qx: 31, qxDir: 'neg', qy: 14, qyDir: 'pos', bx: 35, by: -20 }));
    expect(r.x).toBe(-4);
    expect(r.y).toBe(6);
  });
  it('东、西、南、北单方向', () => {
    expect(platformOffset(obs({ qx: 10, qxDir: 'neg', qy: 0, qyDir: 'pos' })).x).toBe(10); // 光斑在原点西 → 平台向东
    expect(platformOffset(obs({ qx: 10, qxDir: 'pos', qy: 0, qyDir: 'pos' })).x).toBe(-10);
    expect(platformOffset(obs({ qx: 0, qxDir: 'pos', qy: 10, qyDir: 'neg' })).y).toBe(10);
    expect(platformOffset(obs({ qx: 0, qxDir: 'pos', qy: 10, qyDir: 'pos' })).y).toBe(-10);
  });
  it('X、Y 为零', () => {
    const r = platformOffset(obs({ qx: 0, qxDir: 'pos', qy: 0, qyDir: 'pos' }));
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.resultant).toBe(0);
  });
  it('缺失方向不补零、不计算合成', () => {
    const r = platformOffset(obs({ qx: 6, qxDir: 'pos' }));
    expect(r.x).toBe(-6);
    expect(r.y).toBeNull();
    expect(r.resultant).toBeNull();
    expect(signed(5, null)).toBeNull();
    expect(signed(null, 'pos')).toBeNull();
  });
  it('偏置未确认 → 基准待确认，不输出偏移', () => {
    const r = platformOffset(obs({ qx: 6, qxDir: 'pos', qy: 2, qyDir: 'pos', bConfirmed: false }));
    expect(r.basePending).toBe(true);
    expect(r.x).toBeNull();
    expect(r.y).toBeNull();
    expect(r.qx).toBe(6);
    const c = platformCenters([obs({ qx: 6, qxDir: 'pos', qy: 2, qyDir: 'pos', bConfirmed: false })]);
    expect(c[0].x).toBeNull();
    expect(c[0].status).toBe('insufficient');
  });
  it('复述文字：平台中心向东 8 mm、向南 5 mm', () => {
    const r = platformOffset(obs({ qx: 8, qxDir: 'neg', qy: 5, qyDir: 'pos' }));
    const l = { posX: '东', negX: '西', posY: '北', negY: '南', xName: 'X', yName: 'Y' };
    expect(describeOffset(r.x, r.y, l, 0)).toBe('向东 8 mm、向南 5 mm');
  });
});

describe('本轮状态', () => {
  const round = { id: 'r', name: '', createdAt: '', order: ['16', '17', '18', '13', '14', '15', '10', '11', '12'], note: '' };
  it('待录入 / 已录入 / 数据不完整 / 待复核', () => {
    const all = [
      obs({ siloId: '16', qx: 1, qxDir: 'pos', qy: 1, qyDir: 'pos' }),
      obs({ siloId: '17', qx: 1, qxDir: 'pos' }),
      obs({ siloId: '18', qx: 1, qxDir: 'pos', qy: 1, qyDir: 'pos', quality: 'doubtful' }),
      obs({ siloId: '13', qx: 1, qxDir: 'pos', qy: 1, qyDir: 'pos', bConfirmed: false }),
    ];
    expect(roundStatus(round, '16', all, 20).status).toBe('done');
    expect(roundStatus(round, '17', all, 20).status).toBe('incomplete');
    expect(roundStatus(round, '18', all, 20).status).toBe('review');
    expect(roundStatus(round, '13', all, 20).status).toBe('review');
    expect(roundStatus(round, '14', all, 20).status).toBe('todo');
    expect(nextPending(round, all, '13')).toBe('14');
  });
  it('读数突变 → 待复核', () => {
    const prev = obs({ siloId: '14', time: '2026-09-19T08:00', qx: 0, qxDir: 'pos', qy: 0, qyDir: 'pos' });
    const cur = obs({ siloId: '14', qx: 30, qxDir: 'pos', qy: 0, qyDir: 'pos' });
    expect(reviewReasons(cur, prev, 20).some((x) => x.includes('突变'))).toBe(true);
  });
  it('演示数据：11 号仓基准待确认，13 号仓缺 Y，18 号仓第 1 轮未观测', () => {
    const d = demoData();
    const r1 = d.plumbObs.filter((o) => o.roundId === 'demo-round-1');
    const at = (id: string) => platformOffset(r1.find((o) => o.siloId === id)!);
    expect(at('11').basePending).toBe(true);
    expect(at('13').y).toBeNull();
    expect(r1.some((o) => o.siloId === '18')).toBe(false);
  });
});

describe('离线同步与冲突', () => {
  function server() {
    const items: Record<string, { version: number; data: unknown }> = {};
    const f = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/push')) {
        const { changes } = JSON.parse(String(init!.body));
        const results = changes.map((c: { key: string; baseVersion: number; data: unknown }) => {
          const cur = items[c.key];
          const v = cur ? cur.version : 0;
          if (c.baseVersion !== v) return { key: c.key, conflict: true, server: { version: v, data: cur?.data ?? null } };
          items[c.key] = { version: v + 1, data: c.data };
          return { key: c.key, ok: true, version: v + 1 };
        });
        return new Response(JSON.stringify({ results }));
      }
      return new Response(JSON.stringify({ items: Object.entries(items).map(([key, v]) => ({ key, ...v })) }));
    }) as unknown as typeof fetch;
    return { items, f };
  }
  const empty = (): SyncMeta => ({ versions: {}, snapshots: {}, conflicts: [], lastSync: '', lastResult: '' });
  const base = (): AppData => ({ ...demoData(), centerRecords: [], lines: [], readings: [], points: [], plumbObs: [], rounds: [] });

  it('演示数据不同步；新增记录计为待同步，同步后清零', async () => {
    const s = server();
    let d = demoData();
    expect(pendingChanges(d, empty())).toHaveLength(0);
    d = { ...base(), plumbObs: [obs({ id: 'x1', qx: 1, qxDir: 'pos' })] };
    expect(pendingChanges(d, empty())).toHaveLength(1);
    const out = await syncNow('/api', d, empty(), s.f);
    expect(out.pushed).toBe(1);
    expect(pendingChanges(out.data, out.meta)).toHaveLength(0);
  });

  it('两台设备改同一条记录 → 冲突，不静默覆盖', async () => {
    const s = server();
    const rec = obs({ id: 'x2', qx: 1, qxDir: 'pos' });
    const a = await syncNow('/api', { ...base(), plumbObs: [rec] }, empty(), s.f);
    const b = await syncNow('/api', base(), empty(), s.f); // 设备 B 拉取
    expect(b.data.plumbObs[0].qx).toBe(1);
    // 两边各自修改
    const a2 = await syncNow('/api', { ...a.data, plumbObs: [{ ...rec, qx: 2 }] }, a.meta, s.f);
    expect(a2.pushed).toBe(1);
    const b2 = await syncNow('/api', { ...b.data, plumbObs: [{ ...rec, qx: 3 }] }, b.meta, s.f);
    expect(b2.conflicts).toBe(1);
    expect(b2.data.plumbObs[0].qx).toBe(3); // 本机数据保留
    // 选择“采用服务器”
    const u = useServer(b2.data, b2.meta, 'plumbObs:x2');
    expect(u.data.plumbObs[0].qx).toBe(2);
    expect(u.meta.conflicts).toHaveLength(0);
    // 或“保留本机”后再次同步成功上传
    const k = keepLocal(b2.meta, 'plumbObs:x2');
    const b3 = await syncNow('/api', b2.data, k, s.f);
    expect(b3.pushed).toBe(1);
    expect(s.items['plumbObs:x2'].data).toMatchObject({ qx: 3 });
  });
});

import { overviewCells, elevationsOf } from './overview';

describe('九仓总览取数', () => {
  const d = demoData();
  const pc = platformCenters(d.plumbObs);
  it('同一标高：无记录的仓为“该标高无数据”或“未观测”，不当作零', () => {
    const cells = overviewCells(d.silos, pc, { kind: 'elevation', elevation: 23.5, tolerance: 0 });
    const at = (id: string) => cells.find((c) => c.silo.id === id)!;
    expect(at('14').state).toBe('ok');
    expect(at('14').obs!.elevation).toBe(23.5);
    expect(at('15').state).toBe('no-elev'); // 15 号仓第 2 轮在 23.0 m，不能当作 23.5 m
    expect(at('10').state).toBe('no-elev');
    expect(at('10').obs).toBeNull();
    const c20 = overviewCells(d.silos, pc, { kind: 'elevation', elevation: 20, tolerance: 0 });
    expect(c20.find((c) => c.silo.id === '18')!.state).toBe('none'); // 18 号仓从未观测
    expect(c20.find((c) => c.silo.id === '11')!.state).toBe('base-pending');
    expect(c20.find((c) => c.silo.id === '13')!.state).toBe('x-only');
  });
  it('容差只在用户设置时放宽', () => {
    const cells = overviewCells(d.silos, pc, { kind: 'elevation', elevation: 23.5, tolerance: 0.5 });
    expect(cells.find((c) => c.silo.id === '15')!.obs!.elevation).toBe(23.0);
  });
  it('最近一次模式：各仓保留自己的实际标高', () => {
    const cells = overviewCells(d.silos, pc, { kind: 'latest' });
    expect(cells.find((c) => c.silo.id === '15')!.obs!.elevation).toBe(23.0);
    expect(cells.find((c) => c.silo.id === '10')!.obs!.elevation).toBe(20);
    expect(elevationsOf(pc)).toEqual([23.5, 23, 20]);
  });
});

import { supabaseFetch } from '../model/sync';

describe('Supabase 同步映射', () => {
  it('push/pull 映射到 silo_sync_push / silo_sync_pull，并带口令与 anon key', async () => {
    const items: Record<string, { version: number; data: unknown }> = {};
    const calls: { url: string; headers: Record<string, string>; body: { p_token: string; p_changes?: { key: string; baseVersion: number; data: unknown }[] } }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url, headers: init.headers as Record<string, string>, body });
      if (body.p_token !== 'pw') return new Response(JSON.stringify({ message: '同步口令不正确' }), { status: 400 });
      if (url.endsWith('silo_sync_push')) {
        const results = body.p_changes.map((c: { key: string; baseVersion: number; data: unknown }) => {
          const v = items[c.key]?.version ?? 0;
          if (c.baseVersion !== v) return { key: c.key, conflict: true, server: { version: v, data: items[c.key]?.data ?? null } };
          items[c.key] = { version: v + 1, data: c.data };
          return { key: c.key, ok: true, version: v + 1 };
        });
        return new Response(JSON.stringify({ results }));
      }
      return new Response(JSON.stringify({ items: Object.entries(items).map(([key, v]) => ({ key, ...v })) }));
    }) as unknown as typeof fetch;

    const d = { ...demoData(), plumbObs: [obs({ id: 's1', qx: 3, qxDir: 'pos' })] };
    const meta: SyncMeta = { versions: {}, snapshots: {}, conflicts: [], lastSync: '', lastResult: '' };
    const out = await syncNow('supabase', d, meta, supabaseFetch('https://abc.supabase.co/', 'ANON', 'pw', fake));
    expect(out.pushed).toBe(1);
    expect(calls[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/silo_sync_push');
    expect(calls[0].headers.apikey).toBe('ANON');
    expect(calls[0].body.p_changes![0].key).toBe('plumbObs:s1');
    expect(calls[1].url).toBe('https://abc.supabase.co/rest/v1/rpc/silo_sync_pull');
    // 口令错误 → 抛出可读错误，本机数据不变
    await expect(syncNow('supabase', { ...d, plumbObs: [obs({ id: 's2' })] }, out.meta, supabaseFetch('https://abc.supabase.co', 'ANON', 'bad', fake)))
      .rejects.toThrow('同步口令不正确');
  });
});
