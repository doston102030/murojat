/* Dvigatelning sof qismi: doimiylar, sanalar, tasnif, yangi kelganlar, svod, solishtirish.
   Hech qanday DOM yoki ZIP'ga bog'liq emas — interfeys ham, Worker ham shuni ishlatadi. */

export class EngineError extends Error {
  override name = 'EngineError';
  constructor(message: string, readonly items: string[] = []) { super(message); }
}

/* ---------------------------------------------------------------- doimiylar */
export const HEADERS = ['Мурожаат рақами', 'Масала рақами', 'Фамилияси', 'Исми', 'Ҳудуд', 'Туман/шаҳар',
  'Мурожаат таснифи', 'Мурожаат таснифи', 'Ижрочи ташкилот', 'Масъул ташкилот',
  'Кўриб чиқаётган ташкилот', 'Муддат', 'Ижрога йўналтирилган сана', '№'] as const;
export const COLS = 'ABCDEFGHIJKLMN'.split('');
export const TITLE = 'Ўзбекистон Республикаси Президенти вертуал қабулхонаси орқали келиб тушган жараёндаги мурожаатлар';
export const L_COUNT = 'Количество по полю Мурожаат рақами', L_COLS = 'Названия столбцов',
  L_ROWS = 'Названия строк', L_TOTAL = 'Общий итог';
export const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const SHEET_MAIN = 'жараён', SHEET_SVOD = 'Лист2', SHEET_SRC = 'жараён (2)';
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Portalning to'liq hisoboti («Танланган ташкилотнинг масалалари рўйхати»): svod ustuni -> hisobotdagi sarlavha */
export const FULL = {
  id: 'Мурожаат рақами', type: 'Мурожаат тури', task: 'Масала рақами', last: 'Фамилияси', first: 'Исми',
  region: 'Яшаш ҳудуди', district: 'Яшаш туман (шаҳар)', tasnif: 'Масала', exec: 'Ижрочи ташкилот',
  resp: 'Масъул ташкилот', cur: 'Кўриб чиқаётган ташкилот', deadline: 'Масаланинг умумий муддати',
  sent: 'Ижрога йўналтирилган сана', status: 'Масала жорий ҳолати', dir: 'Мурожаат йўналиши',
} as const;
/** To'liq hisobotdan faqat shu holatdagilar olinadi — jarayondagi murojaatlar */
export const IN_PROCESS = ['Жараёнда', 'Янги'];
/** ...va faqat shu yo'nalishdagilar — portal ro'yxatidagidek (fuqarodan to'g'ridan-to'g'ri, quyi tashkilotlarga kelganlar olinmaydi) */
export const FULL_DIR = 'Юқори ташкилотлардан келиб тушган';

/** Standart qoidalar: portal tasnifi -> svoddagi toifa (foydalanuvchi shablonidan olingan) */
export const BASE_RULES: ReadonlyArray<readonly [string, string]> = [
  ['Газ баллонни тўлдиришдаги муаммолар', 'СУГ'],
  ['Табиий газ истеъмоли учун тўловлар ва қарздорлик', 'Хисоб китоб'],
  ['Қарздорлик туфайли табиий газ тармоғидан узиш, қайта улаш', 'Хисоб китоб'],
  ['Табиий газ ҳисоблагичдаги носозликлар (ечиш, ўрнатиш, пломбалаш)', 'ЭГХУ'],
  ['Газ тармоғи ходими хатти-ҳаракатлари', 'Ходими хатти-ҳаракатлари'],
  ['Табиий газ (босими) таъминотидаги муаммолар', 'Табиий газда узилиш'],
  ['Табиий газ тармоғи объектларини қуриш, таъмирлаш ва ўзгартириш', 'Табиий газда узилиш'],
  ['Газ таъминоти корхоналари ишонч телефонлари (1104) фаолияти', 'Табиий газда узилиш'],
  ['Маиший (янги) газ баллон билан таъминлаш', 'Балон'],
  ['Турар жойни табиий газ тармоғига улаш ва ҳисобварақ очиш', 'Табиий газга уланиш'],
  ['Аҳоли пунктининг табиий газ тармоғидан узилганлигидан норозилик', 'Табиий газга уланиш'],
];

