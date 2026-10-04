/* Pastki panel (Windows 7 «superbar»): yaltiroq shar-menyu, holat tugmasi, ovoz tugmasi, soat va «yuqoriga» tugmasi. */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { KIND_ICON } from './common';
import { Icon } from './icons';
import { setSound, useSoundOn } from './sound';
import type { Phase } from './state';

const PHASE_TXT: Record<Phase, string> = {
  idle: 'Fayl kutilmoqda', busy: 'Hisoblanmoqda…', ok: 'Tayyor — saqlash mumkin', warn: 'Sizdan javob kerak', bad: 'Xato — qarang',
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = window.setInterval(() => setNow(new Date()), 10000); return () => window.clearInterval(id); }, []);
  return now;
}

/** Menyu ichida ↑/↓ bilan yurish */
function arrowNav(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('.sm-item:not(:disabled)'));
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
}

export function Taskbar({ phase, canSave, onSave }: { phase: Phase; canSave: boolean; onSave(): void }) {
  const [open, setOpen] = useState(false);
  const on = useSoundOn();
  const now = useClock();
  const bar = useRef<HTMLDivElement>(null);
  const startBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    bar.current?.querySelector<HTMLButtonElement>('.sm-item')?.focus();
    const down = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); startBtn.current?.focus(); } };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [open]);

  const act = (fn: () => void) => () => { setOpen(false); fn(); };
  const pick = (id: string) => document.getElementById(id)?.click();
  const rules = () => {
    const d = document.getElementById('rules') as HTMLDetailsElement | null;
    if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  };
  const toOut = () => document.getElementById('out')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const soundTxt = on ? 'Ovozni o\'chirish' : 'Ovozni yoqish';

  return (
    <div className="taskbar" ref={bar}>
      {open ? (
        <div className="startmenu" role="menu" aria-label="Svod menyusi" onKeyDown={arrowNav}>
          <div className="sm-list">
            <button type="button" role="menuitem" className="sm-item" onClick={act(() => pick('fileExp'))}><Icon name="xls" size={32} /><span>Portal ro'yxatini ochish…<small>.xlsx fayl</small></span></button>
            <button type="button" role="menuitem" className="sm-item" onClick={act(() => pick('filePrev'))}><Icon name="folder" size={32} /><span>Oldingi hisobotni ochish…<small>solishtirish uchun</small></span></button>
            <button type="button" role="menuitem" className="sm-item" data-snd="none" disabled={!canSave} onClick={act(onSave)}><Icon name="floppy" size={32} /><span>Excel faylni saqlash<small>{canSave ? 'tekshiruvdan o\'tgan' : 'hali tayyor emas'}</small></span></button>
            <button type="button" role="menuitem" className="sm-item" onClick={act(rules)}><Icon name="gear" size={32} /><span>Tasnif qoidalari<small>toifalarni sozlash</small></span></button>
          </div>
          <div className="sm-side" aria-hidden="true">
            <div className="sm-pic"><Icon name="logo" size={48} /></div>
            <b>Jarayon svodi</b>
            <span>Fayl shu kompyuterda qoladi</span>
          </div>
          <div className="sm-foot">
            <button type="button" role="menuitemcheckbox" aria-checked={on} className="sm-item sm-sound" data-snd="none" onClick={act(() => setSound(!on))}>
              <Icon name={on ? 'spk' : 'spkOff'} size={20} />{soundTxt}
            </button>
          </div>
        </div>
      ) : null}
      <button ref={startBtn} type="button" className={'start' + (open ? ' on' : '')} aria-haspopup="menu" aria-expanded={open} aria-label="Svod menyusi" title="Svod menyusi" data-snd="menu" onClick={() => setOpen(!open)}>
        <Icon name="logo" size={24} />
      </button>
      <button type="button" key={phase} className={`task ${phase}`} title={PHASE_TXT[phase]} onClick={toOut}>
        <Icon name={KIND_ICON[phase]} size={24} className={phase === 'busy' ? 'spin' : undefined} /><span>{PHASE_TXT[phase]}</span>
      </button>
      <div className="tray">
        <button type="button" className="tray-btn" aria-pressed={on} aria-label={soundTxt} title={on ? 'Ovoz yoqilgan' : 'Ovoz o\'chirilgan'} data-snd="none" onClick={() => setSound(!on)}>
          <Icon name={on ? 'spk' : 'spkOff'} size={18} />
        </button>
        <time dateTime={now.toISOString()}>
          <b>{now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</b>
          <span>{now.toLocaleDateString('ru-RU')}</span>
        </time>
      </div>
      <button type="button" className="peek" aria-label="Sahifa boshiga" title="Sahifa boshiga" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  );
}
