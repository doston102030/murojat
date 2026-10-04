/* Brauzer bilan aloqa: qoidalarni va oxirgi svodni eslab qolish, faylni saqlash.
   Sahifa Claude ichida ochilsa — uning umumiy xotirasi va saqlash oynasi ham ishlatiladi (ixtiyoriy). */
import type { SvodView } from '../engine/protocol';

const RULES_KEY = 'jarayon.tasnif';     // eski versiya bilan bir xil kalit — saqlangan qoidalar yo'qolmaydi
const LAST_KEY = 'jarayon.oxirgi';

export type RulePair = [string, string];
export interface LastSvod { at: string; sana: string; svod: SvodView }

const isPair = (x: unknown): x is RulePair => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string';
function read<T>(key: string, check: (x: unknown) => x is T): T | null {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const v: unknown = JSON.parse(raw); return check(v) ? v : null; }
  catch { return null; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* xotira yopiq bo'lsa ham sahifa ishlaydi */ }
}

export const loadRules = (): RulePair[] => read(RULES_KEY, (x): x is RulePair[] => Array.isArray(x) && x.every(isPair)) ?? [];
export const saveRules = (rules: RulePair[]) => write(RULES_KEY, rules);

const isLast = (x: unknown): x is LastSvod => {
  const l = x as LastSvod;
  return !!l && typeof l.sana === 'string' && !!l.svod && Array.isArray(l.svod.cats) && Array.isArray(l.svod.orgs) && Array.isArray(l.svod.ustun) && typeof l.svod.jami === 'number';
};
export const loadLast = (): LastSvod | null => read(LAST_KEY, isLast);
export const saveLast = (last: LastSvod) => write(LAST_KEY, last);

/* ---------------------------------------------------------------- Claude muhiti (bo'lmasa — jim) */
interface DocRef { get(): Promise<{ exists: boolean; data(): unknown }>; set(v: unknown): Promise<unknown> }
interface Db { doc(path: string): DocRef; collection(name: string): { get(): Promise<{ docs: Array<{ data(): unknown }> }>; doc(id: string): DocRef } }
interface Downloads { save(o: { filename: string; data: Blob }): Promise<unknown> }
type ClaudeRuntime = { use(name: string): unknown };

const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
const hasClaude = !!(claude && typeof claude.use === 'function');
const use = <T,>(name: string): Promise<T | null> => hasClaude
  ? Promise.resolve().then(() => claude!.use(name) as T).catch(() => null)
  : Promise.resolve(null);
const pDb = use<Db>('db'), pDownloads = use<Downloads>('downloads');

function ruleId(text: string) {
  let x = 0x811c9dc5;
  for (const ch of text) { x ^= ch.codePointAt(0)!; x = Math.imul(x, 0x01000193) >>> 0; }
  return 't' + x.toString(16).padStart(8, '0') + '_' + text.length;
}

/** Umumiy xotiradagi qoidalar va oxirgi svod (Claude ichida bo'lsa). */
export async function loadShared(): Promise<{ rules: RulePair[]; last: LastSvod | null } | null> {
  const db = await pDb;
  if (!db) return null;
  const rules: RulePair[] = [];
  let last: LastSvod | null = null;
  try {
    const snap = await db.collection('tasnif').get();
    for (const d of snap.docs) { const x = d.data() as { tasnif?: unknown; toifa?: unknown }; if (typeof x?.tasnif === 'string' && typeof x?.toifa === 'string') rules.push([x.tasnif, x.toifa]); }
  } catch { /* standart qoidalar bilan ishlaydi */ }
  try { const d = await db.doc('holat/oxirgi').get(); const v = d.exists ? d.data() : null; if (isLast(v)) last = v; } catch { /* ixtiyoriy */ }
  return { rules, last };
}
/** Qoidalarni umumiy xotiraga yozadi. false — yozilmadi. */
export async function pushRules(pairs: RulePair[]): Promise<boolean> {
  const db = await pDb;
  if (!db) return true;
  try {
    for (const [t, c] of pairs) await db.collection('tasnif').doc(ruleId(t)).set({ tasnif: t, toifa: c, at: new Date().toISOString() });
    return true;
  } catch { return false; }
}
export async function pushLast(last: LastSvod) {
  const db = await pDb;
  if (db) db.doc('holat/oxirgi').set(last).catch(() => {});
}

export interface SaveMsg { ok: boolean; text: string }
export async function saveFile(bytes: ArrayBuffer, filename: string, mime: string): Promise<SaveMsg> {
  const blob = new Blob([bytes], { type: mime });
  try {
    const d = await pDownloads;
    if (d) { await d.save({ filename, data: blob }); return { ok: true, text: 'Saqlandi. Excel\'da shu nomli eski fayl ochiq bo\'lsa, avval uni yoping.' }; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return hasClaude
      ? { ok: false, text: 'Yuklab olish boshlandi. Fayl kelmasa, sahifani Claude ichida ochib, qayta bosing.' }
      : { ok: true, text: 'Fayl yuklab olindi.' };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    return { ok: false, text: code === 'declined' ? 'Saqlash bekor qilindi.'
      : code === 'rate_limited' ? 'Saqlash oynasi ochiq turibdi yoki tugma ketma-ket bosildi. Biroz kutib, qayta bosing.'
      : 'Bu ko\'rinishda .xlsx faylni saqlab bo\'lmadi.' };
  }
}
