/* Excel qismi: .xlsx ni o'qish, shablondagi kitobni yig'ish va tayyor faylni qayta o'qib tekshirish.
   DOM'siz (xml.ts) — Web Worker ichida ishlaydi, sahifa qotmaydi. */
import JSZip from 'jszip';
import STATIC from './static.json';
import { parse, sax, findAll, findFirst, nsAttr, XmlError, type XEl, type Attrs } from './xml';
import {
  EngineError, HEADERS, COLS, TITLE, L_COUNT, L_COLS, L_ROWS, L_TOTAL, SHEET_MAIN, SHEET_SVOD, SHEET_SRC, XLSX_MIME, FULL, FULL_DIR, IN_PROCESS,
  NUM_RE, emptyCell, norm, escT, escA, colName, colIndex, textToSerial, fmtSerial, dateLabels, svod,
  type Cell, type Row, type Table, type Svod, type DateLabels,
} from './core';

const S = STATIC as Record<string, string>;
const HDR_STYLE = [1, 1, 2, 2, 2, 2, 1, 1, 3, 1, 1, 1, 1, 1];
const FREE_HEADER: Record<number, boolean> = { 7: true, 13: true };   // H va N sarlavhasi har xil bo'lishi mumkin
const HDR_URL = 'https://cabinetpm2.gov.uz/uz/tasks/checking?pageSize=100&sort=';
const HDR_LINKS: Array<[string, string]> = [['A2', 'request_id'], ['B2', 'task_no'], ['G2', 'classification_id'],
  ['I2', 'executor_authority_id'], ['J2', 'authority_id'], ['K2', 'current_authority_id'],
  ['L2', 'deadline'], ['M2', 'created_at'], ['N2', 'updated_at'], ['H2', 'classification_id']];
const T_HL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';
const T_PS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL_NS = /relationships$/i;

/* ---------------------------------------------------------------- XML yordamchilari */
function xmlTree(text: string, what: string): XEl {
  try { return parse(text); }
  catch (e) { throw new EngineError(`${what}: fayl ichidagi jadval o'qilmadi (XML buzilgan)`, e instanceof XmlError ? [e.message] : []); }
}
function xmlScan(text: string, what: string, h: Parameters<typeof sax>[1]): void {
  try { sax(text, h); }
  catch (e) {
    if (e instanceof XmlError) throw new EngineError(`${what}: fayl ichidagi jadval o'qilmadi (XML buzilgan)`, [e.message]);
    throw e;
  }
}
interface Rel { target: string; type: string; mode: string }
function parseRels(text: string | null): Record<string, Rel> {
  const out: Record<string, Rel> = {};
  if (!text) return out;
  for (const r of findAll(xmlTree(text, 'rels'), 'Relationship'))
    out[r.attrs.Id] = { target: r.attrs.Target || '', type: r.attrs.Type || '', mode: r.attrs.TargetMode || '' };
  return out;
}
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const out: string[] = [];
  for (const p of (baseDir + target).split('/')) { if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p); }
  return out.join('/');
}

/** <si>/<is> ichidagi matnni yig'uvchi: t to'g'ridan-to'g'ri yoki r/t ichida (fonetik rPh — tashqarida). */
class RichText {
  private path: string[] = [];
  value = '';
  open(local: string) { this.path.push(local); }
  close() { this.path.pop(); }
  text(t: string) {
    const p = this.path, k = p.length;
    if (p[k - 1] === 't' && (k === 1 || (k === 2 && p[0] === 'r'))) this.value += t;
  }
}

function parseSst(text: string | null): string[] {
  if (!text) return [];
  const out: string[] = [];
  let depth = 0, cur: RichText | null = null;
  xmlScan(text, 'sharedStrings.xml', {
    open(local) {
      depth++;
      if (cur) cur.open(local);
      else if (depth === 2 && local === 'si') cur = new RichText();
    },
    close() {
      depth--;
      if (!cur) return;
      if (depth === 1) { out.push(cur.value); cur = null; } else cur.close();
    },
    text(t) { if (cur) cur.text(t); },
  });
  return out;
}

interface Styles { xfFont: number[]; xfBorder: number[]; fontRed: boolean[]; openBottom: boolean[] }
function parseStyles(text: string | null): Styles {
  const out: Styles = { xfFont: [], xfBorder: [], fontRed: [], openBottom: [] };
  if (!text) return out;
  const doc = xmlTree(text, 'styles.xml');
  const sec = (name: string) => findFirst(doc, name)?.kids ?? [];
  for (const f of sec('fonts'))
    out.fontRed.push(f.kids.some(ch => ch.local === 'color' && (ch.attrs.rgb || '').toUpperCase() === 'FFFF0000'));
  for (const b of sec('borders')) {
    const has = (n: string) => { const ch = b.kids.find(k => k.local === n); return !!(ch && ch.attrs.style); };
    out.openBottom.push((has('top') || has('left') || has('right')) && !has('bottom'));
  }
  for (const x of sec('cellXfs')) { out.xfFont.push(+x.attrs.fontId || 0); out.xfBorder.push(+x.attrs.borderId || 0); }
  return out;
}

/* ---------------------------------------------------------------- kitob va varaq */
interface SheetRef { name: string; path: string }
interface Workbook {
  zip: JSZip; label: string; sheets: SheetRef[]; sst: string[]; styles: Styles;
  text(path: string): Promise<string | null>;
}
export async function readWorkbook(data: ArrayBuffer | Uint8Array, label: string): Promise<Workbook> {
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(data); }
  catch { throw new EngineError(`${label}: bu .xlsx fayl emas yoki buzilgan. Eski .xls bo'lsa, Excel'da «.xlsx» qilib saqlang.`); }
  const text = async (p: string) => { const f = zip.file(p); return f ? f.async('string') : null; };
  const wbXml = await text('xl/workbook.xml');
  if (!wbXml) throw new EngineError(`${label}: Excel kitobi topilmadi. Fayl .xlsx bo'lishi kerak.`);
  const wbDoc = xmlTree(wbXml, label);
  const rels = parseRels(await text('xl/_rels/workbook.xml.rels'));
  const sheets: SheetRef[] = [];
  for (const sh of findAll(wbDoc, 'sheet')) {
    const rel = rels[nsAttr(sh.attrs, sh.ns, 'id', REL_NS) ?? ''];
    if (rel) sheets.push({ name: sh.attrs.name || '', path: resolvePath('xl/', rel.target) });
  }
  let sstPath = 'xl/sharedStrings.xml', stPath = 'xl/styles.xml';
  for (const id in rels) {
    if (/\/sharedStrings$/.test(rels[id].type)) sstPath = resolvePath('xl/', rels[id].target);
    if (/\/styles$/.test(rels[id].type)) stPath = resolvePath('xl/', rels[id].target);
  }
  return { zip, text, label, sheets, sst: parseSst(await text(sstPath)), styles: parseStyles(await text(stPath)) };
}

