# murojat

**Jarayondagi murojaatlar svodi.** Prezident virtual qabulxonasi portalidan olingan ro'yxatdan (.xlsx)
jarayondagi murojaatlar svodini hisoblaydi va shablondagi Excel faylni tayyorlaydi: «жараён», «Лист2» (svod)
va «жараён (2)» varaqlari, filtr va havolalari bilan.

Sayt: **https://jarayon-svodi.vercel.app**

## Ishlatish

- Saytni oching yoki [`jarayon-svodi.html`](jarayon-svodi.html) faylini yuklab olib, ikki marta bosing.
- Portal ro'yxatini (Excel) sahifaga tashlang, so'ng «Excel faylni saqlash» tugmasini bosing.

Fayllar brauzerning o'zida ishlanadi, hech qayerga yuborilmaydi. Server ham, internet ham shart emas:
`jarayon-svodi.html` bitta fayl, ichida hamma narsa bor.

## Tuzilishi

| Papka / fayl | Nima |
| --- | --- |
| `jarayon-svodi.html` | Tayyor sahifa (yig'ilgan, bitta fayl) |
| `ilova/src/engine/` | Dvigatel: Excel o'qish, tasnif, yangi kelganlar, svod, Excel yig'ish va tekshirish (Web Worker) |
| `ilova/src/ui/` | Interfeys (React), ovozlar |
| `ilova/tests/` | Avtomatik testlar: dvigatel va haqiqiy brauzerda to'liq oqim |
| `OQING.txt` | Batafsil qo'llanma |

## Kodni o'zgartirish

Node.js 22+ kerak.

```
cd ilova
npm install
npm run build      # jarayon-svodi.html ni yangilaydi
npm run check      # yig'ish + barcha testlar
npm run deploy     # saytga joylash (Vercel)
```

Tasnif qoidalari (portal tasnifi qaysi svod toifasiga tushishi) `ilova/src/engine/core.ts` dagi
`BASE_RULES` ro'yxatida. Sahifaning o'zida ham o'zgartirish mumkin.
