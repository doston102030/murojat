/* Ovozlar (2010 / Windows 7 uslubida: yumshoq qo'ng'iroqlar, shisha «tik», havodor «vush»).
   Hammasi shu yerning o'zida Web Audio bilan sintez qilinadi — ovoz fayli ham, internet ham kerak emas.
   Brauzer ovozga faqat foydalanuvchi bosgandan keyin ruxsat beradi, shuning uchun AudioContext faqat unlock()'da
   (bosish yoki tugma hodisasi ichida) yaratiladi. Ruxsat bo'lmasa yoki ovoz o'chirilgan bo'lsa — jim, xatosiz. */
import { useSyncExternalStore } from 'react';
import SALOM from './salom.mp3';            // «Assalomu alaykum, Bahodir To'xtasinov! Xush kelibsiz!» (Madina ovozi), yig'ishda faylga joylanadi

export type SoundName = 'start' | 'click' | 'tab' | 'menu' | 'drop' | 'ok' | 'okSmall' | 'warn' | 'bad' | 'save' | 'done' | 'on' | 'off';

const KEY = 'jarayon.ovoz';
let enabled = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();
const subs = new Set<() => void>();

let ctx: AudioContext | null = null;
let dry: GainNode | null = null;          // to'g'ridan-to'g'ri chiqish
let wet: DelayNode | null = null;         // xona aks-sadosi kirishi
let noiseBuf: AudioBuffer | null = null;
let out: AudioNode | null = null;         // vaqtincha boshqa chiqish (kirish kuyini salom paytida pasaytirish uchun)
let startBus: GainNode | null = null;
let voice: Promise<{ buf: AudioBuffer; end: number } | null> | null = null;   // end — gap tugaydigan joy (s), oxiridagi sukutsiz
const lastAt = new Map<SoundName, number>();

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    const c = new AC();
    const master = c.createGain(); master.gain.value = 0.42;
    const comp = c.createDynamicsCompressor();
    master.connect(comp); comp.connect(c.destination);
    // yumshoq aks-sado: kechikish + qaytishda baland chastotalar so'ndiriladi
    const d = c.createDelay(1); d.delayTime.value = 0.14;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    const fb = c.createGain(); fb.gain.value = 0.42;
    const ret = c.createGain(); ret.gain.value = 0.3;
    d.connect(damp); damp.connect(fb); fb.connect(d); damp.connect(ret); ret.connect(master);
    ctx = c; dry = master; wet = d;
  } catch { ctx = null; }
  return ctx;
}