export interface SheetRow { r: number; ht: string | null; cells: Record<number, Cell> }
export interface Sheet { name: string; rows: SheetRow[]; links: Record<string, string>; printer: string | null }

/** Varaqni oqimli o'qish: daraxt qurmasdan to'g'ridan-to'g'ri qator/katak obyektlari. */
export async function loadSheet(wb: Workbook, sheet: SheetRef, opts: { maxRows?: number } = {}): Promise<Sheet> {
  const xml = await wb.text(sheet.path);
  if (xml == null) throw new EngineError(`${wb.label}: «${sheet.name}» varag'i o'qilmadi`);
  const dir = sheet.path.replace(/[^/]+$/, '');
  const rels = parseRels(await wb.text(dir + '_rels/' + sheet.path.slice(dir.length) + '.rels'));
  const rows: SheetRow[] = [], hl: Array<{ ref: string; rid: string | null }> = [];
  const sst = wb.sst, maxRows = opts.maxRows ?? Infinity;

  let inData = false, prevR = 0, row: SheetRow | null = null, prevC = 0;
  // joriy katak: <c> ichidagi chuqurlik va qaysi bolasi ichida ekanimiz (v / f / is)
  let inCell = false, depth = 0, mode: 'v' | 'f' | 'is' | 'skip' | null = null;
  let col = 0, ct: string | undefined, cs = 0, v: string | null = null, f: string | null = null, inl: RichText | null = null;

  xmlScan(xml, `${wb.label} · ${sheet.name}`, {
    open(local: string, a: Attrs, ns) {
      if (inCell) {
        if (depth === 0) {
          mode = local === 'v' || local === 'f' || local === 'is' ? local : 'skip';
          if (mode === 'v') v = ''; else if (mode === 'f') f = ''; else if (mode === 'is') inl = new RichText();
        } else if (mode === 'is') inl!.open(local);
        depth++;
        return;
      }
      if (local === 'sheetData') { inData = true; return; }
      if (!inData) { if (local === 'hyperlink') hl.push({ ref: a.ref, rid: nsAttr(a, ns, 'id', REL_NS) }); return; }
      if (local === 'row') {
        const r = a.r !== undefined ? parseInt(a.r, 10) : prevR + 1;
        prevR = r; prevC = 0;
        row = { r, ht: a.ht ?? null, cells: {} };
      } else if (row && local === 'c') {
        col = a.r ? colIndex(a.r) : prevC + 1; prevC = col;
        ct = a.t; cs = a.s !== undefined ? parseInt(a.s, 10) : 0;
        v = null; f = null; inl = null; inCell = true; depth = 0; mode = null;
      }
    },
    close(local: string) {
      if (inCell) {
        if (depth > 0) {
          depth--;
          if (depth === 0) mode = null; else if (mode === 'is') inl!.close();
          return;
        }
        inCell = false;                                                     // </c>
        const cell: Cell = { s: cs, kind: 'empty', text: '', raw: null, num: null, f };
        if (ct === 's') { if (v !== null) { cell.kind = 'str'; cell.text = sst[parseInt(v, 10)] || ''; } }
        else if (ct === 'inlineStr') { cell.kind = 'str'; cell.text = inl ? inl.value : ''; }
        else if (ct === 'str' || ct === 'e') { if (v !== null) { cell.kind = 'str'; cell.text = v; } }
        else if (ct === 'b') { if (v !== null) { cell.kind = 'str'; cell.text = v === '1' ? 'TRUE' : 'FALSE'; } }
        else if (v !== null && v.trim() !== '') { cell.kind = 'num'; cell.raw = v.trim(); cell.num = Number(v); cell.text = cell.raw; }
        if (cell.kind === 'str' && cell.text === '') cell.kind = 'empty';
        row!.cells[col] = cell;
        return;
      }
      if (local === 'row' && row) { if (rows.length < maxRows) rows.push(row); row = null; }
      else if (local === 'sheetData') inData = false;
    },
    text(t: string) {
      if (!inCell || depth === 0) return;
      if (mode === 'is') inl!.text(t);
      else if (depth === 1) { if (mode === 'v') v += t; else if (mode === 'f') f += t; }
    },
  });

  const links: Record<string, string> = {};
  for (const h of hl) {
    const rel = h.rid ? rels[h.rid] : undefined;
    if (!h.ref || !rel || !/^https?:/i.test(rel.target)) continue;
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(h.ref);
    if (!m) continue;
    const c1 = colIndex(m[1]), r1 = +m[2], c2 = m[3] ? colIndex(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > 400) continue;
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) links[colName(c) + r] = rel.target;
  }
  let printer: string | null = null;
  for (const id in rels) if (/\/printerSettings$/.test(rels[id].type)) printer = resolvePath(dir, rels[id].target);
  return { name: sheet.name, rows, links, printer };
}