/* ---------------------------------------------------------------- turlar */
export type CellKind = 'empty' | 'str' | 'num';
export interface Cell {
  s: number;              // uslub (xf) raqami
  kind: CellKind;
  text: string;
  raw: string | null;     // raqamning asl yozuvi
  num: number | null;
  f: string | null;       // formula
  wasText?: boolean;      // sana matn ko'rinishida kelib, raqamga aylantirilgan
}
export interface Row {
  r: number;              // manbadagi qator raqami
  ht: string | null;
  v: Cell[];              // A..N (14 ta)
  id: string;
  task: string;
  org: string;
  tasnif: string;
  linkA: string | null;
  linkB: string | null;
  tableEnd: boolean;      // birinchi jadvalning oxirgi qatori (pastki chegara yo'q)
  red: boolean;           // N/P ustuni qizil — avvalgi hisobotda «yangi kelgan»
  cat: string | null;
  m: number | null;       // «Ижрога йўналтирилган сана» (Excel raqami)
}
export interface Table {
  label: string;
  sheetName: string;
  headerRow: number;
  firstRow: number;
  lastRow: number;
  rows: Row[];
  problems: string[];
  printer: Uint8Array | null;
  reportDate: string | null;   // oldingi hisobot bo'lsa: ISO sana (YYYY-MM-DD)
  sheetNames: string[];
  full: FullReport | null;     // portalning to'liq hisobotidan olingan bo'lsa
}
export interface FullReport {
  total: number;               // hisobotdagi barcha murojaatlar
  asOf: number | null;         // hisobot qaysi paytgacha (Excel raqami): sarlavhadagi davr oxiri
}

export const emptyCell = (): Cell => ({ s: 0, kind: 'empty', text: '', raw: null, num: null, f: null });

/* ---------------------------------------------------------------- yordamchilar */
export const collator = new Intl.Collator('ru');
export const norm = (s: unknown): string => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
export const escT = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escA = (s: string) => escT(s).replace(/"/g, '&quot;');
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const NUM_RE = /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/;

export function colName(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}
export function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) { const c = ref.charCodeAt(i); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n;
}

/* Excel sana raqami <-> ko'rinish */
function serialParts(serial: number) {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds() };
}
export function fmtSerial(serial: unknown, withSec = false): string {
  if (typeof serial !== 'number' || !isFinite(serial)) return '';
  const p = serialParts(serial);
  return `${pad2(p.d)}.${pad2(p.m)}.${p.y} ${pad2(p.hh)}:${pad2(p.mm)}` + (withSec ? `:${pad2(p.ss)}` : '');
}
/** Excel sana raqamining kuni: YYYY-MM-DD */
export function serialDay(serial: number): string {
  const p = serialParts(serial);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}
export function textToSerial(text: string): number | null {
  const t = norm(text);
  let m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let y: number, mo: number, d: number;
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else {
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    y = +m[1]; mo = +m[2]; d = +m[3];
  }
  const hh = +(m[4] || 0), mi = +(m[5] || 0), ss = +(m[6] || 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59 || ss > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, hh, mi, ss), chk = new Date(ms);
  if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return null;
  return ms / 86400000 + 25569;
}

export interface DateLabels { dmy: string; sheet: string; newCol: string; file: string }
/** '2026-10-03' -> svod va fayl nomidagi yorliqlar */
export function dateLabels(iso: string): DateLabels {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) throw new EngineError('Hisobot sanasi noto\'g\'ri');
  const y = +m[1], mo = +m[2], d = +m[3];
  const date = new Date(`${iso}T00:00:00Z`);
  if (y < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== mo || date.getUTCDate() !== d)
    throw new EngineError('Hisobot sanasi noto\'g\'ri');
  const dmy = `${pad2(d)}.${pad2(mo)}.${y}`;
  return { dmy, sheet: `${dmy}й`, newCol: `${d}-${MONTHS[mo - 1]} ЯНГИ КЕЛГАН`, file: `Жараёндаги мурожаатлар ${dmy}й.xlsx` };
}
export function isValidDate(iso: string): boolean {
  try { dateLabels(iso); return true; } catch { return false; }
}

