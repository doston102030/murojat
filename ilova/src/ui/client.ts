/* Dvigatel mijozi: Web Worker'ni ishga tushiradi. Worker ochilmasa (eski yoki qulflangan brauzer) —
   o'sha kod asosiy oqimda ishlaydi: sekinroq, lekin sahifa baribir ishlaydi. */
import EngineWorker from '../engine/worker?worker&inline';
import type { Reply, Request } from '../engine/protocol';

export type ClientEvent = Reply | { t: 'crash'; message: string };
type Listener = (e: ClientEvent) => void;
type LocalHost = { handle(q: Request): unknown };

const START_TIMEOUT = 5000;

export class EngineClient {
  private listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private local: LocalHost | null = null;
  private queue: Array<[Request, Transferable[]]> = [];
  private started = false;
  mode: 'starting' | 'worker' | 'local' = 'starting';

  constructor() {
    let timer = 0;
    try {
      const w = new EngineWorker({ name: 'jarayon-dvigatel' });
      this.worker = w;
      timer = window.setTimeout(() => this.fallback(), START_TIMEOUT);
      w.onmessage = (e: MessageEvent<Reply>) => {
        if (e.data.t === 'ready') { window.clearTimeout(timer); this.start('worker'); return; }
        this.emit(e.data);
      };
      w.onerror = ev => {
        ev.preventDefault();
        if (!this.started) { window.clearTimeout(timer); this.fallback(); }
        else this.emit({ t: 'crash', message: ev.message || 'Dvigatel kutilmaganda to\'xtadi' });
      };
    } catch {
      this.fallback();
    }
  }

  private start(mode: 'worker' | 'local') {
    this.mode = mode; this.started = true;
    document.documentElement.dataset.engine = mode;          // tashxis uchun: <html data-engine="worker">
    if (mode === 'local') console.warn('Web Worker ochilmadi — dvigatel asosiy oqimda ishlayapti (sekinroq).');
    const q = this.queue; this.queue = [];
    for (const [req, tr] of q) this.send(req, tr);
  }

  private async fallback() {
    if (this.started || this.local) return;
    this.worker?.terminate(); this.worker = null;
    try {
      const { createHost } = await import('../engine/host');
      // javoblar asinxron yetkaziladi — xuddi Worker'dagidek
      this.local = createHost(msg => { window.setTimeout(() => this.emit(msg), 0); });
      this.start('local');
    } catch (e) {
      this.emit({ t: 'crash', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private emit(e: ClientEvent) { for (const l of this.listeners) l(e); }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  send(q: Request, transfer: Transferable[] = []) {
    if (!this.started) { this.queue.push([q, transfer]); return; }
    if (this.worker) this.worker.postMessage(q, transfer);
    else if (this.local) void this.local.handle(q);
  }
}