interface ToneOpt { type?: OscillatorType; vol?: number; to?: number; a?: number; decay?: boolean; echo?: boolean; vib?: number }
/** Bitta nota. decay — qo'ng'iroqdek so'nib boradi, aks holda tekis ushlab, oxirida o'chadi. */
function tone(t: number, f: number, dur: number, o: ToneOpt = {}) {
  const c = ctx!, osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  if (o.vib) {
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = 5.5; depth.gain.value = f * o.vib;
    lfo.connect(depth); depth.connect(osc.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  const v = o.vol ?? 0.2, a = o.a ?? 0.006;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  if (o.decay !== false) g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  else { g.gain.setValueAtTime(v, t + Math.max(a, dur * 0.6)); g.gain.linearRampToValueAtTime(0.0001, t + dur); }
  osc.connect(g); g.connect(out ?? dry!);
  if (o.echo) g.connect(wet!);
  osc.start(t); osc.stop(t + dur + 0.05);
}

/** Qo'ng'iroq / shisha ovozi: asosiy nota + yuqori obertonlar, tez so'nadi */
function bell(t: number, f: number, dur: number, vol = 0.2, echo = true) {
  tone(t, f, dur, { vol, echo });
  tone(t, f * 2, dur * 0.6, { vol: vol * 0.32, echo });
  tone(t, f * 3.01, dur * 0.35, { vol: vol * 0.12, echo });
}

interface NoiseOpt { vol?: number; f?: number; to?: number; q?: number; type?: BiquadFilterType; a?: number }
function noise(t: number, dur: number, o: NoiseOpt = {}) {
  const c = ctx!;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noiseBuf; src.loop = true;
  flt.type = o.type ?? 'bandpass'; flt.Q.value = o.q ?? 1;
  flt.frequency.setValueAtTime(o.f ?? 1000, t);
  if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const v = o.vol ?? 0.15, a = o.a ?? 0.004;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(flt); flt.connect(g); g.connect(out ?? dry!);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

/* Kirish kuyi (~3 s): asta ko'tariladigan akkordlar, ustidan yaltiroq arpedjio, oxirida keng akkord */
function startup(t: number) {
  const pads: Array<[number, number, number[]]> = [[0, 1.3, [51, 63, 67, 70]], [1.0, 1.0, [56, 68, 72, 75]], [1.75, 1.5, [58, 70, 74, 79]]];
  for (const [at, len, notes] of pads) for (const n of notes) {
    tone(t + at, midi(n), len + 0.5, { type: 'triangle', vol: 0.07, a: 0.35, decay: false, echo: true });
    tone(t + at, midi(n) * 1.004, len + 0.5, { vol: 0.05, a: 0.4, decay: false, echo: true });
  }
  [75, 79, 82, 87, 91, 94].forEach((n, i) => bell(t + 0.12 + i * 0.13, midi(n), 0.9, 0.06));
  const fin = t + 2.35;
  for (const n of [63, 70, 75, 79, 82, 87]) tone(fin, midi(n), 2.2, { type: 'triangle', vol: 0.06, a: 0.25, echo: true, vib: 0.004 });
  bell(fin, midi(87), 2.2, 0.12);
  bell(fin + 0.18, midi(94), 1.8, 0.07);
  noise(t, 1.4, { vol: 0.03, f: 800, to: 6000, q: 0.6, a: 0.6 });
}

const SFX: Record<SoundName, (t: number) => void> = {
  click: t => { noise(t, 0.012, { vol: 0.12, f: 4200, q: 1.2, type: 'highpass' }); tone(t, 1400, 0.03, { vol: 0.05, to: 900 }); },
  tab: t => { bell(t, midi(84), 0.18, 0.06, false); noise(t, 0.01, { vol: 0.08, f: 5000, type: 'highpass' }); },
  menu: t => { noise(t, 0.22, { vol: 0.07, f: 600, to: 3200, q: 0.8 }); bell(t + 0.04, midi(88), 0.35, 0.07); },
  drop: t => {
    noise(t, 0.35, { vol: 0.09, f: 400, to: 4000, q: 1.2, a: 0.08 });
    [76, 81, 88].forEach((n, i) => bell(t + 0.12 + i * 0.07, midi(n), 0.5, 0.09));
  },
  okSmall: t => { bell(t, midi(84), 0.4, 0.11); bell(t + 0.09, midi(91), 0.6, 0.1); },
  ok: t => {                                      // «ta-da!»: yaltiroq arpedjio va keng akkord
    [72, 76, 79, 84].forEach((n, i) => bell(t + i * 0.075, midi(n), 0.6, 0.1));
    const e = t + 0.32;
    for (const n of [60, 67, 72, 76, 79]) tone(e, midi(n), 1.5, { type: 'triangle', vol: 0.09, a: 0.02, echo: true });
    bell(e, midi(88), 1.4, 0.13);
    bell(e + 0.12, midi(96), 1.0, 0.06);
  },
  warn: t => { bell(t, midi(81), 0.9, 0.17); bell(t + 0.22, midi(76), 1.2, 0.17); },
  bad: t => {
    for (const n of [52, 55, 59]) tone(t, midi(n), 0.7, { type: 'triangle', vol: 0.13, to: midi(n) * 0.94 });
    bell(t, midi(64), 0.6, 0.08);
    noise(t, 0.08, { vol: 0.05, f: 300, type: 'lowpass' });
  },
  save: t => {                                    // havodor «vush» — fayl yozilmoqda
    noise(t, 0.55, { vol: 0.08, f: 300, to: 5000, q: 0.9, a: 0.18 });
    tone(t, 400, 0.5, { vol: 0.04, to: 1200, a: 0.15 });
  },
  done: t => { [79, 84, 91].forEach((n, i) => bell(t + i * 0.09, midi(n), 0.8, 0.12)); },
  on: t => { bell(t, midi(79), 0.3, 0.09, false); bell(t + 0.08, midi(86), 0.4, 0.09, false); },
  off: t => { bell(t, midi(86), 0.3, 0.09, false); bell(t + 0.08, midi(79), 0.4, 0.09, false); },
  start: t => {                                   // kuy alohida yo'ldan: salom paytida pasaytiriladi
    const c = ctx!;
    startBus = c.createGain(); startBus.gain.value = 1; startBus.connect(dry!);
    out = startBus;
    try { startup(t); } finally { out = null; }
  },
};

/** Salom ovozini (mp3) bir marta ochib, AudioBuffer qiladi va gap qayerda tugashini topadi */
function loadVoice(c: AudioContext): Promise<{ buf: AudioBuffer; end: number } | null> {
  voice ??= (async () => {
    try {
      let buf: ArrayBuffer;
      if (SALOM.startsWith('data:')) {
        const bin = atob(SALOM.slice(SALOM.indexOf(',') + 1)), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        buf = u.buffer;
      } else buf = await (await fetch(SALOM)).arrayBuffer();
      const b = await c.decodeAudioData(buf), ch = b.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
      let last = ch.length - 1;
      while (last > 0 && Math.abs(ch[last]) < peak * 0.03) last--;
      return { buf: b, end: Math.min(b.duration, last / b.sampleRate + 0.15) };
    } catch { return null; }
  })();
  return voice;
}

/** «Assalomu alaykum, Bahodir To'xtasinov! Xush kelibsiz!» — kirish kuyi ustidan. Ovoz davomiyligini (s) qaytaradi, chalinmasa 0. */
export async function greet(delay = 0.55): Promise<number> {
  const c = ctx;
  if (!enabled || !c) return 0;
  const v = await loadVoice(c);
  if (!v || ctx !== c || !enabled) return 0;
  const b = v.buf;
  try {
    const t = c.currentTime + delay;
    const src = c.createBufferSource(), g = c.createGain(), send = c.createGain();
    src.buffer = b; g.gain.value = 2.1; send.gain.value = 0.12;
    src.connect(g); g.connect(dry!); g.connect(send); send.connect(wet!);
    src.start(t);
    if (startBus) {                               // kuyni salom davomida pasaytirib, keyin qaytaradi
      const k = startBus.gain;
      k.setValueAtTime(1, t - 0.25); k.linearRampToValueAtTime(0.32, t + 0.05);
      k.setValueAtTime(0.32, t + v.end - 0.2); k.linearRampToValueAtTime(0.9, t + v.end + 0.5);
    }
    return delay + v.end;
  } catch { return 0; }
}

/** Ovozni chalish. delay — soniyalarda. Bir xil ovoz 70 ms ichida qayta chalinmaydi (masalan, label + input bosilishi). */
export function play(name: SoundName, delay = 0) {
  const c = ctx;
  if (!enabled || !c) return;
  const now = performance.now();
  if (now - (lastAt.get(name) ?? -1e9) < 70) return;
  lastAt.set(name, now);
  const fire = () => { try { SFX[name](c.currentTime + 0.01 + delay); } catch { /* ovozsiz ham ishlaydi */ } };
  if (c.state === 'running') fire();
  else if (c.state === 'suspended') c.resume().then(() => { if (performance.now() - now < 400) fire(); }, () => {});
}

/** Foydalanuvchi bosgan paytda chaqiriladi: brauzer ovozga ruxsat beradi. */
export function unlock() {
  if (!enabled) return;
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  if (c) void loadVoice(c);                       // salomni oldindan tayyorlab qo'yadi
}

export const soundOn = () => enabled;

export function setSound(on: boolean, quiet = false) {
  if (on === enabled) return;
  if (!on && !quiet) play('off');
  enabled = on;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* eslab qolinmasa ham ishlaydi */ }
  if (on) { unlock(); if (!quiet) play('on'); }
  subs.forEach(f => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useSoundOn = () => useSyncExternalStore(subscribe, soundOn);
