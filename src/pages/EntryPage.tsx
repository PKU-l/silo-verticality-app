/**
 * 单仓一屏录入（垂准仪）。
 * - 自动带入仓号、投影板及其已确认的固定偏置；不沿用上次读数；空白不视为零。
 * - 读数大小 + 方向按钮录入，减少正负号误填。
 * - 输入过程自动保存草稿（断点续录）；修改已保存记录时保留历史版本。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dir, PlumbObs, SpotQuality } from '../model/types';
import { siloTitle } from '../calc/layout';
import { indicatorFlag, indicatorText } from '../calc/distance';
import { QUALITY_TEXT, platformOffset, previousObs, reviewReasons } from '../calc/plumb';
import { describeOffset, fmt, fmtSigned } from '../calc/direction';
import { uid } from '../calc/csv';
import { nowLocal, toNum } from '../components/ui';
import type { Ctx } from './ctx';
import { OuterEntry } from './OuterEntry';

interface Form {
  plateId: string; time: string; elevation: string;
  qx: string; qxDir: Dir | null; qy: string; qyDir: Dir | null;
  quality: SpotQuality; surveyor: string; note: string;
}

const draftKey = (round: string, silo: string, rec: string) => `silo-draft:${round}:${silo}:${rec || 'new'}`;

/** 录入入口：有外侧垂准点的仓使用多点一屏录入，其余使用中心垂准仪录入 */
export function EntryPage({ ctx, siloId, roundId, recId, groupId, mode }: { ctx: Ctx; siloId: string; roundId: string | null; recId: string | null; groupId: string | null; mode: string | null }) {
  const rec = recId ? ctx.data.plumbObs.find((o) => o.id === recId) ?? null : null;
  const gid = groupId ?? (rec?.kind === 'outer' ? rec.groupId ?? null : null);
  const hasOuter = ctx.data.points.some((p) => p.siloId === siloId && p.type === 'outer-plumb' && p.active);
  const hasCenter = ctx.data.points.some((p) => p.siloId === siloId && p.type === 'plumb-plate' && p.active);
  if (!ctx.data.silos.some((s) => s.id === siloId))
    return <div className="page narrow"><p>仓号 “{siloId}” 不属于本组筒仓（{ctx.data.silos.map((s) => s.id).join('、')}）。</p></div>;
  const outer = gid ? true : rec ? false : hasOuter && mode !== 'center';
  return (
    <>
      {outer ? <OuterEntry ctx={ctx} siloId={siloId} roundId={roundId} groupId={gid} /> : <CenterEntry ctx={ctx} siloId={siloId} roundId={roundId} recId={recId} />}
      {!rec && !gid && hasOuter && hasCenter && (
        <p className="page entry small">
          {outer
            ? <a href={`#/entry/${siloId}?mode=center${roundId ? '&round=' + roundId : ''}`}>改用中心垂准仪录入</a>
            : <a href={`#/entry/${siloId}${roundId ? '?round=' + roundId : ''}`}>改用外侧垂准点录入</a>}
        </p>
      )}
    </>
  );
}

