/* Kirish ekrani (Windows 7 «xush kelibsiz» oynasi uslubida): shisha ramkadagi logotip va «Boshlash» tugmasi.
   Shu yerda bosish brauzerga ovoz uchun ruxsat ham beradi — usiz fayl tashlanganda ovoz chiqmasdi. */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export function Boot({ onSound, onDone }: { onSound(sound: boolean): void; onDone(): void }) {
  const [stage, setStage] = useState<'login' | 'welcome' | 'bye'>('login');
  const go = useRef<HTMLButtonElement>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const start = (sound: boolean) => {
    if (stageRef.current !== 'login') return;
    onSound(sound);
    setStage('welcome');
    window.setTimeout(() => setStage('bye'), sound ? 1300 : 450);
  };
  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => { if (stage === 'bye') { const id = window.setTimeout(onDone, 380); return () => window.clearTimeout(id); } }, [stage, onDone]);
  useEffect(() => { go.current?.focus(); }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Shift' || e.altKey || e.ctrlKey || e.metaKey) return;
      if ((e.target as Element | null)?.id === 'bootMute' && (e.key === 'Enter' || e.key === ' ')) return;   // tugmaning o'zi ishlaydi
      e.preventDefault();
      startRef.current(true);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div className={'boot ' + stage} role="dialog" aria-modal="true" aria-labelledby="bootName" onClick={() => start(true)}>
      <div className="boot-c">
        <div className="tile"><Icon name="logo" size={96} /></div>
        <p className="boot-name" id="bootName">Jarayon svodi</p>
        {stage === 'login' ? (
          <>
            <button ref={go} type="button" className="boot-go" data-snd="none" onClick={e => { e.stopPropagation(); start(true); }}>
              <span>Boshlash</span><i aria-hidden="true" />
            </button>
            <p className="boot-hint">yoki Enter tugmasini bosing</p>
            <button type="button" id="bootMute" className="boot-mute" data-snd="none" onClick={e => { e.stopPropagation(); start(false); }}>Ovozsiz boshlash</button>
          </>
        ) : (
          <p className="boot-wel" role="status"><Icon name="busy" size={26} className="spin" />Xush kelibsiz</p>
        )}
      </div>
      <p className="boot-brand"><Icon name="logo" size={22} /><span>Jarayon svodi <b>2.0</b></span></p>
    </div>
  );
}
