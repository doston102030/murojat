/* 2010 uslubidagi yaltiroq vektor ikonkalar (Windows 7 davri): gradient, yuqorida «yaltiroq» qatlam.
   Gradientlar bir marta <IconDefs/> ichida e'lon qilinadi, har bir ikonka ularga id orqali murojaat qiladi. */
import { memo, type ReactNode } from 'react';

export type IconName = 'logo' | 'xls' | 'folder' | 'cal' | 'gear' | 'info' | 'warn' | 'error' | 'ok' | 'busy' | 'spk' | 'spkOff' | 'lock' | 'floppy';

type Stop = [number, string, number?];
const lin = (id: string, stops: Stop[]) => (
  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1" key={id}>
    {stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
  </linearGradient>
);
const rad = (id: string, stops: Stop[]) => (
  <radialGradient id={id} cx=".5" cy=".32" r=".75" key={id}>
    {stops.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />)}
  </radialGradient>
);

export function IconDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {lin('ig-gloss', [[0, '#fff', 0.9], [1, '#fff', 0]])}
        {rad('ig-blue', [[0, '#9ad8ff'], [0.55, '#2b80da'], [1, '#0c47a0']])}
        {rad('ig-green', [[0, '#b8f58a'], [0.55, '#3fae22'], [1, '#1d6e0b']])}
        {rad('ig-red', [[0, '#ffb3a6'], [0.55, '#e0391f'], [1, '#981404']])}
        {lin('ig-yellow', [[0, '#fff2a0'], [0.5, '#ffd21f'], [1, '#e89a00']])}
        {lin('ig-tile', [[0, '#a6e46c'], [0.5, '#5cb52b'], [0.51, '#47a01c'], [1, '#5fb22d']])}
        {lin('ig-page', [[0, '#ffffff'], [1, '#e6edf5']])}
        {lin('ig-excel', [[0, '#6cc743'], [1, '#1f7a10']])}
        {lin('ig-fback', [[0, '#f4d474'], [1, '#d8a23a']])}
        {lin('ig-folder', [[0, '#fff0b3'], [0.5, '#fbd977'], [1, '#eeb94a']])}
        {lin('ig-redbar', [[0, '#f9806b'], [1, '#c3291a']])}
        {lin('ig-metal', [[0, '#fbfcfd'], [0.5, '#d5dce5'], [1, '#8f9cad']])}
        {lin('ig-gold', [[0, '#ffeaa0'], [0.5, '#f7c43e'], [1, '#d48f0e']])}
        {lin('ig-floppy', [[0, '#6fa6ec'], [1, '#1d4c9c']])}
        <linearGradient id="ig-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8ff0ff" /><stop offset="1" stopColor="#1d76df" /></linearGradient>
      </defs>
    </svg>
  );
}