function CenterEntry({ ctx, siloId, roundId, recId }: { ctx: Ctx; siloId: string; roundId: string | null; recId: string | null }) {
  const { data, setData, labels: l } = ctx;
  const silo = data.silos.find((s) => s.id === siloId);
  const round = data.rounds.find((r) => r.id === roundId) ?? null;
  const existing = recId ? data.plumbObs.find((o) => o.id === recId) ?? null : null;
  const plates = data.points.filter((p) => p.siloId === siloId && p.type === 'plumb-plate' && (p.active || p.id === existing?.plateId));
  // 中心垂准仪记录：kind 为 center
  const dk = draftKey(roundId ?? '-', siloId, recId ?? '');

  const initial = (): Form => {
    try {
      const d = localStorage.getItem(dk);
      if (d) return JSON.parse(d) as Form;
    } catch { /* ignore */ }
    if (existing) {
      return {
        plateId: existing.plateId, time: existing.time, elevation: existing.elevation === null ? '' : String(existing.elevation),
        qx: existing.qx === null ? '' : String(existing.qx), qxDir: existing.qxDir,
        qy: existing.qy === null ? '' : String(existing.qy), qyDir: existing.qyDir,
        quality: existing.quality, surveyor: existing.surveyor, note: existing.note,
      };
    }
    // 新记录：只带入仓号/投影板/时间/测量人员，不带入任何上次读数
    return {
      plateId: plates[0]?.id ?? '', time: nowLocal(), elevation: '', qx: '', qxDir: null, qy: '', qyDir: null,
      quality: 'clear', surveyor: localStorage.getItem('silo-ui:surveyor') ?? '', note: '',
    };
  };
  const [f, setF] = useState<Form>(initial);
  const [restored] = useState(() => !!localStorage.getItem(dk));
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setTouched(true); setF((p) => ({ ...p, [k]: v })); };
  // 仅在用户实际输入后保存草稿（断点续录）
  useEffect(() => { if (touched) try { localStorage.setItem(dk, JSON.stringify(f)); } catch { /* ignore */ } }, [f, dk, touched]);

  if (!silo) return <div className="page narrow"><p>仓号 “{siloId}” 不属于本组筒仓（{data.silos.map((s) => s.id).join('、')}）。</p></div>;

  const plate = plates.find((p) => p.id === f.plateId) ?? null;
  // 修改旧记录时沿用其偏置快照；新记录使用投影板当前偏置
  const b = existing && existing.plateId === f.plateId
    ? { bx: existing.bx, by: existing.by, bConfirmed: existing.bConfirmed }
    : { bx: plate?.offsetX ?? null, by: plate?.offsetY ?? null, bConfirmed: !!plate?.offsetConfirmed };
  const nums = { e: toNum(f.elevation), qx: toNum(f.qx), qy: toNum(f.qy) };
  const errors: string[] = [];
  if (!plate) errors.push('该仓没有可用的投影板，请先在“测点”页登记');
  for (const [k, v] of [['平台标高', nums.e], ['X 读数', nums.qx], ['Y 读数', nums.qy]] as const) if (v !== null && Number.isNaN(v)) errors.push(`${k}不是有效数值`);
  if (nums.qx !== null && nums.qx < 0) errors.push('X 读数请填大小，用方向按钮选择方向');
  if (nums.qy !== null && nums.qy < 0) errors.push('Y 读数请填大小，用方向按钮选择方向');
  if (nums.qx !== null && !Number.isNaN(nums.qx) && f.qxDir === null) errors.push('请选择 X 读数方向');
  if (nums.qy !== null && !Number.isNaN(nums.qy) && f.qyDir === null) errors.push('请选择 Y 读数方向');
  if (nums.e === null) errors.push('请填写平台标高');

  const rec: PlumbObs = {
    id: existing?.id ?? 'preview', siloId, roundId: existing?.roundId ?? roundId, time: f.time,
    elevation: nums.e !== null && !Number.isNaN(nums.e) ? nums.e : null, plateId: f.plateId,
    qx: nums.qx !== null && !Number.isNaN(nums.qx) && nums.qx >= 0 ? nums.qx : null, qxDir: nums.qx === null ? null : f.qxDir,
    qy: nums.qy !== null && !Number.isNaN(nums.qy) && nums.qy >= 0 ? nums.qy : null, qyDir: nums.qy === null ? null : f.qyDir,
    ...b, kind: 'center', quality: f.quality, surveyor: f.surveyor, note: f.note, history: existing?.history, demo: existing?.demo,
  };
  const res = platformOffset(rec);
  const prev = previousObs(data.plumbObs, rec);
  const reasons = reviewReasons(rec, prev, data.config.jumpThresholdMm, [silo.elevMin, silo.elevMax]).filter((r) => !r.startsWith('缺少平台标高'));
  const recap = res.basePending
    ? `${siloId} 号仓：基准待确认，只保存原始读数，不输出平台中心偏移`
    : res.x === null && res.y === null
      ? `${siloId} 号仓：尚未录入读数`
      : `${siloId} 号仓平台中心${describeOffset(res.x, res.y, l, 1)}`;

  const save = () => {
    if (errors.length) { ctx.notify(errors.join('\n')); return; }
    const { history: _h, ...snapshotBase } = existing ?? ({} as PlumbObs);
    const history = existing ? [...(existing.history ?? []), { at: new Date().toISOString(), snapshot: snapshotBase as Omit<PlumbObs, 'history'> }] : undefined;
    const saved: PlumbObs = { ...rec, id: existing?.id ?? uid(), history };
    setData((d) => ({ ...d, plumbObs: existing ? d.plumbObs.map((o) => (o.id === existing.id ? saved : o)) : [...d.plumbObs, saved] }));
    try { localStorage.removeItem(dk); localStorage.setItem('silo-ui:surveyor', f.surveyor); } catch { /* ignore */ }
    ctx.notify(`已保存：${recap}`);
    ctx.go(roundId ? `/round?saved=${siloId}` : `/silo/${siloId}`);
  };

  return (
    <div className="page entry">
      <header className="entry-head">
        <div>
          <div className="entry-silo">{siloTitle(silo)}</div>
          <div className="muted small">{round ? round.name : '不属于任何轮次'}{existing ? ' · 修改已保存记录' : ''}{restored ? ' · 已恢复未保存草稿' : ''}</div>
        </div>
        <button type="button" onClick={() => ctx.go(roundId ? '/round' : `/silo/${siloId}`)}>返回</button>
      </header>

      <label className="field">
        <span className="field-label">投影板</span>
        <select value={f.plateId} onChange={(e) => set('plateId', e.target.value)}>
          {plates.map((p) => <option key={p.id} value={p.id}>{p.code}{p.active ? '' : '（已停用）'}</option>)}
        </select>
        <span className={'field-hint' + (b.bConfirmed ? '' : ' warn')}>
          固定偏置 b = ({fmtSigned(b.bx)}, {fmtSigned(b.by)}) mm　{b.bConfirmed ? '已确认' : '未确认 → 基准待确认，不输出平台偏移'}
        </span>
      </label>

      <div className="entry-row">
        <NumInput label="平台标高" unit="m" value={f.elevation} onChange={(v) => set('elevation', v)} />
        <label className="field">
          <span className="field-label">观测时间</span>
          <input type="datetime-local" value={f.time} onChange={(e) => set('time', e.target.value)} />
        </label>
      </div>

      <p className="muted small">读数为光斑相对投影板刻度原点的位置：填大小，再点光斑所在方向。未读的方向留空，不会按 0 处理。</p>
      <ReadingInput axis="X" label={l.xName} posName={l.posX} negName={l.negX} value={f.qx} dir={f.qxDir}
        onValue={(v) => set('qx', v)} onDir={(d) => set('qxDir', d)} />
      <ReadingInput axis="Y" label={l.yName} posName={l.posY} negName={l.negY} value={f.qy} dir={f.qyDir}
        onValue={(v) => set('qy', v)} onDir={(d) => set('qyDir', d)} />

      <div className="field">
        <span className="field-label">光斑状态</span>
        <div className="seg">
          {(Object.keys(QUALITY_TEXT) as SpotQuality[]).map((q) => (
            <button key={q} type="button" className={f.quality === q ? 'active' : ''} onClick={() => set('quality', q)}>{QUALITY_TEXT[q]}</button>
          ))}
        </div>
      </div>
      <div className="entry-row">
        <label className="field"><span className="field-label">测量人员</span><input value={f.surveyor} onChange={(e) => set('surveyor', e.target.value)} /></label>
        <label className="field"><span className="field-label">备注</span><input value={f.note} onChange={(e) => set('note', e.target.value)} /></label>
      </div>

      <div className="entry-actions">
        <div className="recap">
        <div className="calc small">
          q = ({fmtSigned(res.qx)}, {fmtSigned(res.qy)})　b = ({fmtSigned(res.bx)}, {fmtSigned(res.by)})
          {!res.basePending && <>　→ 平台中心 = −(q + b) = ({fmtSigned(res.x)}, {fmtSigned(res.y)}) mm</>}
          {res.resultant !== null && <>，合成 {fmt(res.resultant)} mm</>}
        </div>
        <div className="recap-text">{recap}</div>
        {!res.basePending && res.resultant !== null && <div className="muted small">{indicatorText('platform-center', indicatorFlag(data.indicators, 'platform-center', res.resultant, rec.elevation), res.resultant)}</div>}
        {reasons.length > 0 && <div className="recap-warn">保存后标记“待复核”：{reasons.join('；')}</div>}
        </div>
        <div className="entry-btns">
        <button className="primary big" type="button" onClick={save}>保存{roundId ? '并返回本轮' : ''}</button>
        <button type="button" onClick={() => { if (confirm('清空本页输入？')) { localStorage.removeItem(dk); setTouched(false); setF({ ...initial(), qx: '', qy: '', qxDir: null, qyDir: null, elevation: '', note: '' }); } }}>清空</button>
        </div>
      </div>
      {existing?.history && existing.history.length > 0 && (
        <details className="history">
          <summary>修改历史（{existing.history.length}）</summary>
          <HistoryList obs={existing} />
        </details>
      )}
    </div>
  );
}

