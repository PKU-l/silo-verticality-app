import type { ReactNode } from 'react';
import type { Issue } from '../calc/validate';

/** 输入框字符串 → 数值；空串返回 null；无法解析返回 NaN */
export function toNum(s: string): number | null {
  const t = s.trim().replace('−', '-').replace(/[，,]/g, '.');
  if (t === '') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : NaN;
}

export function numStr(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: ReactNode; wide?: boolean }) {
  return (
    <label className={'field' + (wide ? ' wide' : '')}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function IssueBadge({ issues }: { issues?: Issue[] }) {
  if (!issues || issues.length === 0) return null;
  const err = issues.some((i) => i.level === 'error');
  return (
    <span className={'issue-badge ' + (err ? 'err' : 'warn')} title={issues.map((i) => '• ' + i.message).join('\n')}>
      {err ? '缺' : '!'}
      {issues.length > 1 ? issues.length : ''}
    </span>
  );
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsText(file, 'utf-8');
  });
}

export function ImportBox({ template, onImport, placeholder }: { template: string; onImport: (text: string) => void; placeholder?: string }) {
  return (
    <details className="import-box">
      <summary>批量粘贴 / CSV 导入</summary>
      <p className="muted small">列顺序：{template}。可从 Excel 直接复制粘贴（制表符分隔）或逗号分隔；首行表头可有可无。</p>
      <textarea rows={5} placeholder={placeholder} id={'paste-' + template.length} />
      <div className="row gap">
        <button type="button" onClick={(e) => {
          const ta = (e.currentTarget.closest('details') as HTMLElement).querySelector('textarea')!;
          if (ta.value.trim()) { onImport(ta.value); ta.value = ''; }
        }}>导入粘贴内容</button>
        <label className="file-btn">
          选择 CSV 文件
          <input type="file" accept=".csv,.txt" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onImport(await readFile(f));
            e.target.value = '';
          }} />
        </label>
      </div>
    </details>
  );
}