/* ---------------------------------------------------------------- tasnif */
export type Rules = Map<string, string>;
export function rulesMap(extra?: Iterable<readonly [string, string]>): Rules {
  const m: Rules = new Map(BASE_RULES.map(([t, c]) => [norm(t), c]));
  if (extra) for (const [t, c] of extra) if (norm(c)) m.set(norm(t), norm(c));
  return m;
}
export interface Unknown { text: string; count: number }
/** Har bir qatorga toifa qo'yadi (r.cat); qoidasi yo'q tasniflarni qaytaradi. */
export function classify(rows: Row[], rules: Rules): Unknown[] {
  const unknown = new Map<string, number>();
  for (const r of rows) {
    const key = norm(r.tasnif), cat = rules.get(key) || null;
    r.cat = cat;
    if (!cat && key) unknown.set(key, (unknown.get(key) || 0) + 1);
  }
  return Array.from(unknown, ([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count || collator.compare(a.text, b.text));
}

export interface Dup { first: Row; again: Row; index: number }
const dupKey = (r: Row) => r.id + '\u0001' + r.task;
export function findDuplicates(rows: Row[]): Dup[] {
  const seen = new Map<string, number>(), dups: Dup[] = [];
  rows.forEach((r, i) => { const k = dupKey(r), j = seen.get(k); if (j !== undefined) dups.push({ first: rows[j], again: r, index: i }); else seen.set(k, i); });
  return dups;
}
export function dedupe(rows: Row[]): Row[] {
  const seen = new Set<string>();
  return rows.filter(r => { const k = dupKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
}

/* ---------------------------------------------------------------- yangi kelganlar
   Portalning ikkinchi ro'yxati jadval pastiga qo'shilgan.
   Belgi 1: «Ижрога йўналтирилган сана» tartibi qayta boshlanadi.
   Belgi 2: birinchi jadvalning oxirgi qatori (pastki chegarasiz). */
export type DetectKind = 'restart' | 'none' | 'ends' | 'many' | 'date';
export interface Candidate { count: number; row: number }
export interface Detect {
  count: number; sure: boolean; large?: boolean; kind: DetectKind;
  boundaryRow: number | null; tableEnd: boolean; candidates: Candidate[];
}
export function detectNew(rows: Row[]): Detect {
  const n = rows.length, restarts: number[] = [];
  for (let i = 1; i < n; i++) { const a = rows[i - 1].m, b = rows[i].m; if (a !== null && b !== null && b < a) restarts.push(i); }
  let ends: number[] = [];
  for (let i = 0; i < n - 1; i++) if (rows[i].tableEnd) ends.push(i + 1);
  if (ends.length > Math.max(3, n * 0.1)) ends = [];
  const at = (b: number): Candidate => ({ count: n - b, row: rows[b].r });
  if (restarts.length === 1) {
    const b = restarts[0];
    const large = n - b > b;                         // "yangi" blok asosiy ro'yxatdan katta — tartib adashgan bo'lishi mumkin
    return { count: n - b, sure: !large, large, kind: 'restart', boundaryRow: rows[b].r, tableEnd: ends.includes(b), candidates: [at(b)] };
  }
  if (restarts.length === 0) {
    if (!ends.length) return { count: 0, sure: false, kind: 'none', boundaryRow: null, tableEnd: false, candidates: [] };
    const page = ends.length === 1 && ends[0] % 100 === 0;   // portal sahifasi chegarasi (100 tadan)
    const b = ends[ends.length - 1];
    return { count: page ? 0 : n - b, sure: false, kind: 'ends', boundaryRow: page ? null : rows[b].r, tableEnd: true, candidates: ends.map(at) };
  }
  const withEnd = restarts.filter(b => ends.includes(b));
  const b = withEnd.length === 1 ? withEnd[0] : restarts[restarts.length - 1];
  return { count: n - b, sure: false, kind: 'many', boundaryRow: rows[b].r, tableEnd: ends.includes(b), candidates: restarts.map(at) };
}

/** To'liq hisobot: qatorlar «Ижрога йўналтирилган сана» bo'yicha tartiblangan, yangi kelganlar — hisobot kuni
    yo'naltirilganlar (jadval oxirida). */
export function detectByDay(rows: Row[], asOf: number | null): Detect {
  const n = rows.length, d = asOf === null ? null : serialDay(asOf);
  let b = n;
  while (d !== null && b > 0 && rows[b - 1].m !== null && serialDay(rows[b - 1].m as number) >= d) b--;
  return { count: n - b, sure: true, kind: 'date', boundaryRow: b < n ? rows[b].r : null, tableEnd: false, candidates: [] };
}

/* ---------------------------------------------------------------- svod */
export interface Svod {
  cats: string[]; orgs: string[];
  cnt: number[][]; newBy: number[]; rowTot: number[]; colTot: number[];
  total: number; newTotal: number;
  catFirst: string[]; orgFirst: string[];          // kesh tartibi: birinchi uchragan tartibda
  catIdx: Map<string, number>; orgIdx: Map<string, number>;
}
/** Toifasi qo'yilgan qatorlar bo'yicha svod. Qatorlarda r.cat bo'lishi shart. */
export function svod(rows: Row[], newCount: number): Svod {
  const n = rows.length, firstNew = n - newCount;
  const catFirst: string[] = [], orgFirst: string[] = [], ci = new Map<string, number>(), oi = new Map<string, number>();
  for (const r of rows) {
    const cat = r.cat as string;
    if (!ci.has(cat)) { ci.set(cat, catFirst.length); catFirst.push(cat); }
    if (!oi.has(r.org)) { oi.set(r.org, orgFirst.length); orgFirst.push(r.org); }
  }
  const cats = catFirst.slice().sort(collator.compare), orgs = orgFirst.slice().sort(collator.compare);
  const cnt = orgs.map(() => cats.map(() => 0)), newBy = orgs.map(() => 0);
  const cpos = new Map(cats.map((c, i) => [c, i])), opos = new Map(orgs.map((o, i) => [o, i]));
  rows.forEach((r, i) => {
    const o = opos.get(r.org)!;
    cnt[o][cpos.get(r.cat as string)!]++;
    if (i >= firstNew) newBy[o]++;
  });
  return {
    cats, orgs, cnt, newBy,
    rowTot: cnt.map(a => a.reduce((x, y) => x + y, 0)),
    colTot: cats.map((_, j) => cnt.reduce((x, a) => x + a[j], 0)),
    total: n, newTotal: newCount, catFirst, orgFirst, catIdx: ci, orgIdx: oi,
  };
}

/* ---------------------------------------------------------------- oldingi hisobot bilan solishtirish */
export interface Diff { col: string; header: string; date: boolean; from: string | number | null; to: string | number | null }
export interface Comparison {
  removed: Row[]; added: Row[]; changed: Array<{ row: Row; diffs: Diff[] }>;
  prevTotal: number; total: number; prevNew: number;
  orgDelta: Array<{ org: string; from: number; to: number }>;
}
export function compare(prevRows: Row[], rows: Row[]): Comparison {
  // Murojaat raqami ikkala faylda ham takrorlanmasa — kalit shu; aks holda raqam + masala raqami.
  const unique = (list: Row[]) => new Set(list.map(r => r.id)).size === list.length;
  const key = unique(prevRows) && unique(rows) ? (r: Row) => r.id : (r: Row) => r.id + ' · ' + r.task;
  const P = new Map(prevRows.map(r => [key(r), r])), C = new Map(rows.map(r => [key(r), r]));
  const show = (c: Cell) => (c.kind === 'num' ? c.num : c.text);
  const quotes = (t: string) => t.replace(/[“”„«»]/g, '"');           // portal ro'yxatlari qo'shtirnoqni har xil yozadi
  const removed = prevRows.filter(r => !C.has(key(r))), added = rows.filter(r => !P.has(key(r)));
  const changed: Comparison['changed'] = [];
  for (const r of rows) {
    const p = P.get(key(r));
    if (!p) continue;
    const diffs: Diff[] = [];
    for (let j = 1; j < 14; j++) {
      if (j === 7) continue;
      const a = p.v[j], b = r.v[j];
      if (j === 13 && b.kind === 'empty') continue;                    // to'liq hisobotda yangilanish sanasi yo'q
      const same = a.kind === b.kind && (a.kind === 'num' ? Math.abs((a.num as number) - (b.num as number)) < 1e-9 : quotes(a.text) === quotes(b.text));
      if (!same) diffs.push({ col: COLS[j], header: HEADERS[j], date: j >= 12, from: show(a), to: show(b) });
    }
    if (diffs.length) changed.push({ row: r, diffs });
  }
  const tot = (list: Row[]) => { const m = new Map<string, number>(); for (const r of list) m.set(r.org, (m.get(r.org) || 0) + 1); return m; };
  const tp = tot(prevRows), tc = tot(rows);
  const orgs = Array.from(new Set([...tp.keys(), ...tc.keys()])).sort(collator.compare);
  return {
    removed, added, changed, prevTotal: prevRows.length, total: rows.length, prevNew: prevRows.filter(r => r.red).length,
    orgDelta: orgs.map(o => ({ org: o, from: tp.get(o) || 0, to: tc.get(o) || 0 })).filter(d => d.from !== d.to),
  };
}

/** Toshkent vaqti bo'yicha bugungi sana (YYYY-MM-DD) */
export function todayTashkent(now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return new Date(now.getTime() + 5 * 3600000).toISOString().slice(0, 10);
  }
}
