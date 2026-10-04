/* Umumiy kichik bo'laklar: oyna (Windows 7 «Aero» uslubi), holat oynasi, tekshiruv qatori, xato matni, sonlar. */
import { useState, type ReactNode } from 'react';
import type { ErrInfo } from '../engine/protocol';
import { Icon, type IconName } from './icons';

export const nf = (n: number) => Number(n).toLocaleString('ru-RU').replace(/\s/g, ' ');

export type Kind = 'ok' | 'warn' | 'bad' | 'idle' | 'busy';

export const KIND_ICON: Record<Kind, IconName> = { ok: 'ok', warn: 'warn', bad: 'error', idle: 'info', busy: 'busy' };

/** Oyna: shisha ramka, sarlavha (ikonka + nom), ixtiyoriy «yig'ish» tugmasi va oq tana. */
export function Win({ icon, title, tag, off, min, className, id, children }: {
  icon: IconName; title: ReactNode; tag?: ReactNode; off?: boolean; min?: boolean; className?: string; id?: string; children: ReactNode;
}) {
  const [shut, setShut] = useState(false);
  return (
    <section className={'win' + (off ? ' off' : '') + (className ? ' ' + className : '')} id={id}>
      <header className="title">
        <Icon name={icon} className={icon === 'busy' ? 'spin' : undefined} />
        <h2>{title}</h2>
        {tag}
        {min ? <button type="button" className={'tb' + (shut ? ' max' : '')} aria-expanded={!shut} aria-label={shut ? 'Oynani ochish' : 'Oynani yig\'ish'}
          title={shut ? 'Ochish' : 'Yig\'ish'} onClick={() => setShut(!shut)} /> : null}
      </header>
      <div className="win-b" hidden={shut}>{children}</div>
    </section>
  );
}

export function StatusBox({ kind, title, children, className }: { kind: Kind; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Win icon={KIND_ICON[kind]} title={<span className={`state ${kind}`}>{title}</span>} off={kind === 'idle'} className={`status ${kind}${className ? ' ' + className : ''}`}>
      {kind === 'busy' ? <Progress /> : null}
      {children}
    </Win>
  );
}

/** Windows 7 progress chizig'i: yashil chiziq ustidan yaltiroq nur yuradi */
export const Progress = () => <div className="progress" role="progressbar" aria-label="Ishlanmoqda"><i /></div>;

export const Spinner = () => <Icon name="busy" className="spin" />;

/** Katta ikonkali xabar (dialog oynasidagidek) */
export function Dlg({ icon, children }: { icon: IconName; children: ReactNode }) {
  return <div className="dlg"><Icon name={icon} size={40} /><div className="dlg-t">{children}</div></div>;
}

export function Check({ kind, title, children }: { kind: 'ok' | 'warn' | 'bad'; title: ReactNode; children?: ReactNode }) {
  return (
    <li>
      <span className={`ico ${kind}`}><Icon name={KIND_ICON[kind]} /></span>
      <span className="t">{title}</span>
      {children ? <div className="d">{children}</div> : null}
    </li>
  );
}

export function ErrText({ error }: { error: ErrInfo }) {
  return (
    <>
      <p>{error.name === 'EngineError' ? error.message : 'Kutilmagan xato: ' + error.message}</p>
      {error.items.length ? <ul>{error.items.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
    </>
  );
}

/** Ro'yxatning boshi + "yana N ta" */
export function MoreList<T>({ items, total, limit = 12, render }: { items: T[]; total: number; limit?: number; render: (x: T, i: number) => ReactNode }) {
  return (
    <ul>
      {items.slice(0, limit).map(render)}
      {total > limit ? <li className="muted">… yana {nf(total - limit)} ta</li> : null}
    </ul>
  );
}