/* ---------------------------------------------------------------- jadvalni ajratib olish */
export async function readTable(data: ArrayBuffer | Uint8Array, label: string): Promise<Table> {
  const wb = await readWorkbook(data, label);
  const order = wb.sheets.slice().sort((a, b) => Number(b.name === SHEET_MAIN) - Number(a.name === SHEET_MAIN));
  let sheet: Sheet | null = null, hi = -1, full = false;
  for (const sh of order) {
    const cand = await loadSheet(wb, sh);
    const i = cand.rows.findIndex((row, k) => k < 60 && row.cells[1] && norm(row.cells[1].text) === HEADERS[0]);
    if (i >= 0) { sheet = cand; hi = i; break; }
    const j = cand.rows.findIndex((row, k) => k < 60 && hasHeader(row, FULL.id) && hasHeader(row, FULL.status));
    if (j >= 0) { sheet = cand; hi = j; full = true; break; }
  }
  if (!sheet) throw new EngineError(`${label}: «${HEADERS[0]}» sarlavhasi bor jadval topilmadi.`,
    ['Varaqlar: ' + (wb.sheets.map(s => '«' + s.name + '»').join(', ') || 'yo\'q')]);
  if (full) return readFull(wb, sheet, hi, label);

  const hrow = sheet.rows[hi], bad: string[] = [];
  HEADERS.forEach((h, j) => {
    if (FREE_HEADER[j]) return;
    const got = norm((hrow.cells[j + 1] || emptyCell()).text);
    if (got !== h) bad.push(`${COLS[j]} ustuni: «${h}» bo'lishi kerak, faylda «${got || 'bo\'sh'}»`);
  });
  if (bad.length) throw new EngineError(`${label}: ustunlar tartibi kutilganidek emas (${hrow.r}-qator sarlavhasi).`, bad);

  const st = wb.styles, rows: Row[] = [], problems: string[] = [];
  const links = sheet.links;
  for (let k = hi + 1; k < sheet.rows.length; k++) {
    const row = sheet.rows[k];
    const v = COLS.map((_, j) => row.cells[j + 1] || emptyCell());
    if (v.every(c => c.kind === 'empty')) continue;
    const red15 = row.cells[15];
    const rec: Row = {
      r: row.r, ht: row.ht, v, id: norm(v[0].text), task: norm(v[1].text), org: v[8].text, tasnif: v[6].text,
      linkA: links['A' + row.r] || null, linkB: links['B' + row.r] || null,
      tableEnd: !!st.openBottom[st.xfBorder[v[0].s]],
      red: !!st.fontRed[st.xfFont[v[13].s]] || !!(red15 && st.fontRed[st.xfFont[red15.s]]),
      cat: null, m: null,
    };
    if (!rec.id) problems.push(`${row.r}-qator: murojaat raqami (A ustuni) bo'sh`);
    if (!norm(rec.tasnif)) problems.push(`${row.r}-qator: murojaat tasnifi (G ustuni) bo'sh`);
    if (!norm(rec.org)) problems.push(`${row.r}-qator: ijrochi tashkilot (I ustuni) bo'sh`);
    for (const j of [12, 13]) {                        // sanalar: raqam bo'lishi kerak; matn bo'lsa aylantiramiz
      const c = v[j];
      if (c.kind === 'str') {
        const ser = textToSerial(c.text);
        if (ser !== null) v[j] = { s: c.s, kind: 'num', text: String(ser), raw: String(ser), num: ser, f: null, wasText: true };
        else if (j === 12) problems.push(`${row.r}-qator: «${HEADERS[12]}» sanaga o'xshamaydi («${c.text}»)`);
      } else if (c.kind === 'num' && !NUM_RE.test(c.raw as string)) problems.push(`${row.r}-qator: ${COLS[j]} ustunidagi qiymat raqam emas`);
      else if (c.kind === 'empty' && j === 12) problems.push(`${row.r}-qator: «${HEADERS[12]}» bo'sh`);
    }
    rec.m = v[12].kind === 'num' ? v[12].num : null;
    rows.push(rec);
  }
  if (!rows.length) throw new EngineError(`${label}: sarlavha ostida birorta ham murojaat yo'q.`);
  let printer: Uint8Array | null = null;
  if (sheet.printer && wb.zip.file(sheet.printer)) printer = await wb.zip.file(sheet.printer)!.async('uint8array');

  // oldingi hisobot bo'lsa: svoddagi sana yorlig'i (dastlabki 3 qatorda)
  let reportDate: string | null = null;
  const svodSheet = wb.sheets.find(s => s.name === SHEET_SVOD);
  if (svodSheet) {
    try {
      const sv = await loadSheet(wb, svodSheet, { maxRows: 3 });
      for (const row of sv.rows) {
        if (row.r > 3) break;
        for (const c in row.cells) {
          const mm = /(\d{2})\.(\d{2})\.(\d{4})/.exec(row.cells[c].text);
          if (!mm) continue;
          const candidate = `${mm[3]}-${mm[2]}-${mm[1]}`;
          try { dateLabels(candidate); reportDate = candidate; } catch { /* noto'g'ri yorliqni o'tkazamiz */ }
        }
      }
    } catch { /* svod varag'i o'qilmasa ham jadval yetarli */ }
  }
  return { label, sheetName: sheet.name, headerRow: hrow.r, firstRow: rows[0].r, lastRow: rows[rows.length - 1].r,
    rows, problems, printer, reportDate, sheetNames: wb.sheets.map(s => s.name), full: null };
}

const hasHeader = (row: SheetRow, h: string) => Object.values(row.cells).some(c => norm(c.text) === h);

/** Portalning to'liq hisoboti: istalgan tartibdagi ustunlar, hamma holatdagi murojaatlar.
    Jarayondagi (IN_PROCESS) va yuqoridan kelganlari (FULL_DIR) olinadi va portal ro'yxati ko'rinishiga (A..N) keltiriladi;
    «Ижрога йўналтирилган сана» bo'yicha tartiblanadi — hisobot kuni kelganlar eng pastda. */