export function NumInput({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span className="field-label">{label}（{unit}）</span>
      <span className="num-wrap">
        <input inputMode="decimal" enterKeyHint="next" value={value} onChange={(e) => onChange(e.target.value)} onFocus={keepVisible} />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );
}

/** 输入框获得焦点后滚动到可视区域中部，避免被软键盘遮挡 */
export function keepVisible(e: React.FocusEvent<HTMLElement>) {
  const el = e.currentTarget;
  window.setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
}

export function ReadingInput({ axis, label, posName, negName, value, dir, onValue, onDir }: {
  axis: 'X' | 'Y'; label: string; posName: string; negName: string; value: string; dir: Dir | null;
  onValue: (v: string) => void; onDir: (d: Dir) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const hint = useMemo(() => {
    const n = toNum(value);
    if (n === null) return '未读（留空）';
    if (Number.isNaN(n)) return '数值格式有误';
    if (!dir) return '请选择方向';
    return `光斑在刻度原点${dir === 'pos' ? posName : negName}侧 ${n} mm`;
  }, [value, dir, posName, negName]);
  return (
    <div className={'reading ' + (dir ? '' : 'nodir')}>
      <div className="reading-head"><b>{label} 方向读数</b><span className="muted small">{axis === 'X' ? '左右' : '上下'}向 · {hint}</span></div>
      <div className="reading-body">
        <button type="button" className={'dir-btn' + (dir === 'neg' ? ' active' : '')} onClick={() => { onDir('neg'); ref.current?.focus(); }}>{negName}</button>
        <span className="num-wrap">
          <input ref={ref} inputMode="decimal" value={value} placeholder="大小" onChange={(e) => onValue(e.target.value)} onFocus={keepVisible} aria-label={`${label} 读数大小`} />
          <span className="unit">mm</span>
        </span>
        <button type="button" className={'dir-btn' + (dir === 'pos' ? ' active' : '')} onClick={() => { onDir('pos'); ref.current?.focus(); }}>{posName}</button>
      </div>
    </div>
  );
}

export function HistoryList({ obs }: { obs: PlumbObs }) {
  return (
    <ul className="small">
      {(obs.history ?? []).slice().reverse().map((h, i) => {
        const s = h.snapshot;
        return (
          <li key={i}>
            {new Date(h.at).toLocaleString()} 之前的版本：标高 {fmt(s.elevation, 2)} m，X {s.qx ?? '—'}{s.qxDir ? (s.qxDir === 'pos' ? '(+)' : '(−)') : ''}，
            Y {s.qy ?? '—'}{s.qyDir ? (s.qyDir === 'pos' ? '(+)' : '(−)') : ''}，偏置 ({s.bx ?? '—'}, {s.by ?? '—'}){s.bConfirmed ? '' : '未确认'}，
            {QUALITY_TEXT[s.quality]}，{s.surveyor} {s.note}
          </li>
        );
      })}
    </ul>
  );
}

