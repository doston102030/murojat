/* Web Worker kirish nuqtasi: og'ir ish (o'qish, yig'ish, tekshirish) shu yerda — sahifa hech qachon qotmaydi. */
import { createHost } from './host';
import type { Reply, Request } from './protocol';

const ctx = self as unknown as {
  postMessage(msg: Reply, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent<Request>) => void) | null;
};
const host = createHost((msg, transfer) => ctx.postMessage(msg, transfer || []));
ctx.onmessage = e => { void host.handle(e.data); };
ctx.postMessage({ t: 'ready' });