async function readFull(wb: Workbook, sheet: Sheet, hi: number, label: string): Promise<Table> {
  const hrow = sheet.rows[hi], keys = Object.keys(FULL) as Array<keyof typeof FULL>;
  const at: Partial<Record<keyof typeof FULL, number>> = {};
  for (const c in hrow.cells) {
    const t = norm(hrow.cells[c].text);
    for (const k of keys) if (FULL[k] === t && at[k] === undefined) at[k] = +c;
  }
  const missing = keys.filter(k => at[k] === undefined);
  if (missing.length) throw new EngineError(`${label}: portal hisobotida kerakli ustunlar yo'q (${hrow.r}-qator sarlavhasi).`,
    missing.map(k => `«${FULL[k]}» ustuni topilmadi`));
  const col = at as Record<keyof typeof FULL, number>;

  const str = (t: string): Cell => (t ? { s: 0, kind: 'str', text: t, raw: null, num: null, f: null } : emptyCell());
  const asDate = (c: Cell): Cell | null => {
    if (c.kind === 'num' && NUM_RE.test(c.raw as string)) return { s: 0, kind: 'num', text: c.raw as string, raw: c.raw, num: c.num, f: null };
    const ser = c.kind === 'str' ? textToSerial(c.text) : null;
    return ser === null ? null : { s: 0, kind: 'num', text: String(ser), raw: String(ser), num: ser, f: null, wasText: true };
  };
  const day = (ser: number) => fmtSerial(ser).slice(0, 10);

  const rows: Row[] = [], problems: string[] = [];
  let total = 0;
  for (let k = hi + 1; k < sheet.rows.length; k++) {
    const row = sheet.rows[k], get = (key: keyof typeof FULL) => row.cells[col[key]] || emptyCell();
    if (Object.values(row.cells).every(c => c.kind === 'empty')) continue;
    total++;
    if (!IN_PROCESS.includes(norm(get('status').text)) || norm(get('dir').text) !== FULL_DIR) continue;

    const sentSrc = get('sent'), sent = asDate(sentSrc), dl = asDate(get('deadline'));
    const m = sent ? sent.num as number : null;
    const term = !dl ? get('deadline').text : m === null ? day(dl.num as number)
      : `${Math.round(Math.floor(dl.num as number) - Math.floor(m))} кун (${day(dl.num as number)})`;
    const task = [norm(get('task').text), norm(get('type').text)].filter(Boolean).join('-');      // «1-Ариза», portal ro'yxatidagidek
    const v: Cell[] = [
      str(get('id').text), str(task), str(get('last').text), str(get('first').text), str(get('region').text), str(get('district').text),
      str(get('tasnif').text), emptyCell(), str(get('exec').text), str(get('resp').text), str(get('cur').text),
      str(term), sent ?? str(sentSrc.text), emptyCell(),
    ];
    const rec: Row = {
      r: row.r, ht: null, v, id: norm(v[0].text), task: norm(v[1].text), org: v[8].text, tasnif: v[6].text,
      linkA: sheet.links[colName(col.id) + row.r] || null, linkB: null, tableEnd: false, red: false, cat: null, m,
    };
    if (!rec.id) problems.push(`${row.r}-qator: «${FULL.id}» bo'sh`);
    if (!norm(rec.tasnif)) problems.push(`${row.r}-qator: «${FULL.tasnif}» (murojaat tasnifi) bo'sh`);
    if (!norm(rec.org)) problems.push(`${row.r}-qator: «${FULL.exec}» bo'sh`);
    if (sentSrc.kind === 'empty') problems.push(`${row.r}-qator: «${FULL.sent}» bo'sh`);
    else if (!sent) problems.push(`${row.r}-qator: «${FULL.sent}» sanaga o'xshamaydi («${sentSrc.text}»)`);
    rows.push(rec);
  }
  if (!rows.length) throw new EngineError(`${label}: hisobotda jarayondagi murojaat yo'q.`,
    [`Hisobotdagi ${total} ta murojaatning birortasi ham «${IN_PROCESS.join('», «')}» holatida va «${FULL_DIR}» yo'nalishida emas.`]);
  rows.sort((a, b) => (a.m ?? 0) - (b.m ?? 0));

  // hisobot qaysi paytgacha: sarlavhadagi «( 01.01.2026 00:00:00 - 05.10.2026 16:00:00 )»; topilmasa — eng oxirgi yo'naltirilgan sana
  let asOf: number | null = null;
  for (const row of sheet.rows.slice(0, hi)) for (const c of Object.values(row.cells)) {
    const mm = /-\s*(\d{1,2}\.\d{1,2}\.\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\s*\)/.exec(c.text);
    if (mm && asOf === null) asOf = textToSerial(mm[1]);
  }
  if (asOf === null) for (const r of rows) if (r.m !== null && (asOf === null || r.m > asOf)) asOf = r.m;

  let printer: Uint8Array | null = null;
  if (sheet.printer && wb.zip.file(sheet.printer)) printer = await wb.zip.file(sheet.printer)!.async('uint8array');
  const firstRow = rows.reduce((x, r) => Math.min(x, r.r), Infinity), lastRow = rows.reduce((x, r) => Math.max(x, r.r), 0);
  return { label, sheetName: sheet.name, headerRow: hrow.r, firstRow, lastRow,
    rows, problems, printer, reportDate: null, sheetNames: wb.sheets.map(s => s.name), full: { total, asOf } };
}

/* ---------------------------------------------------------------- kitobni yig'ish */
const wideCat = (name: string) => name.split(/\s+/).some(w => w.length > 12);
function guid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const u = c && typeof c.randomUUID === 'function' ? c.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  return '{' + u.toUpperCase() + '}';
}

function pivotTableXml(sv: Svod): string {
  const k = sv.cats.length, m = sv.orgs.length, last = colName(2 + k) + (5 + m);
  const items = (order: string[], idx: Map<string, number>) => order.map(v => `<item x="${idx.get(v)}"/>`).join('') + '<item t="default"/>';
  const seq = (cnt: number) => { let s = '<i><x/></i>'; for (let i = 1; i < cnt; i++) s += `<i><x v="${i}"/></i>`; return s + '<i t="grand"><x/></i>'; };
  const A_ALL = '<pivotArea outline="0" collapsedLevelsAreSubtotals="1" fieldPosition="0"/>';
  const A_BTN = '<pivotArea field="2" type="button" dataOnly="0" labelOnly="1" outline="0" axis="axisRow" fieldPosition="0"/>';
  const A_ROWL = '<pivotArea dataOnly="0" labelOnly="1" fieldPosition="0"><references count="1"><reference field="2" count="0"/></references></pivotArea>';
  const A_GROW = '<pivotArea dataOnly="0" labelOnly="1" grandRow="1" outline="0" fieldPosition="0"/>';
  const A_COLL = '<pivotArea dataOnly="0" labelOnly="1" fieldPosition="0"><references count="1"><reference field="1" count="0"/></references></pivotArea>';
  const A_GCOL = '<pivotArea dataOnly="0" labelOnly="1" grandCol="1" outline="0" fieldPosition="0"/>';
  const six = [A_ALL, A_BTN, A_ROWL, A_GROW, A_COLL, A_GCOL];
  const f = (dxf: number, area: string) => `<format dxfId="${dxf}">${area}</format>`;
  const fm: string[] = [];
  [[45, 44, 43, 42, 41, 40], [39, 38, 37, 36, 35, 34], [33, 32, 31, 30, 29, 28], [27, 25, 23, 21, 19, 17]].forEach(ids => ids.forEach((d, i) => fm.push(f(d, six[i]))));
  fm.push(f(15, A_BTN));
  for (let j = 0; j < k; j++) fm.push(f(j <= 6 ? 14 - j : 8, `<pivotArea dataOnly="0" labelOnly="1" fieldPosition="0"><references count="1"><reference field="1" count="1"><x v="${j}"/></reference></references></pivotArea>`));
  fm.push(f(7, A_GCOL), f(6, '<pivotArea type="origin" dataOnly="0" labelOnly="1" outline="0" fieldPosition="0"/>'), f(5, A_BTN), f(4, A_ROWL), f(3, A_GROW),
    f(1, '<pivotArea grandRow="1" outline="0" collapsedLevelsAreSubtotals="1" fieldPosition="0"/>'),
    f(0, '<pivotArea field="2" grandCol="1" collapsedLevelsAreSubtotals="1" axis="axisRow" fieldPosition="0"><references count="1"><reference field="2" count="0"/></references></pivotArea>'));
  let xs = ''; for (let i = 0; i < m; i++) xs += `<x v="${i}"/>`;
  return S.pt_open + `<location ref="A3:${last}" firstHeaderRow="1" firstDataRow="2" firstDataCol="1"/>` +
    '<pivotFields count="4"><pivotField dataField="1" showAll="0"/>' +
    `<pivotField axis="axisCol" showAll="0"><items count="${k + 1}">${items(sv.cats, sv.catIdx)}</items></pivotField>` +
    `<pivotField axis="axisRow" showAll="0"><items count="${m + 1}">${items(sv.orgs, sv.orgIdx)}</items></pivotField>` +
    '<pivotField showAll="0"/></pivotFields><rowFields count="1"><field x="2"/></rowFields>' +
    `<rowItems count="${m + 1}">${seq(m)}</rowItems><colFields count="1"><field x="1"/></colFields><colItems count="${k + 1}">${seq(k)}</colItems>` +
    S.pt_data + `<formats count="${fm.length}">${fm.join('')}</formats>` +
    '<conditionalFormats count="1"><conditionalFormat priority="2"><pivotAreas count="1"><pivotArea type="data" grandCol="1" collapsedLevelsAreSubtotals="1" fieldPosition="0">' +
    `<references count="2"><reference field="4294967294" count="1" selected="0"><x v="0"/></reference><reference field="2" count="${m}">${xs}</reference></references>` +
    '</pivotArea></pivotAreas></conditionalFormat></conditionalFormats>' + S.pt_tail;
}

