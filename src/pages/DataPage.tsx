/** 数据管理：导入导出、备份、演示数据、离线同步与冲突核对 */
import type { AppData, PlumbObs } from '../model/types';
import { demoData } from '../model/defaults';
import { normalize } from '../model/store';
import { describeKey, keepLocal, syncConfigured, useServer } from '../model/sync';
import { useState } from 'react';
import { allCenters } from '../calc/center';
import { QUALITY_TEXT, measureOf } from '../calc/plumb';
import {
  download, exportCenterRecords, exportCenters, exportLines, exportReadings, importPlumbObs, toCsv,
} from '../calc/csv';
import { fmt } from '../calc/direction';
import { ImportBox, readFile } from '../components/ui';
import { exportDistPoints, exportDistReadings, importDistReadings } from '../calc/distCsv';
import type { Ctx } from './ctx';

export function DataPage({ ctx }: { ctx: Ctx }) {
  const { data, setData, labels: l, sync } = ctx;
  const hasDemo = ['centerRecords', 'lines', 'readings', 'points', 'plumbObs', 'rounds', 'distPoints', 'distReadings', 'indicators'].some((k) => (data[k as keyof AppData] as { demo?: boolean }[]).some((x) => x.demo));
  const stripDemo = (d: AppData): AppData => ({
    ...d,
    centerRecords: d.centerRecords.filter((x) => !x.demo), lines: d.lines.filter((x) => !x.demo), readings: d.readings.filter((x) => !x.demo),
    points: d.points.filter((x) => !x.demo), plumbObs: d.plumbObs.filter((x) => !x.demo), rounds: d.rounds.filter((x) => !x.demo),
    distReadings: d.distReadings.filter((x) => !x.demo), indicators: d.indicators.filter((x) => !x.demo),
    // 八点点位保留（点号固定），只清除演示基准值
    distPoints: d.distPoints.map((p) => (p.demo ? { ...p, baseElevation: null, baseDistance: null, baseConfirmed: false, directionConfirmed: false, lineDesc: '', surveyor: '', reviewer: '', reviewedAt: '', note: '', history: [], demo: false } : p)),
  });

  const exportPlumb = (list: PlumbObs[]) => {
    const plates = new Map(data.points.map((p) => [p.id, p.code]));
    const rounds = new Map(data.rounds.map((r) => [r.id, r.name]));
    const dn = (d: PlumbObs['qxDir'], a: 'X' | 'Y') => (d === null ? '' : a === 'X' ? (d === 'pos' ? l.posX : l.negX) : d === 'pos' ? l.posY : l.negY);
    return toCsv([
      ['仓号', '观测时间', '平台标高_m', '投影板编号', 'X读数_mm', 'X方向', 'Y读数_mm', 'Y方向', '测量人员', '光斑状态', '备注', '轮次', '测量方式', '观测组', '偏置或测站偏差X_mm', '偏置或测站偏差Y_mm', '已确认', `平台中心${l.xName}_mm`, `平台中心${l.yName}_mm`, '合成_mm', '扭转_度', '闭合差_mm'],
      ...list.map((o) => {
        const m = measureOf(list, o);
        const ok = !m.basePending;
        return [o.siloId, o.time.replace('T', ' '), o.elevation, plates.get(o.plateId), o.qx, dn(o.qxDir, 'X'), o.qy, dn(o.qyDir, 'Y'), o.surveyor, QUALITY_TEXT[o.quality], o.note,
          rounds.get(o.roundId ?? '') ?? '', o.kind === 'outer' ? '外侧垂准点' : '中心垂准仪', o.groupId ?? '', o.bx, o.by, o.bConfirmed ? '是' : '否',
          ok && m.x !== null ? fmt(m.x) : '', ok && m.y !== null ? fmt(m.y) : '', ok && m.resultant !== null ? fmt(m.resultant) : '',
          m.rotationDeg === null ? '' : m.rotationDeg.toFixed(4), m.residual === null ? '' : fmt(m.residual)];
      }),
    ]);
  };

  return (
    <div className="page settings">
      <section className="card-panel">
        <h3>离线与同步</h3>
        <p className="small">
          网络：<b className={sync.online ? 'text-ok' : 'text-warn'}>{sync.online ? '在线' : '离线'}</b>
          待同步：<b>{sync.pending}</b> 条　{sync.meta.lastSync ? `上次同步 ${new Date(sync.meta.lastSync).toLocaleString()}：${sync.meta.lastResult}` : '尚未同步'}
        </p>
        <p className="muted small">所有记录先保存在本机（断网可录入、刷新不丢失）。配置同步服务器后，恢复网络时自动上传；发生冲突时列在下方，由人工核对，不静默覆盖。演示数据不参与同步。</p>
        <SyncSettings ctx={ctx} />
        {sync.meta.conflicts.length > 0 && (
          <div className="conflicts">
            <h4>冲突待人工核对（{sync.meta.conflicts.length}）</h4>
            {sync.meta.conflicts.map((c) => (
              <div key={c.key} className="conflict">
                <b>{describeKey(c.key)}</b>
                <ConflictDiff local={c.local} server={c.server} version={c.serverVersion} />
                <div className="row gap">
                  <button type="button" onClick={() => { sync.setMeta(keepLocal(sync.meta, c.key)); ctx.notify('已选择保留本机版本，下次同步时上传'); }}>保留本机版本</button>
                  <button type="button" onClick={() => {
                    const r = useServer(data, sync.meta, c.key);
                    setData(() => r.data); sync.setMeta(r.meta); ctx.notify('已采用服务器版本');
                  }}>采用服务器版本</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card-panel">
        <h3>八点仓壁距离差（默认模式）</h3>
        <div className="row gap wrap">
          <button type="button" onClick={() => download('八点_底部基准.csv', exportDistPoints(data.distPoints))}>导出底部基准</button>
          <button type="button" onClick={() => download('八点_观测记录与计算.csv', exportDistReadings(data.distPoints, data.distReadings, (id) => data.rounds.find((r) => r.id === id)?.name ?? ''))}>导出观测记录（含原始读数与计算）</button>
        </div>
        <h4>导入八点观测记录</h4>
        <ImportBox template="点号, 观测时间, 观测标高(m), 本次距离(mm), 设计修正(mm，可空), 修正依据, 有效状态, 测量人员, 备注"
          placeholder={'12-上\t2026-09-26 08:30\t25.0\t147.5\t0\t0～30 m 竖直仓壁\t有效\t张工\t'}
          onImport={(text) => {
            const r = importDistReadings(text, data.distPoints, null);
            setData((d) => ({ ...d, distReadings: [...d.distReadings, ...r.items] }));
            ctx.notify(`导入 ${r.items.length} 条` + (r.messages.length ? '\n' + r.messages.join('\n') : ''));
          }} />
        <p className="muted small">导入的记录不属于任何轮次，也不会覆盖已有记录；空白距离保持空白，不按 0 处理。</p>
      </section>

      <section className="card-panel">
        <h3>导出 CSV（垂准仪与仓壁截面，可选模式）</h3>
        <div className="row gap wrap">
          <button type="button" onClick={() => download('垂准仪观测记录.csv', exportPlumb(data.plumbObs))}>垂准仪记录（含原始读数、偏置、换算）</button>
          <button type="button" onClick={() => download('方式A_中心偏移记录.csv', exportCenterRecords(data.centerRecords))}>仓壁 方式 A</button>
          <button type="button" onClick={() => download('方式B_观测线定义.csv', exportLines(data.lines, l))}>仓壁 观测线</button>
          <button type="button" onClick={() => download('方式B_原始读数与换算.csv', exportReadings(data.readings, data.lines, l))}>仓壁 原始读数</button>
          <button type="button" onClick={() => download('仓壁截面中心计算结果.csv', exportCenters(allCenters(data.centerRecords, data.lines, data.readings), l))}>仓壁 中心计算结果</button>
        </div>
        <h4>导入垂准仪记录</h4>
        <ImportBox template="仓号, 观测时间, 平台标高(m), 投影板编号, X读数(mm), X方向, Y读数(mm), Y方向, 测量人员, 光斑状态, 备注"
          placeholder={'14\t2026-09-24 08:30\t23.5\tP14-1\t11\t' + l.negX + '\t7\t' + l.posY + '\t张三\t光斑清晰稳定\t'}
          onImport={(text) => {
            const r = importPlumbObs(text, data.points, data.silos, l);
            setData((d) => ({ ...d, plumbObs: [...d.plumbObs, ...r.items] }));
            ctx.notify(`导入 ${r.items.length} 条` + (r.messages.length ? '\n' + r.messages.join('\n') : ''));
          }} />
        <p className="muted small">仓号必须属于 {data.silos.map((s) => s.id).join('、')}；投影板编号须已在“测点”页登记。导入记录带入投影板当前的偏置与确认状态。</p>
      </section>

      <section className="card-panel">
        <h3>完整备份</h3>
        <div className="row gap wrap">
          <button type="button" onClick={() => download(`筒仓观测备份_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...data, sync: { ...data.sync, token: '' } }, null, 1), 'application/json')}>导出 JSON 备份</button>
          <label className="file-btn">从 JSON 恢复
            <input type="file" accept=".json" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const d = normalize(JSON.parse(await readFile(f)));
                const bad = [...d.centerRecords.map((x) => x.siloId), ...d.lines.map((x) => x.siloId), ...d.plumbObs.map((x) => x.siloId)].filter((id) => !d.silos.some((s) => s.id === id));
                if (bad.length && !confirm(`备份中有 ${bad.length} 条记录的仓号不属于本组筒仓（如 ${bad[0]}），仍要恢复吗？这些记录将在核查提示中标出。`)) return;
                if (confirm('用备份文件替换当前全部数据？')) { setData(() => d); ctx.notify('已从备份恢复'); }
              } catch { ctx.notify('备份文件格式不正确'); }
            }} />
          </label>
        </div>
      </section>

      <section className="card-panel">
        <h3>演示数据</h3>
        <p className="muted small">
          八点：3 轮（10 m、20 m、35 m）。12-左 第 1 轮零变化；18-左 缺底部基准；16-右 方向待确认；16 号仓第 2 轮只有单侧；10 号仓第 2 轮两点标高不同（20 / 20.5 m）；
          第 3 轮 12 号仓设计修正 +4 mm，10-右 缺设计修正，10-上 读数存疑；演示指标为“未批准”。垂准仪（可选模式）：九仓中心投影板，12 号仓有固定偏置，11 号仓偏置未确认。仓壁：14 号仓方式 A；15 号仓四条铅垂线（30 m 处 −Y 侧缺读数）；16 号仓仅 +X 侧一条；17 号仓仅 ±X 一组。
        </p>
        <div className="row gap wrap">
          <button type="button" disabled={!hasDemo} onClick={() => {
            if (!confirm('清空所有标记为“演示”的数据？您录入的数据不受影响。')) return;
            setData(stripDemo);
            ctx.notify('演示数据已清空');
          }}>一键清空演示数据</button>
          <button type="button" onClick={() => {
            const demo = demoData(data.config);
            setData((d) => {
              const s = stripDemo(d);
              return { ...s, centerRecords: [...s.centerRecords, ...demo.centerRecords], lines: [...s.lines, ...demo.lines], readings: [...s.readings, ...demo.readings],
                points: [...s.points, ...demo.points], plumbObs: [...s.plumbObs, ...demo.plumbObs], rounds: [...s.rounds, ...demo.rounds],
                distPoints: s.distPoints.some((p) => p.baseDistance !== null) ? s.distPoints : demo.distPoints,
                distReadings: [...s.distReadings, ...demo.distReadings], indicators: [...s.indicators, ...demo.indicators], verticalWall: s.verticalWall.confirmed ? s.verticalWall : demo.verticalWall };
            });
            ctx.notify('已重新载入演示数据');
          }}>重新载入演示数据</button>
          <button type="button" className="danger" onClick={() => {
            if (confirm('清空全部观测数据与测点（含您录入的数据）？此操作不可撤销，建议先导出备份。'))
              setData((d) => ({ ...d, centerRecords: [], lines: [], readings: [], points: [], plumbObs: [], rounds: [], distReadings: [], indicators: [],
                distPoints: d.distPoints.map((p) => ({ ...p, baseElevation: null, baseDistance: null, baseConfirmed: false, directionConfirmed: false, lineDesc: '', surveyor: '', reviewer: '', reviewedAt: '', note: '', history: [], demo: false })) }));
          }}>清空全部数据</button>
        </div>
      </section>
    </div>
  );
}

const FIELD: Record<string, string> = {
  siloId: '仓号', time: '观测时间', elevation: '标高 m', plateId: '投影板', qx: 'X 读数', qxDir: 'X 方向', qy: 'Y 读数', qyDir: 'Y 方向',
  bx: '偏置 bX', by: '偏置 bY', bConfirmed: '偏置已确认', quality: '光斑状态', surveyor: '测量人员', note: '备注', roundId: '轮次',
  x: 'X', y: 'Y', reading: '读数', lineId: '观测线', name: '名称', code: '编号', offsetX: '偏置 X', offsetY: '偏置 Y', offsetConfirmed: '偏置已确认',
  active: '有效', order: '观测顺序', history: '修改历史',
};

/** 只列出两边不同的字段 */
function ConflictDiff({ local, server, version }: { local: unknown; server: unknown; version: number }) {
  const a = (local ?? {}) as Record<string, unknown>, b = (server ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} 项` : JSON.stringify(v)) : String(v));
  return (
    <table className="data-table compact small">
      <thead><tr><th>字段</th><th>本机版本{local === null ? '（已删除）' : ''}</th><th>服务器版本 v{version}{server === null ? '（已删除）' : ''}</th></tr></thead>
      <tbody>
        {keys.map((k) => <tr key={k}><td>{FIELD[k] ?? k}</td><td>{show(a[k])}</td><td>{show(b[k])}</td></tr>)}
        {keys.length === 0 && <tr><td colSpan={3} className="muted">内容相同，可任选一项</td></tr>}
      </tbody>
    </table>
  );
}

/** 同步方式设置：自建服务器 / Supabase */
function SyncSettings({ ctx }: { ctx: Ctx }) {
  const { data, setData, sync } = ctx;
  const [f, setF] = useState({
    mode: data.sync.mode ?? 'server', endpoint: data.sync.endpoint, supabaseUrl: data.sync.supabaseUrl ?? '',
    supabaseAnonKey: data.sync.supabaseAnonKey ?? '', token: data.sync.token ?? '',
  });
  const save = () => {
    setData((d) => ({ ...d, sync: { ...f, endpoint: f.endpoint.trim(), supabaseUrl: f.supabaseUrl.trim(), supabaseAnonKey: f.supabaseAnonKey.trim() } }));
    ctx.notify('同步设置已保存');
  };
  const ok = syncConfigured(data.sync);
  return (
    <div className="sync-settings">
      <div className="seg">
        <button type="button" className={f.mode === 'supabase' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'supabase' })}>Supabase</button>
        <button type="button" className={f.mode === 'server' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'server' })}>自建服务器</button>
      </div>
      {f.mode === 'supabase' ? (
        <div className="form-grid">
          <label className="field wide"><span className="field-label">Project URL</span>
            <input value={f.supabaseUrl} onChange={(e) => setF({ ...f, supabaseUrl: e.target.value })} placeholder="https://xxxx.supabase.co" /></label>
          <label className="field wide"><span className="field-label">anon public key（公开密钥，非 service_role）</span>
            <input value={f.supabaseAnonKey} onChange={(e) => setF({ ...f, supabaseAnonKey: e.target.value })} /></label>
          <label className="field wide"><span className="field-label">同步口令（与 SQL 中设置的一致；不随备份导出）</span>
            <input type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></label>
        </div>
      ) : (
        <label className="field"><span className="field-label">同步地址</span>
          <input value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} placeholder="/api 或 http://服务器:8787/api" /></label>
      )}
      <div className="row gap wrap">
        <button type="button" onClick={save}>保存同步设置</button>
        <button type="button" className="primary" disabled={!ok || !sync.online || sync.busy} onClick={() => sync.run()}>{sync.busy ? '同步中…' : '立即同步'}</button>
      </div>
      {!ok && <p className="text-warn small">未配置同步：数据仅保存在本机浏览器，请定期导出备份。</p>}
    </div>
  );
}
