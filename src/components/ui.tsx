import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { X, AlertTriangle, Info, CircleCheck, CircleAlert, CircleX } from 'lucide-react';
import type { Health, Project, User } from '../domain/types';
import { db, getVersion, me, subscribe } from '../data/store';
import { BRAND } from '../brand';

// ───────── store hooks ─────────
export function useStore() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return db;
}
export function useMe(): User {
  useStore();
  return me();
}

// ───────── toasts ─────────
type ToastMsg = { id: number; text: string; kind: 'info' | 'error' };
let toasts: ToastMsg[] = [];
const toastSubs = new Set<() => void>();
export function toast(text: string, kind: 'info' | 'error' = 'info') {
  const t = { id: Date.now() + Math.random(), text, kind };
  toasts = [...toasts, t];
  toastSubs.forEach((f) => f());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastSubs.forEach((f) => f());
  }, kind === 'error' ? 8000 : 4000);
}
export function Toaster() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    toastSubs.add(f);
    return () => void toastSubs.delete(f);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.kind === 'error' ? <CircleAlert size={18} /> : <CircleCheck size={18} />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Wrap an async action: busy state + error toast. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast(success);
      return r;
    } catch (e: any) {
      toast(e?.message || String(e), 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { run, busy };
}

// ───────── prompt / confirm dialogs ─────────
interface PromptReq {
  title: string;
  label?: string;
  message?: string;
  placeholder?: string;
  confirm?: string;
  required?: boolean;
  multiline?: boolean;
  input?: boolean;
  danger?: boolean;
  resolve: (v: string | null) => void;
}
let promptReq: PromptReq | null = null;
const promptSubs = new Set<() => void>();
export function ask(opts: Omit<PromptReq, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    promptReq = { input: true, ...opts, resolve };
    promptSubs.forEach((f) => f());
  });
}
export const confirmAsk = (title: string, message: string, confirm = 'Confirm', danger = false) => ask({ title, message, confirm, input: false, danger }).then((v) => v !== null);
export function DialogHost() {
  const [, set] = useState(0);
  const [value, setValue] = useState('');
  useEffect(() => {
    const f = () => {
      setValue('');
      set((n) => n + 1);
    };
    promptSubs.add(f);
    return () => void promptSubs.delete(f);
  }, []);
  if (!promptReq) return null;
  const r = promptReq;
  const close = (v: string | null) => {
    promptReq = null;
    set((n) => n + 1);
    r.resolve(v);
  };
  const invalid = r.input && r.required && !value.trim();
  return (
    <Modal title={r.title} size="sm" onClose={() => close(null)} footer={
      <>
        <button className="btn" onClick={() => close(null)}>Cancel</button>
        <button className={`btn ${r.danger ? 'danger solid' : 'primary'}`} disabled={!!invalid} onClick={() => close(r.input ? value : 'ok')}>{r.confirm || 'OK'}</button>
      </>
    }>
      <div className="stack">
        {r.message && <p>{r.message}</p>}
        {r.input && (
          <Field label={r.label || 'Value'} required={r.required}>
            {r.multiline !== false ? <textarea autoFocus value={value} placeholder={r.placeholder} onChange={(e) => setValue(e.target.value)} /> : <input autoFocus value={value} placeholder={r.placeholder} onChange={(e) => setValue(e.target.value)} />}
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ───────── layout pieces ─────────
export function Modal({ title, onClose, children, footer, size }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Card({ title, meta, actions, children, flush, className }: { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`card ${className ?? ''}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {meta && <span className="meta">{meta}</span>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? 'flush' : ''}`}>{children}</div>
    </section>
  );
}

export function Field({ label, required, help, children, full }: { label: ReactNode; required?: boolean; help?: ReactNode; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>
        {label}
        {required && <span className="req" aria-hidden>*</span>}
      </label>
      {children}
      {help && <span className="help">{help}</span>}
    </div>
  );
}

export function Kpi({ label, value, hint, onClick }: { label: string; value: ReactNode; hint?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`kpi ${onClick ? 'link' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'crit'; children: ReactNode }) {
  const Icon = kind === 'crit' ? CircleX : kind === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`notice ${kind === 'info' ? '' : kind}`}>
      <Icon size={18} style={{ flex: 'none', marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

// ───────── status pieces ─────────
export function HealthBadge({ value, label }: { value?: Health | string; label?: string }) {
  if (!value) return <span className="health none"><i />{label ?? 'Not reported'}</span>;
  return (
    <span className={`health ${value}`} title={`${label ? label + ': ' : ''}${value}`}>
      <i aria-hidden />
      {label ?? value}
    </span>
  );
}

const STAGE_TONE: Record<string, string> = { Draft: '', Initiate: 'blue', Plan: 'blue', 'ACT Readiness': 'blue', 'ACT Approved / Execute Ready': 'blue', Execute: 'navy', 'Go-Live / Hypercare': 'navy', Close: 'good', Archive: '' };
export const StagePill = ({ stage }: { stage: string }) => <span className={`pill ${STAGE_TONE[stage] ?? ''}`}>{stage}</span>;
const STATUS_TONE: Record<string, string> = { Active: 'good', 'On Hold': 'warn', Withdrawn: '', Rejected: 'crit', 'Closed Complete': 'good', Archived: '' };
export const StatusPill = ({ status }: { status: string }) => <span className={`pill ${STATUS_TONE[status] ?? ''}`}>{status}</span>;
export const NdaBadge = ({ p }: { p: Project }) => (p.ndaActive ? <span className="nda-badge" title="Confidential NDA project – visible only to the approved access list">NDA · Confidential</span> : null);

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}
export const Avatar = ({ user }: { user?: User }) => <span className={`avatar ${user?.external ? 'ext' : ''}`}>{initials(user?.name)}</span>;

// ───────── hover tooltip for charts ─────────
export function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const handlers = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX + 12, y: e.clientY + 12, text }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => {
      const r = (e.target as HTMLElement).getBoundingClientRect();
      setTip({ x: r.right + 8, y: r.top, text });
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
    'aria-label': text,
  });
  const node = tip ? <div className="tip" style={{ left: Math.min(tip.x, window.innerWidth - 290), top: tip.y }}>{tip.text}</div> : null;
  return { handlers, node };
}

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t.current);
  }, [value, ms]);
  return v;
}

/** Neutral product mark (a stylized plan): three schedule bars on the brand color. */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      <rect width="24" height="24" rx="6" fill="var(--brand)" />
      <path d="M6 7.5h7M9 12h9M12 16.5h5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Company wordmark from src/brand.ts, or the customer's logo image when BRAND.logoUrl is set. */
export function BrandLogo({ size = 26 }: { size?: number }) {
  if (BRAND.logoUrl) return <img className="brand-logo" src={BRAND.logoUrl} alt={BRAND.company} style={{ height: size }} />;
  return (
    <span className="wordmark" style={{ fontSize: Math.round(size * 0.8) }} role="img" aria-label={BRAND.company}>
      <BrandMark size={size} />
      <span aria-hidden="true">{BRAND.company}</span>
    </span>
  );
}