export interface BuildModel { rows: Row[]; newCount: number; date: string; printer: Uint8Array | null; now?: Date }
export interface BuildResult { bytes: Uint8Array; filename: string; svod: Svod; labels: DateLabels }

export async function build(model: BuildModel): Promise<BuildResult> {
  const rows = model.rows, n = rows.length, nNew = model.newCount, firstNew = n - nNew;
  const D = dateLabels(model.date);
  if (!n) throw new EngineError('Murojaatlar yo\'q');
  if (!(nNew >= 0 && nNew <= n) || nNew !== Math.floor(nNew)) throw new EngineError('Yangi kelganlar soni noto\'g\'ri');
  for (const r of rows) if (!r.cat) throw new EngineError('Toifasi belgilanmagan tasnif bor');
  const FIRST = 4, LAST = FIRST + n - 1, LAST3 = 3 + n - 1;
  const sv = svod(rows, nNew);

  const sst: string[] = [], sstIdx = new Map<string, number>(); let sstRefs = 0;
  const sid = (t: string) => { sstRefs++; let i = sstIdx.get(t); if (i === undefined) { i = sst.length; sstIdx.set(t, i); sst.push(t); } return i; };
  const cs = (ref: string, s: number, text: string) => text === '' ? `<c r="${ref}" s="${s}"/>` : `<c r="${ref}" s="${s}" t="s"><v>${sid(text)}</v></c>`;
  const relHL = (id: string, url: string) => `<Relationship Id="${id}" Type="${T_HL}" Target="${escA(url)}" TargetMode="External"/>`;
  const relsXml = (list: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Relationships xmlns="${NS_PKG_REL}">${list.join('')}</Relationships>`;
  const band = (i: number) => {
    const isNew = i >= firstNew, gray = (isNew ? i - firstNew : i) % 2 === 0;
    return { isNew, link: gray ? 4 : 7, text: gray ? 5 : 8, date: gray ? 6 : 9, red: gray ? 14 : 15 };
  };

  /* ---- 1-varaq: жараён */
  const x1 = [`<row r="2" spans="1:15" ht="45" x14ac:dyDescent="0.25">${HEADERS.map((h, j) => `<c r="${COLS[j]}2" s="${HDR_STYLE[j]}" t="s"><v>${sid(h)}</v></c>`).join('')}</row>`,
    `<row r="3" spans="1:15" x14ac:dyDescent="0.25">${HEADERS.map((_h, j) => `<c r="${COLS[j]}3" s="${HDR_STYLE[j]}"/>`).join('')}</row>`];
  const rel1: string[] = [], hl1: string[] = [];
  const link1 = (ref: string, url: string, uid?: string) => { const id = 'rId' + (rel1.length + 1); rel1.push(relHL(id, url)); hl1.push(`<hyperlink ref="${ref}" r:id="${id}" display="${escA(url)}" xr:uid="${uid || guid()}"/>`); };
  HDR_LINKS.forEach(([ref, key], j) => link1(ref, HDR_URL + key, `{00000000-0004-0000-0000-0000${j.toString(16).padStart(2, '0')}000000}`));
  rows.forEach((r, i) => {
    const rn = FIRST + i, b = band(i);
    let x = `<row r="${rn}" spans="1:15"${r.ht && NUM_RE.test(r.ht) ? ` ht="${r.ht}"` : ''} x14ac:dyDescent="0.25">`;
    for (let j = 0; j < 14; j++) {
      const ref = COLS[j] + rn, c = r.v[j];
      if (j === 0) { x += cs(ref, b.link, r.id); continue; }
      if (j === 7) { x += cs(ref, b.text, r.cat as string); continue; }
      const st = j === 1 ? b.link : j >= 12 ? (j === 13 && b.isNew ? b.red : b.date) : b.text;
      if (c.kind === 'num') x += `<c r="${ref}" s="${st}"><v>${c.raw}</v></c>`;
      else x += cs(ref, st, c.kind === 'str' ? c.text : '');
    }
    x1.push(x + (b.isNew ? `<c r="O${rn}" s="13"><v>1</v></c>` : `<c r="O${rn}"><v>1</v></c>`) + '</row>');
    if (r.linkA) link1('A' + rn, r.linkA);
    if (r.linkB) link1('B' + rn, r.linkB);
  });
  let ps1 = '';
  if (model.printer) { ps1 = ` r:id="rId${rel1.length + 1}"`; rel1.push(`<Relationship Id="rId${rel1.length + 1}" Type="${T_PS}" Target="../printerSettings/printerSettings1.bin"/>`); }
  const sheet1 = S.s1pre.replace('__LAST__', String(LAST)) + x1.join('') +
    `</sheetData><autoFilter ref="A3:N${LAST}" xr:uid="{00000000-0009-0000-0000-000000000000}"/><hyperlinks>${hl1.join('')}</hyperlinks>` +
    S.margins13 + `<pageSetup paperSize="9" scale="46" orientation="landscape"${ps1}/></worksheet>`;

  /* ---- 2-varaq: Лист2 (svod) */
  const k = sv.cats.length, m = sv.orgs.length, GT = colName(2 + k), NJ = colName(3 + k), nj = 3 + k, R2 = 5 + m, span = `1:${nj}`;
  const widths: number[] = sv.cats.map((c): number => (wideCat(c) ? 19.85546875 : 12.42578125)).concat([20.140625, 18.7109375]);
  let cols = '<col min="1" max="1" width="55.42578125" style="19" customWidth="1"/>';
  for (let i = 0; i < widths.length;) {
    let j = i;
    while (j + 1 < widths.length && widths[j + 1] === widths[i]) j++;
    cols += `<col min="${i + 2}" max="${j + 2}" width="${widths[i]}" customWidth="1"/>`; i = j + 1;
  }
  const x2: string[] = [];
  {
    let x = `<row r="1" spans="${span}" ht="23.25" x14ac:dyDescent="0.25"><c r="A1" s="29" t="s"><v>${sid(TITLE)}</v></c>`;
    for (let c = 2; c <= nj; c++) x += `<c r="${colName(c)}1" s="29"/>`;
    x2.push(x + '</row>');
  }
  x2.push(`<row r="2" spans="${span}" x14ac:dyDescent="0.25"><c r="${NJ}2" t="s"><v>${sid(D.sheet)}</v></c></row>`);
  x2.push(`<row r="3" spans="${span}" x14ac:dyDescent="0.25"><c r="A3" s="22" t="s"><v>${sid(L_COUNT)}</v></c><c r="B3" s="18" t="s"><v>${sid(L_COLS)}</v></c><c r="${NJ}3" s="26"/></row>`);
  x2.push(`<row r="4" spans="${span}" ht="63.75" customHeight="1" x14ac:dyDescent="0.25"><c r="A4" s="23" t="s"><v>${sid(L_ROWS)}</v></c>` +
    sv.cats.map((c, j) => `<c r="${colName(2 + j)}4" s="21" t="s"><v>${sid(c)}</v></c>`).join('') +
    `<c r="${GT}4" s="21" t="s"><v>${sid(L_TOTAL)}</v></c><c r="${NJ}4" s="25" t="s"><v>${sid(D.newCol)}</v></c></row>`);
  sv.orgs.forEach((o, i) => {
    const r = 5 + i;
    x2.push(`<row r="${r}" spans="${span}" ht="21" x14ac:dyDescent="0.25"><c r="A${r}" s="24" t="s"><v>${sid(o)}</v></c>` +
      sv.cnt[i].map((v, j) => v ? `<c r="${colName(2 + j)}${r}" s="20"><v>${v}</v></c>` : `<c r="${colName(2 + j)}${r}" s="20"/>`).join('') +
      `<c r="${GT}${r}" s="27"><v>${sv.rowTot[i]}</v></c>` + (sv.newBy[i] ? `<c r="${NJ}${r}" s="27"><v>${sv.newBy[i]}</v></c>` : `<c r="${NJ}${r}" s="27"/>`) + '</row>');
  });
  x2.push(`<row r="${R2}" spans="${span}" ht="48" customHeight="1" x14ac:dyDescent="0.25"><c r="A${R2}" s="24" t="s"><v>${sid(L_TOTAL)}</v></c>` +
    sv.colTot.map((v, j) => `<c r="${colName(2 + j)}${R2}" s="27"><v>${v}</v></c>`).join('') +
    `<c r="${GT}${R2}" s="27"><v>${n}</v></c><c r="${NJ}${R2}" s="28"><f>SUM(${NJ}5:${NJ}${R2 - 1})</f><v>${nNew}</v></c></row>`);
  const sheet2 = S.s2open + `<dimension ref="A1:${NJ}${R2}"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><selection sqref="A1:${NJ}${R2}"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15" x14ac:dyDescent="0.25"/><cols>${cols}</cols><sheetData>${x2.join('')}</sheetData>` +
    `<mergeCells count="1"><mergeCell ref="A1:${NJ}1"/></mergeCells><conditionalFormatting pivot="1" sqref="${GT}5:${GT}${R2 - 1}">${S.s2cf}</conditionalFormatting>${S.s2margins}</worksheet>`;

  /* ---- 3-varaq: жараён (2) — svod manbasi */
  const x3 = [`<row r="2" spans="1:4" ht="30" x14ac:dyDescent="0.25"><c r="A2" s="1" t="s"><v>${sid(HEADERS[0])}</v></c><c r="B2" s="1" t="s"><v>${sid(HEADERS[6])}</v></c><c r="C2" s="3" t="s"><v>${sid(HEADERS[8])}</v></c><c r="D2" s="1" t="s"><v>${sid(HEADERS[13])}</v></c></row>`];
  const rel3: string[] = [], hl3: string[] = [];
  const link3 = (ref: string, url: string) => { const id = 'rId' + (rel3.length + 1); rel3.push(relHL(id, url)); hl3.push(`<hyperlink ref="${ref}" r:id="${id}" display="${escA(url)}" xr:uid="${guid()}"/>`); };
  link3('A2', HDR_URL + 'request_id'); link3('C2', HDR_URL + 'executor_authority_id'); link3('B2', HDR_URL + 'classification_id');
  rows.forEach((r, i) => {
    const rn = 3 + i, b = band(i);
    x3.push(`<row r="${rn}" spans="1:4" ht="28.5" x14ac:dyDescent="0.25">${cs('A' + rn, b.link, r.id)}${cs('B' + rn, b.text, r.cat as string)}${cs('C' + rn, b.text, r.org)}<c r="D${rn}" s="${b.isNew ? 17 : 16}"><v>1</v></c></row>`);
    if (r.linkA) link3('A' + rn, r.linkA);
  });
  link3('D2', HDR_URL + 'updated_at');
  let ps3 = '';
  if (model.printer) { ps3 = ` r:id="rId${rel3.length + 1}"`; rel3.push(`<Relationship Id="rId${rel3.length + 1}" Type="${T_PS}" Target="../printerSettings/printerSettings2.bin"/>`); }
  const sheet3 = S.s3pre.replace('__LAST3__', String(LAST3)) + x3.join('') + `</sheetData><hyperlinks>${hl3.join('')}</hyperlinks>` +
    S.margins13 + `<pageSetup paperSize="9" scale="46" orientation="landscape"${ps3}/></worksheet>`;

  /* ---- umumiy satrlar, svod keshi */
  const sstXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    `count="${sstRefs}" uniqueCount="${sst.length}">` + sst.map(t => (t !== t.trim() || /\s\s|[\n\t]/.test(t) ? '<si><t xml:space="preserve">' : '<si><t>') + escT(t) + '</t></si>').join('') + '</sst>';
  const now = model.now ?? new Date();
  const refreshed = ((now.getTime() + 5 * 3600000) / 86400000 + 25569).toFixed(9);          // Toshkent vaqti
  const pcd = S.pcd_open.replace('__REFRESHED__', refreshed).replace('__N__', String(n)) +
    `<cacheSource type="worksheet"><worksheetSource ref="A2:D${LAST3}" sheet="${escA(SHEET_SRC)}"/></cacheSource><cacheFields count="4">` +
    `<cacheField name="${escA(HEADERS[0])}" numFmtId="0"><sharedItems/></cacheField>` +
    `<cacheField name="${escA(HEADERS[6])}" numFmtId="0"><sharedItems count="${k}">${sv.catFirst.map(c => `<s v="${escA(c)}"/>`).join('')}</sharedItems></cacheField>` +
    `<cacheField name="${escA(HEADERS[8])}" numFmtId="0"><sharedItems count="${m}">${sv.orgFirst.map(o => `<s v="${escA(o)}"/>`).join('')}</sharedItems></cacheField>` +
    `<cacheField name="${escA(HEADERS[13])}" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="0" containsNumber="1" containsInteger="1" minValue="1" maxValue="1"/></cacheField></cacheFields>` + S.pcd_tail;
  const pcr = S.pcr_open.replace('__N__', String(n)) + rows.map(r => `<r><s v="${escA(r.id)}"/><x v="${sv.catIdx.get(r.cat as string)}"/><x v="${sv.orgIdx.get(r.org)}"/><n v="1"/></r>`).join('') + '</pivotCacheRecords>';

  const parts: Array<[string, string | Uint8Array]> = [
    ['[Content_Types].xml', S.ct], ['_rels/.rels', S.rels],
    ['xl/workbook.xml', S.wb.replace('__FLAST__', String(LAST))], ['xl/_rels/workbook.xml.rels', S.wbrels],
    ['xl/worksheets/sheet1.xml', sheet1], ['xl/worksheets/sheet2.xml', sheet2], ['xl/worksheets/sheet3.xml', sheet3],
    ['xl/theme/theme1.xml', S.theme], ['xl/styles.xml', S.styles], ['xl/sharedStrings.xml', sstXml],
    ['xl/pivotTables/pivotTable1.xml', pivotTableXml(sv)],
    ['xl/worksheets/_rels/sheet1.xml.rels', relsXml(rel1)], ['xl/worksheets/_rels/sheet2.xml.rels', S.s2rels], ['xl/worksheets/_rels/sheet3.xml.rels', relsXml(rel3)],
    ['xl/pivotTables/_rels/pivotTable1.xml.rels', S.ptrels],
    ['xl/pivotCache/pivotCacheDefinition1.xml', pcd], ['xl/pivotCache/pivotCacheRecords1.xml', pcr],
  ];
  if (model.printer) parts.push(['xl/printerSettings/printerSettings1.bin', model.printer], ['xl/printerSettings/printerSettings2.bin', model.printer]);
  parts.push(['xl/calcChain.xml', S.calc.replace('__JREF__', NJ + R2)],
    ['docProps/core.xml', S.core.replace('__MODIFIED__', now.toISOString().replace(/\.\d+Z$/, 'Z'))],
    ['docProps/app.xml', S.app], ['xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels', S.pcrels]);
  const zip = new JSZip();
  for (const [name, body] of parts) zip.file(name, body, { createFolders: false });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: XLSX_MIME });
  return { bytes, filename: D.file, svod: sv, labels: D };
}