/** Tishli g'ildirak yo'li */
function gearPath(cx: number, cy: number, ro: number, ri: number, n: number) {
  const pts: string[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n;
    for (const [r, d] of [[ri, -0.3], [ro, -0.17], [ro, 0.17], [ri, 0.3]] as const)
      pts.push(`${(cx + r * Math.sin(a + d)).toFixed(2)} ${(cy - r * Math.cos(a + d)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
const GEAR = gearPath(16, 16, 14.5, 10.5, 9);

const orb = (fill: string, line: string, glyph: ReactNode) => (
  <>
    <circle cx="16" cy="16" r="14" fill={`url(#${fill})`} stroke={line} />
    <ellipse cx="16" cy="10" rx="10" ry="6.5" fill="url(#ig-gloss)" opacity=".75" />
    {glyph}
  </>
);

const DRAW: Record<IconName, ReactNode> = {
  logo: <>
    <rect x="2" y="2" width="28" height="28" rx="6" fill="url(#ig-tile)" stroke="#2c6e12" />
    {[7, 13.5, 20].map(y => [7, 13.5, 20].map(x => (
      <rect key={`${x}-${y}`} x={x} y={y} width="5" height="5" rx=".8"
        fill={x !== 20 ? '#fff' : y === 7 ? '#d4f7b5' : y === 13.5 ? '#ffe36b' : '#ff8a78'} />
    )))}
    <path d="M3 8a5 5 0 0 1 5-5h16a5 5 0 0 1 5 5v4.5c-8 3-18 3-26 0z" fill="url(#ig-gloss)" opacity=".55" />
  </>,
  xls: <>
    <path d="M8 2h12.5L26 7.5V30H8z" fill="url(#ig-page)" stroke="#8a99ab" />
    <path d="M20.5 2v5.5H26" fill="#dfe7f0" stroke="#8a99ab" strokeLinejoin="round" />
    <path d="M11 12h12M11 16h12M11 20h12M11 24h12M15 12v14M19 12v14" stroke="#58ab36" />
    <rect x="2" y="15" width="13" height="13" rx="2" fill="url(#ig-excel)" stroke="#1d5e0c" />
    <rect x="3" y="16" width="11" height="5" rx="1.5" fill="url(#ig-gloss)" opacity=".55" />
    <path d="M5.5 18.5l6 6M11.5 18.5l-6 6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </>,
  folder: <>
    <path d="M2 7a2 2 0 0 1 2-2h8l3 3h13a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="url(#ig-fback)" stroke="#b5862a" />
    <rect x="5" y="9" width="22" height="9" fill="#fff" stroke="#cbd5e0" />
    <path d="M2.5 13.2A2 2 0 0 1 4.5 11h23a2 2 0 0 1 2 2.2l-1.2 12.9a2 2 0 0 1-2 1.9H5.7a2 2 0 0 1-2-1.9z" fill="url(#ig-folder)" stroke="#c08f2c" />
    <path d="M4 12h24l-.3 4H4.3z" fill="url(#ig-gloss)" opacity=".6" />
  </>,
  cal: <>
    <rect x="4" y="5" width="24" height="24" rx="3" fill="url(#ig-page)" stroke="#8a99ab" />
    <path d="M4 8a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v4H4z" fill="url(#ig-redbar)" stroke="#a3271b" />
    <rect x="5" y="6" width="22" height="3" rx="1.5" fill="url(#ig-gloss)" opacity=".5" />
    <rect x="9" y="2" width="3" height="6" rx="1.5" fill="url(#ig-metal)" stroke="#5d6b7c" strokeWidth=".8" />
    <rect x="20" y="2" width="3" height="6" rx="1.5" fill="url(#ig-metal)" stroke="#5d6b7c" strokeWidth=".8" />
    {[15, 19.5, 24].map(y => [7.5, 12.5, 17.5, 22.5].map(x => (
      <rect key={`${x}-${y}`} x={x} y={y} width="3" height="2.6" rx=".4" fill={x === 17.5 && y === 19.5 ? '#d9341f' : '#a3b1c2'} />
    )))}
  </>,
  gear: <>
    <path d={GEAR + 'M16 11.2a4.8 4.8 0 1 0 0 9.6a4.8 4.8 0 1 0 0-9.6z'} fillRule="evenodd" fill="url(#ig-metal)" stroke="#5d6b7c" />
    <circle cx="16" cy="16" r="7.2" fill="none" stroke="#fff" strokeOpacity=".7" />
  </>,
  info: orb('ig-blue', '#1a4f96', <><circle cx="16" cy="9.6" r="2.2" fill="#fff" /><path d="M13.2 13.4h4.3v9.4h2v2.4h-7v-2.4h2v-7h-1.3z" fill="#fff" /></>),
  ok: orb('ig-green', '#1d6410', <path d="M9 16.5l4.6 4.6L23.2 11.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />),
  error: orb('ig-red', '#8a1205', <path d="M11 11l10 10M21 11L11 21" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />),
  warn: <>
    <path d="M16 3.5c.9 0 1.7.5 2.1 1.3l11 20.5c.8 1.6-.3 3.2-2 3.2H4.9c-1.7 0-2.8-1.6-2-3.2l11-20.5c.4-.8 1.2-1.3 2.1-1.3z" fill="url(#ig-yellow)" stroke="#b07d00" />
    <path d="M16 5.5l6.5 12.2c-4 1.6-9 1.6-13 0z" fill="url(#ig-gloss)" opacity=".6" />
    <path d="M14.5 11h3l-.6 9h-1.8z" fill="#3a2a00" /><circle cx="16" cy="23.6" r="1.8" fill="#3a2a00" />
  </>,
  busy: <>
    <circle cx="16" cy="16" r="11" fill="none" stroke="#cfe6f7" strokeWidth="4.5" />
    <circle cx="16" cy="16" r="11" fill="none" stroke="url(#ig-ring)" strokeWidth="4.5" strokeDasharray="38 31" strokeLinecap="round" />
  </>,
  spk: <>
    <path d="M5 12h5l7-6v20l-7-6H5z" fill="currentColor" />
    <path d="M21 11.5a6 6 0 0 1 0 9M24.5 8a10.5 10.5 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </>,
  spkOff: <>
    <path d="M5 12h5l7-6v20l-7-6H5z" fill="currentColor" />
    <path d="M21 12.5l7 7M28 12.5l-7 7" stroke="#ff4a36" strokeWidth="2.8" strokeLinecap="round" />
  </>,
  lock: <>
    <path d="M10 15v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#7d8a9b" strokeWidth="3.4" />
    <path d="M10 15v-4a6 6 0 0 1 12 0v4" fill="none" stroke="#e9eef3" strokeWidth="1.4" />
    <rect x="6" y="14" width="20" height="15" rx="3" fill="url(#ig-gold)" stroke="#9a6b00" />
    <rect x="7" y="15" width="18" height="5" rx="2" fill="url(#ig-gloss)" opacity=".6" />
    <circle cx="16" cy="20.5" r="2.2" fill="#6b4600" /><path d="M15 21.5h2l.5 4h-3z" fill="#6b4600" />
  </>,
  floppy: <>
    <path d="M4 4h21l3 3v21a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="url(#ig-floppy)" stroke="#183f80" />
    <rect x="9" y="4" width="13" height="9" rx="1" fill="url(#ig-metal)" stroke="#5d6b7c" />
    <rect x="17" y="5.5" width="3" height="6" rx=".6" fill="#2c3a4c" />
    <rect x="7" y="17" width="18" height="10" rx="1" fill="#fff" stroke="#b8c6d8" />
    <path d="M9 20.5h14M9 23.5h14" stroke="#c9d4e0" />
    <path d="M5 5h3v9h17V7l2 1.5V15H5z" fill="url(#ig-gloss)" opacity=".3" />
  </>,
};

export const Icon = memo(function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={'svgi' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      {DRAW[name]}
    </svg>
  );
});
