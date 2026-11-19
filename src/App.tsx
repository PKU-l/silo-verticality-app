import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppData } from './model/store';
import { loadMeta, pendingChanges, runSync, saveMeta, syncConfigured, type SyncMeta } from './model/sync';
import { DRAWING_LABELS } from './calc/layout';
import type { Tip, TipHandler } from './charts/tips';
import type { Ctx } from './pages/ctx';
import { OverviewPage } from './pages/OverviewPage';
import { RoundPage } from './pages/RoundPage';
import { EntryPage } from './pages/EntryPage';
import { SiloPage } from './pages/SiloPage';
import { PointsPage } from './pages/PointsPage';
import { WallPage } from './pages/WallPage';
import { DataPage } from './pages/DataPage';
import { Settings } from './components/Settings';
import { HomePage } from './pages/HomePage';
import { DistRoundPage } from './pages/DistRoundPage';
import { DistEntry } from './pages/DistEntry';
import { PointPage } from './pages/PointPage';
import { CornersPage } from './pages/CornersPage';
import { IndicatorsPage } from './pages/IndicatorsPage';
import { MorePage } from './pages/MorePage';
import { BasePage } from './pages/BasePage';

/** 简单 hash 路由：#/overview、#/round、#/entry/14?round=..、#/silo/14、#/wall/14、#/points/14、#/settings、#/data */
function parseRoute(hash: string) {
  const h = hash.replace(/^#/, '') || '/home';
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(qs ?? '');
  return { page: parts[0] ?? 'home', id: parts[1] ? decodeURIComponent(parts[1]) : null, q };
}

const NAV: [string, string, string][] = [
  ['home', '/home', '九仓总览'],
  ['dist', '/dist', '八点录入'],
  ['corners', '/corners', '角仓位移'],
  ['round', '/round', '垂准仪'],
  ['more', '/more', '更多'],
];
/** 各页面归属的导航项 */
const NAV_OF: Record<string, string> = {
  home: 'home', point: 'home', dist: 'dist', dentry: 'dist', corners: 'corners',
  round: 'round', entry: 'round', silo: 'round', points: 'round', overview: 'more',
  more: 'more', bases: 'dist', settings: 'more', data: 'more', indicators: 'more', wall: 'more',
};

export default function App() {
  const { data, setData, savedAt } = useAppData();
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  const [toast, setToast] = useState('');
  const [tip, setTip] = useState<{ tip: Tip; x: number; y: number; pinned: boolean } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [meta, setMetaState] = useState<SyncMeta>(loadMeta);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); setTip(null); }, [route.page, route.id]);

  const notify = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? '' : t)), 6000); }, []);
  const go = useCallback((p: string) => { location.hash = p; }, []);
  const setMeta = (m: SyncMeta) => { setMetaState(m); saveMeta(m); };
  const pending = useMemo(() => pendingChanges(data, meta).length, [data, meta]);

  const run = useCallback(async () => {
    if (!syncConfigured(data.sync) || busy) return;
    setBusy(true);
    try {
      const out = await runSync(data.sync, data, meta);
      setData(() => out.data);
      setMeta(out.meta);
      notify('同步完成：' + out.meta.lastResult);
    } catch (e) {
      const m = { ...meta, lastResult: '同步失败：' + (e instanceof Error ? e.message : String(e)) + '（数据仍保存在本机）' };
      setMeta(m);
      notify(m.lastResult);
    } finally {
      setBusy(false);
    }
  }, [data, meta, busy]);

  // 恢复网络后自动同步
  useEffect(() => {
    if (online && syncConfigured(data.sync) && pending > 0 && !busy) {
      const t = window.setTimeout(run, 1500);
      return () => window.clearTimeout(t);
    }
  }, [online, pending, syncConfigured(data.sync)]);

  const labels = data.layout.orientationConfirmed ? data.config.labels : DRAWING_LABELS;
  const ctx: Ctx = {
    data, setData: (f) => setData((d) => f(d)), labels, showNorth: data.layout.orientationConfirmed, notify, go,
    sync: { meta, setMeta, pending, online, busy, run },
  };
  const onTip: TipHandler = (tp, ev, pin) => {
    setTip((cur) => {
      if (!tp) return cur?.pinned ? cur : null;
      if (cur?.pinned && !pin) return cur;
      return { tip: tp, x: ev?.clientX ?? 0, y: ev?.clientY ?? 0, pinned: !!pin };
    });
  };
  const hasDemo = data.plumbObs.some((x) => x.demo) || data.centerRecords.some((x) => x.demo) || data.lines.some((x) => x.demo) || data.distReadings.some((x) => x.demo);
  const valid = (id: string | null) => (id && data.silos.some((s) => s.id === id) ? id : null);

  let page;
  switch (route.page) {
    case 'round': page = <RoundPage ctx={ctx} highlight={route.q.get('saved')} />; break;
    case 'entry': page = <EntryPage key={location.hash} ctx={ctx} siloId={route.id ?? ''} roundId={route.q.get('round')} recId={route.q.get('rec')} groupId={route.q.get('group')} mode={route.q.get('mode')} />; break;
    case 'silo': page = <SiloPage ctx={ctx} siloId={route.id ?? ''} onTip={onTip} />; break;
    case 'points': page = <PointsPage ctx={ctx} siloId={route.id ?? ''} />; break;
    case 'wall': page = <WallPage key={route.id} ctx={ctx} siloId={valid(route.id) ?? '14'} onTip={onTip} />; break;
    case 'data': page = <DataPage ctx={ctx} />; break;
    case 'settings': page = <Settings key={JSON.stringify([data.config, data.layout.orientationConfirmed, data.thresholds, data.silos])} data={data} setData={ctx.setData} notify={notify} />; break;
    case 'overview': page = <OverviewPage ctx={ctx} />; break;
    case 'dist': page = <DistRoundPage ctx={ctx} saved={route.q.get('saved')} roundParam={route.q.get('round')} />; break;
    case 'dentry': page = <DistEntry key={location.hash} ctx={ctx} pointId={route.id ?? ''} roundId={route.q.get('round')} recId={route.q.get('rec')} />; break;
    case 'point': page = <PointPage ctx={ctx} pointId={route.id ?? ''} onTip={onTip} />; break;
    case 'corners': page = <CornersPage ctx={ctx} />; break;
    case 'indicators': page = <IndicatorsPage ctx={ctx} />; break;
    case 'more': page = <MorePage ctx={ctx} />; break;
    case 'bases': page = <BasePage ctx={ctx} />; break;
    default: page = <HomePage ctx={ctx} />;
  }
  const navActive = NAV_OF[route.page] ?? 'home';

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand" onClick={() => go('/home')}>
          <h1>筒仓滑模垂直度观测</h1>
          <span className="muted small">八点仓壁距离差 · {data.layout.orientationConfirmed ? `方向已确认（+${labels.xName}=${labels.posX} +${labels.yName}=${labels.posY}）` : '方向按图纸上下左右（未确认北向）'}</span>
        </div>
        <nav className="topnav">
          {NAV.map(([k, p, n]) => <a key={k} href={'#' + p} className={navActive === k ? 'active' : ''}>{n}</a>)}
        </nav>
        <div className="status-chips">
          {hasDemo && <span className="demo-banner">含演示数据</span>}
          <a href="#/data" className={'net ' + (online ? 'on' : 'off')}>
            {online ? '在线' : '离线'}{pending ? ` · 待同步 ${pending}` : ''}{meta.conflicts.length ? ` · 冲突 ${meta.conflicts.length}` : ''}
          </a>
          <span className="muted small hide-mobile">本机已保存 {savedAt}</span>
        </div>
      </header>

      <main>{page}</main>

      <nav className="bottomnav no-print">
        {NAV.map(([k, p, n]) => <a key={k} href={'#' + p} className={navActive === k ? 'active' : ''}>{n}</a>)}
      </nav>

      {tip && (
        <div className="tooltip" style={{ left: Math.max(8, Math.min(tip.x + 14, window.innerWidth - 340)), top: Math.max(8, Math.min(tip.y + 14, window.innerHeight - 280)) }}>
          <div className="tip-head"><b>{tip.tip.title}</b><button type="button" onClick={() => setTip(null)} aria-label="关闭">×</button></div>
          <table><tbody>{tip.tip.rows.map(([k, v], i) => <tr key={i}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
        </div>
      )}
      {toast && <div className="toast" onClick={() => setToast('')}>{toast}</div>}
    </div>
  );
}
