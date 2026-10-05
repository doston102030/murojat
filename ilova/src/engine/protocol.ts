/* Interfeys <-> dvigatel (Web Worker) o'rtasidagi xabarlar.
   Og'ir ma'lumot (qatorlar, kataklar) Worker'da qoladi; interfeysga faqat ko'rsatish uchun ixcham ko'rinishlar keladi. */
import type { Detect, Unknown, DateLabels, FullReport } from './core';
import type { VerifyResult } from './xlsx';

export type Which = 'exp' | 'prev';

export interface ErrInfo { name: string; message: string; items: string[] }

/** Murojaatlar jadvalidagi bitta qator — faqat ko'rsatish uchun */
export interface DisplayRow {
  r: number; id: string; linkA: string | null; person: string; district: string; org: string;
  deadline: string; sent: string; upd: string;
}

export interface TableInfo {
  name: string; sheetName: string; headerRow: number; firstRow: number; lastRow: number; rowCount: number;
  problems: string[]; problemCount: number; reportDate: string | null;
  /** «№» (N) ustunidagi eng so'nggi sana (Excel raqami); to'liq hisobotda — hisobot qaysi paytgacha */
  lastUpd: number | null;
  /** portalning to'liq hisobotidan olingan bo'lsa: hisobotdagi jami murojaatlar */
  full: FullReport | null;
}
export interface ExpInfo extends TableInfo { det: Detect; rows: DisplayRow[] }

export interface SvodView {
  cats: string[];
  orgs: Array<{ nom: string; s: number[]; jami: number; yangi: number }>;
  ustun: number[]; jami: number; yangi: number;
}
export interface BriefRow { id: string; person: string; org: string; cat: string | null }
export interface Capped<T> { count: number; list: T[] }
export interface CmpView {
  prevTotal: number; total: number; prevNew: number;
  removed: Capped<BriefRow>; added: Capped<BriefRow>;
  changed: Capped<{ id: string; person: string; diffs: Array<{ header: string; from: string; to: string }> }>;
  orgDelta: Array<{ org: string; from: number; to: number }>;
}
export interface DupView { id: string; task: string; firstR: number; againR: number }

export interface Analysis {
  seq: number;
  unknown: Unknown[];
  dups: Capped<DupView>;
  kinds: number;                 // nechta xil tasnif
  preview: SvodView | null;      // toifasi yo'q tasnif bo'lsa — null
  catNames: string[];
  rowCat: Int32Array;            // har qator uchun catNames indeksi, -1 — toifa yo'q
  cmp: CmpView | null;
  willBuild: boolean;            // hammasi joyida — fayl yig'ilmoqda
}
export interface Built {
  bytes: ArrayBuffer; filename: string; labels: DateLabels; svod: SvodView; verify: VerifyResult;
}

export type Request =
  | { t: 'load'; which: Which; id: number; name: string; bytes: ArrayBuffer }
  | { t: 'clear'; which: Which; id: number }
  | { t: 'dedupe'; id: number }
  | { t: 'compute'; seq: number; expId: number; prevId: number | null; rules: Array<[string, string]>; newCount: number; confirmed: boolean; date: string };

export type Reply =
  | { t: 'ready' }
  | { t: 'loaded'; which: 'exp'; id: number; info: ExpInfo }
  | { t: 'loaded'; which: 'prev'; id: number; info: TableInfo }
  | { t: 'loadError'; which: Which; id: number; error: ErrInfo }
  | { t: 'deduped'; id: number; info: ExpInfo }
  | { t: 'analysis'; seq: number; analysis: Analysis }
  | { t: 'built'; seq: number; result: Built }
  | { t: 'buildError'; seq: number; error: ErrInfo };

export function toErrInfo(e: unknown): ErrInfo {
  if (e && typeof e === 'object' && (e as Error).name === 'EngineError')
    return { name: 'EngineError', message: (e as Error).message, items: ((e as { items?: string[] }).items || []).slice(0, 50) };
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
  return { name: (e as Error)?.name || 'Error', message: msg, items: [] };
}
