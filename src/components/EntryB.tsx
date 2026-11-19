/** 方式 B：铅垂线 / 固定基准测点读数 */
import { useMemo, useState } from 'react';
import type { AppData, Cardinal, LineReading, PlumbLine, Side } from '../model/types';
import type { Issue } from '../calc/validate';
import {
  allowedPositiveDirs, cardinalLabel, describeComponent, fmt, fmtSigned, lineDisplacement, sideLabel,
} from '../calc/direction';
import { centersFromPlumb } from '../calc/center';
import { importLinesChecked, importReadings, uid } from '../calc/csv';
import { Field, ImportBox, IssueBadge, nowLocal, numStr, toNum } from './ui';

interface Props {
  data: AppData;
  setData: (f: (d: AppData) => AppData) => void;
  siloId: string;
  issues: Map<string, Issue[]>;
  highlight: Set<string>;
  onPick: (readingId: string) => void;
  notify: (msg: string) => void;
}

type LineForm = { id: string | null; name: string; side: Side; azimuthText: string; basePosition: string; positiveDir: Cardinal | ''; positiveText: string; baseReading: string; note: string };
type ReadForm = { id: string | null; lineId: string; time: string; elevation: string; reading: string; note: string };

export function EntryB({ data, setData, siloId, issues, highlight, onPick, notify }: Props) {
  const l = data.config.labels;
  const lines = data.lines.filter((x) => x.siloId === siloId);
  const blankLine = (): LineForm => ({ id: null, name: '', side: 'E', azimuthText: '', basePosition: '', positiveDir: 'W', positiveText: '', baseReading: '', note: '' });
  const [lf, setLf] = useState<LineForm>(blankLine);
  const blankRead = (): ReadForm => ({ id: null, lineId: lines[0]?.id ?? '', time: nowLocal(), elevation: '', reading: '', note: '' });
  const [rf, setRf] = useState<ReadForm>(blankRead);
  const lineId = lines.some((x) => x.id === rf.lineId) ? rf.lineId : lines[0]?.id ?? '';
  const curLine = lines.find((x) => x.id === lineId);

  const saveLine = () => {
    const base = toNum(lf.baseReading);
    if (!lf.name.trim()) return notify('请填写观测线名称');
    if (base !== null && Number.isNaN(base)) return notify('基准读数格式有误');
    const pd = lf.side === 'OTHER' ? null : (lf.positiveDir || null);
    if (lf.side !== 'OTHER' && (!pd || !allowedPositiveDirs(lf.side).includes(pd)))
      return notify('请选择与测点方位同轴的读数增大方向');
    const line: PlumbLine = {
      id: lf.id ?? uid(), siloId, name: lf.name.trim(), side: lf.side, azimuthText: lf.azimuthText,
      basePosition: lf.basePosition, positiveDir: pd, positiveText: lf.positiveText, baseReading: base, note: lf.note,
    };
    setData((d) => ({ ...d, lines: lf.id ? d.lines.map((x) => (x.id === lf.id ? { ...line, demo: x.demo } : x)) : [...d.lines, line] }));
    notify(lf.id ? '观测线已更新（相关读数将按新定义重新换算，原始读数不变）' : '已新增观测线');
    setLf(blankLine());
  };

  const rNum = toNum(rf.reading), eNum = toNum(rf.elevation);
  const preview = curLine && rNum !== null && !Number.isNaN(rNum)
    ? lineDisplacement(curLine, { id: '', lineId: curLine.id, time: '', elevation: eNum, reading: rNum, note: '' })
    : null;

  const saveReading = () => {
    if (!curLine) return notify('请先定义观测线');
    if ([rNum, eNum].some((v) => v !== null && Number.isNaN(v))) return notify('数值格式有误');
    const r: LineReading = { id: rf.id ?? uid(), lineId, time: rf.time, elevation: eNum, reading: rNum, note: rf.note };
    setData((d) => ({ ...d, readings: rf.id ? d.readings.map((x) => (x.id === rf.id ? { ...r, flags: x.flags } : x)) : [...d.readings, r] }));
    notify(rf.id ? '读数已更新' : '已新增读数');
    setRf({ ...blankRead(), lineId, time: rf.time, elevation: rf.id ? '' : rf.elevation });
  };

  const lineIds = new Set(lines.map((x) => x.id));
  const readings = data.readings
    .filter((r) => lineIds.has(r.lineId))
    .sort((a, b) => a.time.localeCompare(b.time) || (a.elevation ?? 0) - (b.elevation ?? 0) || a.lineId.localeCompare(b.lineId));
  const lineById = new Map(lines.map((x) => [x.id, x]));

  return (
    <div className="panel-body">
      <Formula labels={l} />

      <h4>① 观测线定义（筒仓 {siloId}）</h4>
      <div className="form-grid">
        <Field label="名称"><input value={lf.name} onChange={(e) => setLf({ ...lf, name: e.target.value })} placeholder="如 E1 东侧铅垂线" /></Field>
        <Field label="测点方位">
          <select value={lf.side} onChange={(e) => {
            const side = e.target.value as Side;
            const allowed = allowedPositiveDirs(side);
            setLf({ ...lf, side, positiveDir: allowed.includes(lf.positiveDir as Cardinal) ? lf.positiveDir : allowed[1] ?? '' });
          }}>
            {(['E', 'W', 'N', 'S', 'OTHER'] as Side[]).map((s) => <option key={s} value={s}>{sideLabel(s, l)}</option>)}
          </select>
        </Field>
        {lf.side === 'OTHER' && (
          <Field label="方位说明"><input value={lf.azimuthText} onChange={(e) => setLf({ ...lf, azimuthText: e.target.value })} placeholder="如 东北 45°" /></Field>
        )}
        <Field label="基准位置" wide><input value={lf.basePosition} onChange={(e) => setLf({ ...lf, basePosition: e.target.value })} placeholder="如 东侧仓壁外悬挂铅垂线，读数为线至仓壁外表面距离" /></Field>
        {lf.side !== 'OTHER' ? (
          <Field label="读数增大时，仓壁测点移动方向（正方向）" wide
            hint={lf.positiveDir ? `读数每增大 1 mm，表示测点向${cardinalLabel(lf.positiveDir as Cardinal, l)}移动 1 mm` : undefined}>
            <select value={lf.positiveDir} onChange={(e) => setLf({ ...lf, positiveDir: e.target.value as Cardinal })}>
              {allowedPositiveDirs(lf.side).map((c) => <option key={c} value={c}>向{cardinalLabel(c, l)}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="读数增大方向说明" wide hint="其他方位测点只作局部读数视图，不参与中心偏移换算">
            <input value={lf.positiveText} onChange={(e) => setLf({ ...lf, positiveText: e.target.value })} />
          </Field>
        )}
        <Field label="基准读数 (mm)"><input inputMode="decimal" value={lf.baseReading} onChange={(e) => setLf({ ...lf, baseReading: e.target.value })} /></Field>
        <Field label="备注"><input value={lf.note} onChange={(e) => setLf({ ...lf, note: e.target.value })} /></Field>
      </div>
      <div className="row gap">
        <button className="primary" type="button" onClick={saveLine}>{lf.id ? '保存观测线' : '新增观测线'}</button>
        {lf.id && <button type="button" onClick={() => setLf(blankLine())}>取消编辑</button>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th></th><th>名称</th><th>方位</th><th>读数增大 →</th><th>基准读数</th><th>基准位置</th><th></th></tr></thead>
          <tbody>
            {lines.map((x) => (
              <tr key={x.id}>
                <td><IssueBadge issues={issues.get(x.id)} />{x.demo && <span className="demo-tag">演示</span>}</td>
                <td>{x.name}</td>
                <td>{x.side === 'OTHER' ? x.azimuthText || '其他' : sideLabel(x.side, l)}</td>
                <td>{x.positiveDir ? '向' + cardinalLabel(x.positiveDir, l) : x.positiveText || '—'}</td>
                <td>{fmt(x.baseReading, 1)}</td>
                <td className="small">{x.basePosition}</td>
                <td className="nowrap">
                  <button className="link" type="button" onClick={() => setLf({
                    id: x.id, name: x.name, side: x.side, azimuthText: x.azimuthText, basePosition: x.basePosition,
                    positiveDir: x.positiveDir ?? '', positiveText: x.positiveText, baseReading: numStr(x.baseReading), note: x.note,
                  })}>编辑</button>
                  <button className="link danger" type="button" onClick={() => {
                    const n = data.readings.filter((r) => r.lineId === x.id).length;
                    if (confirm(`删除观测线“${x.name}”及其 ${n} 条原始读数？`))
                      setData((d) => ({ ...d, lines: d.lines.filter((z) => z.id !== x.id), readings: d.readings.filter((r) => r.lineId !== x.id) }));
                  }}>删除</button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={7} className="muted center">暂无观测线</td></tr>}
          </tbody>
        </table>
      </div>
      <ImportBox template="筒仓编号, 名称, 方位(东/西/南/北/其他), 基准位置, 读数增大方向, 基准读数(mm), 备注"
        onImport={(text) => {
          const res = importLinesChecked(text, l, data.silos);
          setData((d) => ({ ...d, lines: [...d.lines, ...res.items] }));
          notify(`导入 ${res.items.length} 条观测线` + (res.messages.length ? '\n' + res.messages.join('\n') : ''));
        }} />

      <h4>② 读数录入</h4>
      <div className="form-grid">
        <Field label="观测线">
          <select value={lineId} onChange={(e) => setRf({ ...rf, lineId: e.target.value })}>
            {lines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="观测时间"><input type="datetime-local" value={rf.time} onChange={(e) => setRf({ ...rf, time: e.target.value })} /></Field>
        <Field label="观测标高 (m)"><input inputMode="decimal" value={rf.elevation} onChange={(e) => setRf({ ...rf, elevation: e.target.value })} /></Field>
        <Field label="读数 (mm)"><input inputMode="decimal" value={rf.reading} onChange={(e) => setRf({ ...rf, reading: e.target.value })} /></Field>
        <Field label="备注" wide><input value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} /></Field>
      </div>
      <div className="live-explain">
        {!curLine ? <span className="muted">请先定义观测线</span> : preview ? (
          <>
            原始读数 <b>{fmt(rNum, 1)}</b> − 基准读数 <b>{fmt(curLine.baseReading, 1)}</b> = <b>{fmtSigned(preview.along)} mm</b>
            {preview.dx !== null ? (
              <>　→ 测点<b>{describeComponent(curLine.side === 'E' || curLine.side === 'W' ? preview.dx : preview.dy,
                curLine.side === 'E' || curLine.side === 'W' ? 'X' : 'Y', l)}</b></>
            ) : <span className="muted">　（其他方位，仅局部读数）</span>}
          </>
        ) : <span className="muted">输入读数后实时显示换算过程</span>}
      </div>
      <div className="row gap">
        <button className="primary" type="button" onClick={saveReading}>{rf.id ? '保存修改' : '新增读数'}</button>
        {rf.id && <button type="button" onClick={() => setRf(blankRead())}>取消编辑</button>}
      </div>
      <ImportBox template="筒仓编号, 观测线名称, 观测时间, 标高(m), 读数(mm), 备注" placeholder={'A2\tE1 东侧铅垂线\t2026-09-12 09:00\t40.5\t140.1\t'}
        onImport={(text) => {
          const res = importReadings(text, data.lines);
          setData((d) => ({ ...d, readings: [...d.readings, ...res.items] }));
          notify(`导入 ${res.items.length} 条读数` + (res.messages.length ? '\n' + res.messages.join('\n') : ''));
        }} />

      <h4>筒仓 {siloId} 原始读数（{readings.length}）</h4>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th></th><th>观测线</th><th>时间</th><th>标高 m</th><th>读数</th><th>基准</th><th>差值</th><th>测点位移</th><th></th></tr></thead>
          <tbody>
            {readings.map((r) => {
              const line = lineById.get(r.lineId)!;
              const d = lineDisplacement(line, r);
              const axis = line.side === 'E' || line.side === 'W' ? 'X' : 'Y';
              return (
                <tr key={r.id} id={'row-' + r.id} className={highlight.has(r.id) ? 'hl' : ''} onClick={() => onPick(r.id)}>
                  <td><IssueBadge issues={issues.get(r.id)} />{r.demo && <span className="demo-tag">演示</span>}</td>
                  <td className="small">{line.name}</td>
                  <td className="small">{r.time.replace('T', ' ')}</td>
                  <td>{fmt(r.elevation, 2)}</td>
                  <td>{fmt(r.reading, 1)}</td>
                  <td>{fmt(line.baseReading, 1)}</td>
                  <td>{d ? fmtSigned(d.along) : '—'}</td>
                  <td className="small">{d && d.dx !== null ? describeComponent(axis === 'X' ? d.dx : d.dy, axis, l) : '—'}</td>
                  <td className="nowrap">
                    <button className="link" type="button" onClick={(e) => {
                      e.stopPropagation();
                      setRf({ id: r.id, lineId: r.lineId, time: r.time, elevation: numStr(r.elevation), reading: numStr(r.reading), note: r.note });
                    }}>编辑</button>
                    <button className="link danger" type="button" onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('删除这条原始读数？')) setData((dd) => ({ ...dd, readings: dd.readings.filter((z) => z.id !== r.id) }));
                    }}>删除</button>
                  </td>
                </tr>
              );
            })}
            {readings.length === 0 && <tr><td colSpan={9} className="muted center">暂无读数</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 公式说明，并用同一套计算函数对示例数据现场验算符号方向 */
function Formula({ labels: l }: { labels: AppData['config']['labels'] }) {
  const example = useMemo(() => {
    const mk = (side: Cardinal, pos: Cardinal): PlumbLine => ({
      id: side, siloId: 'EX', name: side, side, azimuthText: '', basePosition: '', positiveDir: pos, positiveText: '', baseReading: 100, note: '',
    });
    const lines = [mk('E', 'W'), mk('W', 'E'), mk('N', 'S'), mk('S', 'N')];
    const rd = (id: string, v: number): LineReading => ({ id: id + v, lineId: id, time: '2000-01-01T00:00', elevation: 10, reading: v, note: '' });
    const [o] = centersFromPlumb(lines, [rd('E', 92), rd('W', 106), rd('N', 97), rd('S', 101)]);
    return o;
  }, []);
  return (
    <details className="formula">
      <summary>换算公式与符号验证（点击展开）</summary>
      <ol className="small">
        <li>单个测点：<code>读数差 = 读数 − 基准读数</code>；测点位移 = 读数差 × “读数增大方向”的单位向量。<br />
          例：{l.posX}侧铅垂线读数为“线到仓壁外表面距离”，仓壁向{l.posX}移动时距离减小，故读数增大方向应设为“向{l.negX}”。</li>
        <li>{l.posX}、{l.negX}两侧测点在同一批次、同一标高均有读数时：<br />
          <code>{l.xName} 中心偏移 = ({l.posX}侧 {l.xName} 位移 + {l.negX}侧 {l.xName} 位移) / 2</code><br />
          <code>{l.xName} 向尺寸变化 = {l.posX}侧 {l.xName} 位移 − {l.negX}侧 {l.xName} 位移</code>（正值为直径增大）</li>
        <li>{l.posY}、{l.negY}两侧同理求 {l.yName}。</li>
        <li>只有一侧读数时，只显示该测点位移，标记“中心偏移数据不足”，不推测其余方向。</li>
      </ol>
      <div className="example small">
        <b>示例验算</b>（基准读数均为 100 mm；{l.posX}侧 92、{l.negX}侧 106、{l.posY}侧 97、{l.negY}侧 101）：<br />
        {l.posX}侧：92 − 100 = −8，读数增大方向为向{l.negX}，故测点{describeComponent(example.sides!.E!.dx, 'X', l)}；
        {l.negX}侧：106 − 100 = +6，读数增大方向为向{l.posX}，故测点{describeComponent(example.sides!.W!.dx, 'X', l)}。<br />
        {l.xName} 中心 = ({fmtSigned(example.sides!.E!.dx)} + {fmtSigned(example.sides!.W!.dx)}) / 2 = <b>{fmtSigned(example.x)} mm</b>（{describeComponent(example.x, 'X', l)}）；
        {l.xName} 向尺寸变化 = {fmtSigned(example.diamX ?? null)} mm。<br />
        {l.yName} 中心 = ({fmtSigned(example.sides!.N!.dy)} + {fmtSigned(example.sides!.S!.dy)}) / 2 = <b>{fmtSigned(example.y)} mm</b>（{describeComponent(example.y, 'Y', l)}）；
        {l.yName} 向尺寸变化 = {fmtSigned(example.diamY ?? null)} mm。<br />
        <span className="muted">以上结果由程序实际计算函数现场得出，用于核对符号方向。</span>
      </div>
    </details>
  );
}
