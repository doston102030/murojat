/* Yig'ilgan jarayon-svodi.html ni haqiqiy brauzerda sinash: to'liq oqim, yuklab olingan fayl, katta faylda qotmaslik.
   Ishga tushirish: npm run build && npm run test:e2e
   Dev serverni sinash: E2E_URL=http://127.0.0.1:5173/ npm run test:e2e   (npm run dev ishlab turganda) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BASE_RULES } from '../../src/engine/core';
import { readTable } from '../../src/engine/xlsx';
import { portalFile, portalRows, type Val } from '../fixture';
import { launch, type Page } from './cdp';

const HTML = resolve(import.meta.dirname, '..', '..', '..', 'jarayon-svodi.html');
const TARGET = process.env.E2E_URL || pathToFileURL(HTML).href;
const WORK = join(tmpdir(), `jarayon-e2e-${process.pid}-${Date.now()}`);
const DOWNLOADS = join(WORK, 'downloads');
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');

let page: Page;

/** SHOTS=<papka> bo'lsa — dizaynni ko'z bilan tekshirish uchun skrinshot */
async function shot(name: string, full = true) {
  const dir = process.env.SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const r = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
  writeFileSync(join(dir, name + '.png'), Buffer.from(r.data, 'base64'));
}

/* Sahifa ichidagi yordamchilar (React boshqaradigan maydonlarga qiymat berish, kutish) */
function installHelpers() {
  const $ = (s: string) => document.querySelector(s) as HTMLElement | null;
  const w = window as unknown as Record<string, unknown>;
  w.t = () => w.__t;                     // testdagi t() sahifada ham shu nom bilan ishlaydi
  w.__t = {
    $,
    text: () => ($('#out') as HTMLElement).innerText,
    ready: () => { const b = $('#saveBtn') as HTMLButtonElement | null; return !!b && !b.disabled; },
    set(sel: string, v: string) {
      const el = $(sel) as HTMLInputElement | HTMLSelectElement;
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    },
    file(sel: string, base64: string, name: string) {
      const bin = atob(base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const el = $(sel) as HTMLInputElement;
      el.files = dt.files;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    async wait(code: string, label: string, ms = 20000) {
      const test = new Function('t', `return (${code});`) as (t: unknown) => boolean;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { if (test(w.__t)) return performance.now() - t0; await new Promise(r => setTimeout(r, 25)); }
      throw new Error(`Kutish tugadi: ${label}\n---\n${($('#out') as HTMLElement).innerText.slice(0, 1500)}`);
    },
  };
}
type T = { $(s: string): HTMLElement | null; text(): string; ready(): boolean; set(s: string, v: string): void; file(s: string, b: string, n: string): void; wait(c: string, l: string, ms?: number): Promise<number> };
const t = () => (window as unknown as { __t: T }).__t;

async function open() {
  await page.send('Page.navigate', { url: TARGET });
  for (let i = 0; i < 200; i++) {
    const ok = await page.run(() => !!document.querySelector('#fileExp') && !!document.documentElement.dataset.engine).catch(() => false);
    if (ok) break;
    await sleep(50);
  }
  await page.run(installHelpers);
}

const records: Val[][] = [
  ['SMOKE-001', '1', 'Test One', 'Aziza', 'Test region', 'Test district', BASE_RULES[0][0], '', 'Test A', 'Test A', 'Test A', '10.10.2026', '01.10.2026 09:00', '03.10.2026 09:00'],
  ['SMOKE-002', '1', 'Test Two', 'Bek', 'Test region', 'Test district', BASE_RULES[1][0], '', 'Test B', 'Test B', 'Test B', '11.10.2026', '02.10.2026 09:00', '03.10.2026 09:01'],
  ['SMOKE-003', '1', 'Test Three', 'Dilshod', 'Test region', 'Test district', BASE_RULES[0][0], '', 'Test A', 'Test A', 'Test A', '12.10.2026', '03.10.2026 09:00', null],
];

beforeAll(async () => {
  if (!process.env.E2E_URL) expect(existsSync(HTML), 'avval: npm run build').toBe(true);
  mkdirSync(DOWNLOADS, { recursive: true });
  page = await launch(WORK);
  await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await open();
});
afterAll(async () => {
  await page?.close();
  try { rmSync(WORK, { recursive: true, force: true }); } catch { /* vaqtinchalik papka */ }
});

describe('brauzerda: jarayon-svodi.html', () => {
  it('internetsiz ochiladi, dvigatel Web Worker\'da ishlaydi', async () => {
    const r = await page.run(() => ({
      engine: document.documentElement.dataset.engine,
      text: (window as unknown as { __t: T }).__t.text(),
      // tashqi (internetdagi) manba yo'q: faqat fayl o'zi, blob/data yoki o'sha server (dev rejimda)
      external: performance.getEntriesByType('resource').map(e => e.name).filter(n => !/^(file|blob|data):/.test(n) && !n.startsWith(location.origin + '/')),
    }));
    expect(r.engine).toBe('worker');
    expect(r.text).toContain('Fayl kutilmoqda');
    expect(r.external).toEqual([]);
    await shot('1-bosh');
  });

  it('kichik fayl: yangi kelganlar soni so\'raladi → tasdiqlash → yig\'ish va tekshiruv', async () => {
    await page.run((d: string) => { t().set('#sana', '2026-10-03'); t().file('#fileExp', d, 'synthetic-portal.xlsx'); }, b64(await portalFile(records, { inline: true })));
    await page.run(() => t().wait("t.$('#yangiSon')", 'yangi kelganlar so\'rovi'));
    expect(await page.run(() => t().ready())).toBe(false);
    await shot('2-savol');
    await page.run(() => { t().set('#yangiSon', '1'); (t().$('[data-act="confirmNew"]') as HTMLButtonElement).click(); });
    await page.run(() => t().wait('t.ready()', 'fayl tayyor'));
    const text = await page.run(() => t().text());
    expect(text).toContain('tekshiruvdan o\'tdi');
    expect(text).toContain('Жараёндаги мурожаатлар 03.10.2026й.xlsx');
    await shot('3-tayyor');
  });

  it('murojaatlar yorlig\'i: hamma qator va yangi kelgan belgisi', async () => {
    const r = await page.run(async () => {
      (t().$('[data-tab="rows"]') as HTMLButtonElement).click();
      await t().wait("t.$('table.rows')", 'murojaatlar jadvali');
      return { rows: document.querySelectorAll('table.rows tbody tr:not(.pad)').length, nw: document.querySelectorAll('table.rows tbody tr.nw').length };
    });
    expect(r).toEqual({ rows: 3, nw: 1 });
  });

  it('svod varag\'idagi yorliqlar: «жараён», «жараён (2)», «Лист2» bosilganda o\'sha varaq ochiladi', async () => {
    const r = await page.run(async () => {
      (t().$('[data-tab="svod"]') as HTMLButtonElement).click();
      await t().wait("t.$('.paper [data-sheet=\"main\"]')", 'varaq yorliqlari');
      const q = (s: string) => document.querySelector('.paper ' + s);
      (q('[data-sheet="main"]') as HTMLButtonElement).click();
      await t().wait("document.querySelector('.paper table.rows')", '«жараён» varag\'i');
      const main = { rows: document.querySelectorAll('.paper table.rows tbody tr:not(.pad)').length, nw: document.querySelectorAll('.paper table.rows tbody tr.nw').length, svod: !!q('table.svod') };
      (q('[data-sheet="src"]') as HTMLButtonElement).click();
      await t().wait("document.querySelector('.paper table.rows thead th:nth-child(3)')?.textContent === 'Мурожаат таснифи'", '«жараён (2)» varag\'i');
      const src = { first: (q('table.rows tbody tr:not(.pad) td.no') as HTMLElement).textContent, cols: document.querySelectorAll('.paper table.rows thead th').length };
      (q('[data-sheet="svod"]') as HTMLButtonElement).click();
      await t().wait("document.querySelector('.paper table.svod')", '«Лист2» varag\'i');
      return { main, src, on: (q('.sheets .on') as HTMLElement).textContent };
    });
    expect(r).toEqual({ main: { rows: 3, nw: 1, svod: false }, src: { first: '3', cols: 5 }, on: 'Лист2' });
  });

  it('oldingi hisobot bilan solishtirish', async () => {
    const prev = records.map(r => r.slice());
    prev[0][2] = 'Previous name';
    prev[2][0] = 'SMOKE-004';
    await page.run((d: string) => t().file('#filePrev', d, 'synthetic-previous.xlsx'), b64(await portalFile(prev, { inline: true })));
    await page.run(() => t().wait("t.$('.cmp') && t.ready()", 'solishtirish'));
    const kpis = await page.run(() => [...document.querySelectorAll('.cmp .kpi b')].map(n => n.textContent));
    expect(kpis.slice(1)).toEqual(['1', '1', '1']);
    await shot('4-solishtirish');
  });

  it('sana o\'zgarsa eski fayl darhol bloklanadi; kechagi ro\'yxat bugungi sana bilan — yangi kelgan 0, so\'ralmaydi', async () => {
    const blockedAtOnce = await page.run(() => { t().set('#sana', '2026-10-04'); return !t().ready(); });
    expect(blockedAtOnce).toBe(true);
    await page.run(() => t().wait("t.ready() && t.text().includes('04.10.2026й.xlsx')", 'yangi sana bilan fayl'));
    const text = await page.run(() => t().text());
    expect(text).toContain('Yangi kelganlar: 0 ta — 04.10.2026 kuni kelgan murojaat yo\'q');
    expect(text).not.toContain('Pastdagi');                     // pastda ikkinchi ro'yxat yo'q — bu jumla chiqmaydi
    await shot('4b-kechagi-royxat');
  });

  it('kechagi ro\'yxatda ham sonni qo\'lda o\'zgartirish mumkin', async () => {
    await page.run(() => (t().$('[data-act="editNew"]') as HTMLButtonElement).click());
    await page.run(() => t().wait("t.$('#yangiSon') && t.text().includes('Jadval oxiridan nechta qator «4-окт ЯНГИ КЕЛГАН» bo\\'lib yozilsin?')", 'sonni so\'rash'));
    expect(await page.run(() => t().ready())).toBe(false);
    await page.run(() => { t().set('#yangiSon', '2'); (t().$('[data-act="confirmNew"]') as HTMLButtonElement).click(); });
    await page.run(() => t().wait("t.ready() && t.text().includes('Yangi kelganlar: 2 ta') && t.text().includes('Son siz qo\\'ygan')", 'qo\'lda qo\'yilgan son'));
  });

  it('sanani ro\'yxat kuni qilish: tasdiqlangan son qaytadi', async () => {
    await page.run(() => (t().$('[data-act="useListDay"]') as HTMLButtonElement).click());
    await page.run(() => t().wait("t.ready() && t.text().includes('03.10.2026й.xlsx')", 'ro\'yxat kuni bilan fayl'));
    expect(await page.run(() => (t().$('#sana') as HTMLInputElement).value)).toBe('2026-10-03');
    expect(await page.run(() => t().text())).toContain('Yangi kelganlar: 1 ta');
  });

  it('saqlash: haqiqiy .xlsx yuklab olinadi va qayta o\'qilganda to\'g\'ri', async () => {
    await page.run(() => (t().$('#saveBtn') as HTMLButtonElement).click());
    const name = 'Жараёндаги мурожаатлар 03.10.2026й.xlsx', file = join(DOWNLOADS, name);
    for (let i = 0; i < 200 && !(existsSync(file) && !readdirSync(DOWNLOADS).some(f => f.endsWith('.crdownload'))); i++) await sleep(50);
    expect(existsSync(file)).toBe(true);
    const back = await readTable(readFileSync(file), 'yuklangan');
    expect(back.reportDate).toBe('2026-10-03');
    expect(back.rows.map(r => r.id)).toEqual(['SMOKE-001', 'SMOKE-002', 'SMOKE-003']);
    expect(back.rows.map(r => r.red)).toEqual([false, false, true]);
    expect(back.sheetNames).toEqual(['жараён', 'Лист2', 'жараён (2)']);
    expect(await page.run(() => t().text())).toContain('Fayl yuklab olindi');
  });

  it('buzilgan fayl: tushunarli xato, saqlash bloklanadi; keyin to\'g\'ri fayl bilan tiklanadi', async () => {
    await page.run((d: string) => t().file('#fileExp', d, 'broken.xlsx'), b64(new TextEncoder().encode('bu zip emas')));
    await page.run(() => t().wait("t.text().includes('Fayl o\\'qilmadi')", 'xato xabari'));
    expect(await page.run(() => t().ready())).toBe(false);
    await page.run((d: string) => t().file('#fileExp', d, 'recovery.xlsx'), b64(await portalFile(records, { inline: true })));
    await page.run(() => t().wait("t.$('#yangiSon')", 'qayta so\'rov'));
    await page.run(() => { t().set('#yangiSon', '0'); (t().$('[data-act="confirmNew"]') as HTMLButtonElement).click(); });
    await page.run(() => t().wait("t.ready() && t.text().includes('03.10.2026й.xlsx')", 'tiklangan fayl'));
    await page.run(() => (t().$('#prevClear') as HTMLButtonElement).click());
    await page.run(() => t().wait("t.ready() && !t.$('#prevClear')", 'solishtirish olib tashlandi'));
  });

  it('portalda yangi tasnif: toifa tanlanadi va keyingi ochilishda eslab qolinadi', async () => {
    const rows = records.map(r => r.slice());
    rows[1][6] = 'Mutlaqo yangi tasnif';
    const data = b64(await portalFile(rows, { inline: true }));
    await page.run((d: string) => t().file('#fileExp', d, 'yangi-tasnif.xlsx'), data);
    await page.run(() => t().wait("t.$('#un-0')", 'noma\'lum tasnif so\'rovi'));
    await shot('5-yangi-tasnif');
    await page.run(() => { t().set('#un-0', 'ЭГХУ'); (t().$('[data-act="saveUnknown"]') as HTMLButtonElement).click(); });
    await page.run(() => t().wait("!t.$('#un-0') && t.$('#yangiSon')", 'qoida qabul qilindi'));
    await open();                                                           // sahifani qayta ochish
    expect(await page.run(() => t().text())).toContain('Oxirgi svod');   // oxirgi tayyor svod bosh sahifada
    await page.run((d: string) => { t().set('#sana', '2026-10-03'); t().file('#fileExp', d, 'yangi-tasnif.xlsx'); }, data);
    await page.run(() => t().wait("t.$('#yangiSon')", 'qayta ochilgandan keyin'));
    expect(await page.run(() => !!t().$('#un-0'))).toBe(false);
  });

  it('tozalash: fayllar, eslab qolingan svod va sana — boshidan; qayta ochilganda ham svod chiqmaydi', async () => {
    await page.run((d: string) => t().file('#filePrev', d, 'oldingi.xlsx'), b64(await portalFile(records, { inline: true })));
    await page.run(() => t().wait("t.$('#prevClear') && t.$('#clearAll')", 'ikkala fayl'));
    await shot('5b-tozalash-oldin');
    await page.run(() => (t().$('#clearAll') as HTMLButtonElement).click());
    await page.run(() => t().wait("t.text().includes('Fayl kutilmoqda') && !t.$('#prevClear') && !t.$('#clearAll')", 'hammasi tozalandi'));
    const r = await page.run(() => ({ exp: (t().$('#dropExp') as HTMLElement).innerText, sana: (t().$('#sana') as HTMLInputElement).value }));
    expect(r.exp).toContain('Excel faylni shu yerga tashlang');
    expect(r.sana).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()));
    await open();
    expect(await page.run(() => t().text())).toContain('Fayl kutilmoqda');
  });

  it('bosh sahifadagi «Oxirgi svod»ni o\'chirish', async () => {
    await page.run((d: string) => { t().set('#sana', '2026-10-03'); t().file('#fileExp', d, 'svod.xlsx'); }, b64(await portalFile(records, { inline: true })));
    await page.run(() => t().wait("t.$('#yangiSon')", 'savol'));
    await page.run(() => { t().set('#yangiSon', '1'); (t().$('[data-act="confirmNew"]') as HTMLButtonElement).click(); });
    await page.run(() => t().wait('t.ready()', 'tayyor'));
    await open();
    await page.run(() => t().wait("t.$('#lastClear')", 'oxirgi svod'));
    await page.run(() => (t().$('#lastClear') as HTMLButtonElement).click());
    await page.run(() => t().wait("t.text().includes('Fayl kutilmoqda') && !t.$('#lastClear')", 'svod o\'chirildi'));
    await open();
    expect(await page.run(() => t().text())).toContain('Fayl kutilmoqda');
  });

  it('katta fayl (20 000 qator): sahifa qotmaydi', async () => {
    await open();
    const data = b64(await portalFile(portalRows(20000, 900, 25)));
    const r = await page.run(async (d: string) => {
      let longest = 0;
      const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) longest = Math.max(longest, e.duration); });
      obs.observe({ type: 'longtask' });
      t().set('#sana', '2026-10-02');
      const t0 = performance.now();
      t().file('#fileExp', d, 'katta.xlsx');
      await t().wait('t.ready()', 'katta fayl tayyor', 90000);
      const ready = performance.now() - t0;
      const t1 = performance.now();
      t().set('#sana', '2026-10-01');
      await t().wait("t.ready() && t.text().includes('01.10.2026й.xlsx')", 'sana o\'zgargach', 90000);
      const redo = performance.now() - t1;
      await new Promise(res => setTimeout(res, 100));
      obs.disconnect();
      return { ready: Math.round(ready), redo: Math.round(redo), longest: Math.round(longest) };
    }, data);
    console.log(`20k qator: tayyor ${r.ready} ms, sana o'zgarishi ${r.redo} ms, eng uzun qotish ${r.longest} ms`);
    // Chegara yig'ilgan sahifa uchun; dev rejimda React'ning tekshiruvchi (sekin) versiyasi ishlaydi. Eski versiyada: ~3600 ms
    expect(r.longest).toBeLessThan(process.env.E2E_URL ? 1000 : 200);
  });

  it('virtual ro\'yxat: 20 000 qatordan faqat ko\'ringanlari chiziladi', async () => {
    const r = await page.run(async () => {
      (t().$('[data-tab="rows"]') as HTMLButtonElement).click();
      await t().wait("t.$('table.rows')", 'murojaatlar jadvali');
      const drawn = document.querySelectorAll('table.rows tbody tr:not(.pad)').length;
      const box = document.querySelector('.scroll.tall') as HTMLElement;
      box.scrollTop = box.scrollHeight;
      box.dispatchEvent(new Event('scroll'));
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const nos = [...document.querySelectorAll('table.rows tbody tr:not(.pad) td.no')].map(td => Number(td.textContent));
      return { drawn, lastNo: Math.max(...nos), newRows: document.querySelectorAll('table.rows tbody tr.nw').length };
    });
    expect(r.drawn).toBeLessThan(120);
    expect(r.lastNo).toBe(3 + 20000);
    await shot('6-virtual-royxat', false);
    expect(r.newRows).toBeGreaterThan(0);
  });

  it('JavaScript xatolari yo\'q', () => {
    expect(page.errors).toEqual([]);
  });

  it('Worker ochilmaydigan brauzerda ham ishlaydi (zaxira yo\'l)', async () => {
    const { identifier } = await page.send<{ identifier: string }>('Page.addScriptToEvaluateOnNewDocument', { source: 'delete window.Worker;' });
    try {
      await open();
      expect(await page.run(() => document.documentElement.dataset.engine)).toBe('local');
      await page.run((d: string) => { t().set('#sana', '2026-10-02'); t().file('#fileExp', d, 'fallback.xlsx'); }, b64(await portalFile(portalRows(30, 4))));
      await page.run(() => t().wait('t.ready()', 'zaxira yo\'lda fayl tayyor'));
      expect(await page.run(() => t().text())).toContain('Жараёндаги мурожаатлар 02.10.2026й.xlsx');
    } finally {
      await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    }
  });
});