/* ---------------------------------------------------------------- natijani qayta o'qib tekshirish */
export interface VerifyResult { ok: boolean; errors: string[]; cells: number; rows: number; cats: number; orgs: number }

export async function verify(bytes: Uint8Array, model: { rows: Row[]; newCount: number; date: string }): Promise<VerifyResult> {
  const errs: string[] = [], add = (t: string) => { if (errs.length < 40) errs.push(t); };
  let cells = 0;
  const rows = model.rows, n = rows.length, firstNew = n - model.newCount;
  const wb = await readWorkbook(bytes, 'natija');
  const names = wb.sheets.map(s => s.name);
  if (names.join('|') !== [SHEET_MAIN, SHEET_SVOD, SHEET_SRC].join('|')) add('Varaqlar nomi yoki tartibi boshqacha: ' + names.join(', '));
  if (wb.sheets.length < 3) return { ok: false, errors: errs, cells, rows: n, cats: 0, orgs: 0 };
  const st = wb.styles, isRed = (c: Cell | undefined) => !!(c && st.fontRed[st.xfFont[c.s]]);

  const s1 = await loadSheet(wb, wb.sheets[0]);
  const by1 = new Map(s1.rows.map(r => [r.r, r]));
  const hdr = by1.get(2);
  HEADERS.forEach((h, j) => { cells++; if (!hdr || !hdr.cells[j + 1] || hdr.cells[j + 1].text !== h) add(`жараён: ${COLS[j]}2 sarlavhasi boshqacha`); });
  const n1 = s1.rows.filter(r => r.r >= 4).length;
  if (n1 !== n) add(`жараён: ${n} ta qator bo'lishi kerak, faylda ${n1} ta`);
  rows.forEach((r, i) => {
    const rn = 4 + i, o = by1.get(rn), isNew = i >= firstNew;
    if (!o) { add(`жараён: ${rn}-qator yo'q`); return; }
    for (let j = 0; j < 14; j++) {
      const c = o.cells[j + 1] || emptyCell(), src = r.v[j]; cells++;
      let ok: boolean;
      if (j === 0) ok = c.kind === 'str' && c.text === r.id;
      else if (j === 7) ok = c.kind === 'str' && c.text === r.cat;
      else if (src.kind === 'num') ok = c.kind === 'num' && c.raw === src.raw;
      else if (src.kind === 'str') ok = c.kind === 'str' && c.text === src.text;
      else ok = c.kind === 'empty';
      if (!ok) add(`жараён: ${COLS[j]}${rn} manbadagi qiymatga teng emas`);
    }
    const oc = o.cells[15]; cells++;
    if (!oc || oc.raw !== '1') add(`жараён: O${rn} da 1 yo'q`);
    if (isRed(o.cells[14]) !== isNew || isRed(oc) !== isNew) add(`жараён: ${rn}-qatorning «yangi kelgan» (qizil) belgisi noto'g'ri`);
    if ((s1.links['A' + rn] || null) !== r.linkA || (s1.links['B' + rn] || null) !== r.linkB) add(`жараён: ${rn}-qator havolasi boshqacha`);
  });

  const s3 = await loadSheet(wb, wb.sheets[2]);
  const by3 = new Map(s3.rows.map(r => [r.r, r]));
  if (s3.rows.filter(r => r.r >= 3).length !== n) add(`жараён (2): ${n} ta qator bo'lishi kerak`);
  const recount = new Map<string, number>(), newBy = new Map<string, number>();
  rows.forEach((r, i) => {
    const o = by3.get(3 + i); cells += 4;
    if (!o) { add(`жараён (2): ${3 + i}-qator yo'q`); return; }
    const a = o.cells[1] || emptyCell(), b = o.cells[2] || emptyCell(), c = o.cells[3] || emptyCell(), d = o.cells[4] || emptyCell();
    if (a.text !== r.id || b.text !== r.cat || c.text !== r.org || d.raw !== '1') add(`жараён (2): ${3 + i}-qator manbaga teng emas`);
    const key = c.text + '\u0001' + b.text; recount.set(key, (recount.get(key) || 0) + 1);
    if (i >= firstNew) newBy.set(c.text, (newBy.get(c.text) || 0) + 1);
  });

  const s2 = await loadSheet(wb, wb.sheets[1]);
  const g = new Map<string, Cell>();
  for (const r of s2.rows) for (const c in r.cells) g.set(colName(+c) + r.r, r.cells[c]);
  const txt = (ref: string) => (g.get(ref) || emptyCell()).text;
  const num = (ref: string) => { const c = g.get(ref); return c && c.kind === 'num' ? Number(c.raw) : 0; };
  const cats: string[] = []; for (let c = 2; txt(colName(c) + '4') !== L_TOTAL && c < 200; c++) cats.push(txt(colName(c) + '4'));
  const GT = colName(2 + cats.length), NJ = colName(3 + cats.length);
  const orgs: string[] = []; for (let r = 5; txt('A' + r) !== L_TOTAL && r < 5000; r++) orgs.push(txt('A' + r));
  const R2 = 5 + orgs.length;
  const D = dateLabels(model.date);
  if (txt('A1') !== TITLE) add('Лист2: sarlavha boshqacha');
  if (txt(NJ + '2') !== D.sheet || txt(NJ + '4') !== D.newCol) add('Лист2: sana yorlig\'i boshqacha');
  if (new Set(cats).size !== new Set(rows.map(r => r.cat)).size || new Set(orgs).size !== new Set(rows.map(r => r.org)).size) add('Лист2: toifa yoki bo\'limlar soni mos emas');
  let sum = 0, sumNew = 0;
  orgs.forEach((o, i) => {
    const r = 5 + i; let tot = 0;
    cats.forEach((c, j) => {
      const want = recount.get(o + '\u0001' + c) || 0, got = num(colName(2 + j) + r); cells++; tot += want;
      if (want !== got) add(`Лист2: ${colName(2 + j)}${r} da ${got}, qayta sanaganda ${want}`);
    });
    cells += 2;
    if (num(GT + r) !== tot) add(`Лист2: ${GT}${r} jami noto'g'ri`);
    if (num(NJ + r) !== (newBy.get(o) || 0)) add(`Лист2: ${NJ}${r} yangi kelganlar soni noto'g'ri`);
    sum += tot; sumNew += newBy.get(o) || 0;
  });
  cats.forEach((c, j) => {
    let want = 0; for (const o of orgs) want += recount.get(o + '\u0001' + c) || 0; cells++;
    if (num(colName(2 + j) + R2) !== want) add(`Лист2: ${colName(2 + j)}${R2} ustun jami noto'g'ri`);
  });
  cells += 2;
  if (sum !== n || num(GT + R2) !== n) add(`Лист2: umumiy jami ${num(GT + R2)}, murojaatlar ${n} ta`);
  const fj = g.get(NJ + R2);
  if (!fj || fj.f !== `SUM(${NJ}5:${NJ}${R2 - 1})` || Number(fj.raw) !== model.newCount || sumNew !== model.newCount) add('Лист2: yangi kelganlar jami noto\'g\'ri');

  const pcr = await wb.text('xl/pivotCache/pivotCacheRecords1.xml'), pcd = await wb.text('xl/pivotCache/pivotCacheDefinition1.xml');
  if (!pcr || !pcd) add('Svod keshi yo\'q');
  else {
    const fields = findAll(xmlTree(pcd, 'kesh'), 'cacheField').map(f => findAll(f, 's').map(s => s.attrs.v));
    // yozuvlar: oqimli o'qish, har <r> uchun bolalarining v atributi
    const recs: string[][] = []; let cur: string[] | null = null, depth = 0;
    xmlScan(pcr, 'kesh', {
      open(local, a) { depth++; if (depth === 2 && local === 'r') cur = []; else if (cur && depth === 3) cur.push(a.v); },
      close() { if (depth === 2 && cur) { recs.push(cur); cur = null; } depth--; },
      text() { /* yozuvlarda matn yo'q */ },
    });
    if (recs.length !== n) add(`Svod keshi: ${recs.length} yozuv, ${n} bo'lishi kerak`);
    recs.forEach((ch, i) => {
      const r = rows[i]; cells += 3;
      if (!r || ch[0] !== r.id || fields[1][+ch[1]] !== r.cat || fields[2][+ch[2]] !== r.org) add(`Svod keshi: ${i + 1}-yozuv mos emas`);
    });
  }
  return { ok: errs.length === 0, errors: errs, cells, rows: n, cats: cats.length, orgs: orgs.length };
}
