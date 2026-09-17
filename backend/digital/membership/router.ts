import express, { type Request, type Router } from 'express';
import { asyncRoute, httpError } from '../errors';
import type { DigitalContext } from '../context';
import { createUserRateLimiter } from '../rateLimits';
import { escapeHtml, formatDate, rupiah } from './email';
import type { MembershipService } from './service';
import type { AuthUser, InvoiceRecord, PlanRecord, SubscriptionRecord } from '../types';

/**
 * API keanggotaan untuk anggota (docs/PHASE-3-BRIEF.md Langkah 2, 4, 5, 6):
 *  - GET /api/membership/plans publik (halaman /membership); token opsional untuk status paket pengguna.
 *  - Endpoint lain wajib login + flag fitur digital (DIGITAL_ENABLED atau email beta), sama seperti pembelian satuan:
 *    keanggotaan memberi akses rak digital, jadi ikut tertutup selama fitur digital belum dibuka.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodyOf = (req: Request) => (req.body || {}) as Record<string, unknown>;

const PAYMENT_TYPE_LABEL: Record<string, { id: string; en: string }> = {
  credit_card: { id: 'Kartu kredit/debit', en: 'Credit/debit card' },
  gopay: { id: 'GoPay', en: 'GoPay' },
  bank_transfer: { id: 'Virtual Account', en: 'Virtual Account' },
  echannel: { id: 'Mandiri Bill Payment', en: 'Mandiri Bill Payment' },
  qris: { id: 'QRIS', en: 'QRIS' },
  other_qris: { id: 'QRIS', en: 'QRIS' }
};

/** Bukti pembayaran (HTML statis tanpa skrip; dicetak/disimpan PDF dari browser). Bukan faktur pajak. */
export const receiptHtml = (invoice: InvoiceRecord, sub: SubscriptionRecord, plan: PlanRecord | null, language: string): string => {
  const lang: 'id' | 'en' = language === 'id' ? 'id' : 'en';
  const t = lang === 'id'
    ? {
      title: 'Bukti Pembayaran Keanggotaan', number: 'Nomor tagihan', order: 'ID transaksi Midtrans', paidAt: 'Tanggal bayar',
      member: 'Anggota', plan: 'Paket', cycle: 'Siklus', period: 'Periode', method: 'Metode bayar', amount: 'Jumlah dibayar',
      yearly: 'Tahunan', monthly: 'Bulanan', founding: 'Harga Founding Member (tahun pertama)', offline: 'Pembayaran dicatat admin',
      kind: { initial: 'Pendaftaran', renewal: 'Perpanjangan', upgrade: 'Selisih upgrade (setelah kredit prorata)', manual: 'Perpanjangan (dicatat admin)' },
      note: 'Dokumen ini dibuat otomatis sebagai bukti pembayaran dan bukan faktur pajak. Simpan atau cetak dari menu browser.'
    }
    : {
      title: 'Membership Payment Receipt', number: 'Invoice number', order: 'Midtrans transaction ID', paidAt: 'Paid on',
      member: 'Member', plan: 'Plan', cycle: 'Billing cycle', period: 'Period', method: 'Payment method', amount: 'Amount paid',
      yearly: 'Annual', monthly: 'Monthly', founding: 'Founding Member price (first year)', offline: 'Payment recorded by admin',
      kind: { initial: 'Sign-up', renewal: 'Renewal', upgrade: 'Upgrade difference (after prorated credit)', manual: 'Renewal (recorded by admin)' },
      note: 'This receipt is generated automatically as proof of payment and is not a tax invoice. Save or print it from your browser menu.'
    };
  const planName = plan ? (lang === 'id' ? plan.nameId : plan.nameEn) : '-';
  const method = invoice.paymentType ? PAYMENT_TYPE_LABEL[invoice.paymentType]?.[lang] ?? invoice.paymentType : t.offline;
  const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${value}</td></tr>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="robots" content="noindex">
<title>${escapeHtml(`${t.title} ${invoice.orderRef}`)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1f2937; margin: 0; padding: 32px 16px; background: #f8f6f1; }
  main { max-width: 640px; margin: 0 auto; background: #fff; border: 1px solid #e5e0d5; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .company { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-weight: normal; color: #6b7280; padding: 8px 12px 8px 0; width: 42%; vertical-align: top; }
  td { padding: 8px 0; border-bottom: 1px solid #f1ede4; }
  .total td { font-size: 18px; font-weight: bold; border-bottom: none; }
  .note { margin-top: 24px; font-size: 12px; color: #6b7280; }
  @media print { body { background: #fff; padding: 0; } main { border: none; } }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t.title)}</h1>
  <div class="company">PT Cakrawala Magna Scientia — CakraNexa</div>
  <table>
    ${row(t.number, escapeHtml(invoice.orderRef))}
    ${invoice.midtransOrderId ? row(t.order, escapeHtml(invoice.midtransOrderId)) : ''}
    ${row(t.paidAt, escapeHtml(formatDate(invoice.paidAt, lang)))}
    ${row(t.member, `${escapeHtml(sub.customerName)}<br>${escapeHtml(sub.customerEmail)}`)}
    ${row(t.plan, `${escapeHtml(planName)} — ${escapeHtml(t.kind[invoice.kind])}`)}
    ${row(t.cycle, escapeHtml(invoice.billingCycle === 'yearly' ? t.yearly : t.monthly))}
    ${row(t.period, `${escapeHtml(formatDate(invoice.periodStart, lang))} – ${escapeHtml(formatDate(invoice.periodEnd, lang))}`)}
    ${row(t.method, escapeHtml(method))}
    ${invoice.isFoundingPrice ? row('', escapeHtml(t.founding)) : ''}
    <tr class="total"><th>${escapeHtml(t.amount)}</th><td>${escapeHtml(rupiah(invoice.amount))}</td></tr>
  </table>
  <p class="note">${escapeHtml(t.note)}</p>
</main>
</body>
</html>`;
};

export const createMembershipRouter = (ctx: DigitalContext, service: MembershipService): Router => {
  const router = express.Router();
  const read = createUserRateLimiter(ctx, 'membershipRead');
  const write = createUserRateLimiter(ctx, 'membershipWrite');
  const userOf = (req: Request): AuthUser => req.digitalUser!;

  /** Invoice milik pengguna ini (404 untuk ID asing agar keberadaan tagihan orang lain tidak bocor). */
  const ownInvoice = async (req: Request) => {
    const id = String(req.params.id);
    const invoice = UUID_RE.test(id) ? await ctx.store.getInvoice(id) : null;
    if (!invoice || invoice.userId !== userOf(req).id) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    const sub = await ctx.store.getSubscription(invoice.subscriptionId);
    if (!sub) throw httpError(404, 'invoice_not_found', 'Tagihan tidak ditemukan.');
    return { invoice, sub };
  };

  // Paket publik: harga, sisa kursi Founding, manfaat yang lolos flag. Token opsional -> paket pengguna saat ini.
  router.get('/api/membership/plans', asyncRoute(async (req, res) => {
    const header = String(req.headers.authorization || '');
    let email: string | null = null;
    let current: { planCode: string | null; billingCycle: string; status: string; cancelAtPeriodEnd: boolean } | null = null;
    let foundingEligible = true;
    if (header.startsWith('Bearer ')) {
      try {
        const user = await ctx.verifier.verify(header.slice(7).trim());
        email = user.email;
        const sub = await service.openSubscription(user.id);
        if (sub && sub.status !== 'pending') {
          const plan = await service.planById(sub.planId);
          current = { planCode: plan?.code ?? null, billingCycle: sub.billingCycle, status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd };
        }
        foundingEligible = !(await service.hadPaidSubscription(user.id));
      } catch {
        email = null;
      }
    }
    res.json({
      plans: await service.publicPlans(),
      flags: service.flags(),
      paymentAvailable: ctx.midtrans.enabled,
      purchaseEnabled: ctx.feature.allows(email),
      current,
      foundingEligible
    });
  }));

  router.post('/api/membership/subscribe', ctx.requireUser, write, asyncRoute(async (req, res) => {
    const result = await service.subscribe(userOf(req), bodyOf(req));
    res.status(result.reused ? 200 : 201).json(result);
  }));

  router.get('/api/membership/me', ctx.requireUser, read, asyncRoute(async (req, res) => {
    res.json(await service.me(userOf(req)));
  }));

  // Tab "Rak Digital" Pustaka Saya.
  router.get('/api/membership/shelf', ctx.requireUser, read, asyncRoute(async (req, res) => {
    res.json(await service.shelfView(userOf(req)));
  }));

  // Bayar tagihan terbuka (perpanjangan manual, selisih upgrade, atau pendaftaran yang tertunda). Body: { payment_method? }.
  router.post('/api/membership/invoices/:id/pay', ctx.requireUser, write, asyncRoute(async (req, res) => {
    const { invoice } = await ownInvoice(req);
    res.json({ invoice: await service.payInvoice(userOf(req), invoice.id, bodyOf(req)) });
  }));

  // Periksa status pembayaran ke Midtrans (setelah kembali dari Snap, bila notifikasi belum masuk).
  router.post('/api/membership/invoices/:id/refresh', ctx.requireUser, write, asyncRoute(async (req, res) => {
    const { invoice, sub } = await ownInvoice(req);
    const paid = invoice.status === 'paid' || ((invoice.status === 'issued' || invoice.status === 'failed') && await service.reconcile(invoice, sub));
    res.json({ paid, ...(await service.me(userOf(req))) });
  }));

  router.get('/api/membership/invoices/:id/receipt', ctx.requireUser, read, asyncRoute(async (req, res) => {
    const { invoice, sub } = await ownInvoice(req);
    if (invoice.status !== 'paid') throw httpError(409, 'invoice_unpaid', 'Bukti pembayaran hanya tersedia untuk tagihan yang sudah dibayar.');
    const language = ['id', 'en', 'zh'].includes(String(req.query.lang)) ? String(req.query.lang) : sub.language;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `inline; filename="kuitansi-${invoice.orderRef}.html"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(receiptHtml(invoice, sub, await service.planById(invoice.planId), language));
  }));

  // Ubah paket/siklus. Body: { plan_code, billing_cycle, payment_method? }.
  router.post('/api/membership/change', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.json(await service.changePlan(userOf(req), bodyOf(req)));
  }));

  router.post('/api/membership/change/cancel', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.json({ subscription: await service.cancelChange(userOf(req)) });
  }));

  // Pembatalan satu klik (konfirmasi di frontend dikirim sebagai confirm:true).
  router.post('/api/membership/cancel', ctx.requireUser, write, asyncRoute(async (req, res) => {
    if (bodyOf(req).confirm !== true) throw httpError(400, 'confirm_required', 'Konfirmasi pembatalan diperlukan.');
    res.json({ subscription: await service.cancel(userOf(req)) });
  }));

  router.post('/api/membership/resume', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.json({ subscription: await service.resume(userOf(req)) });
  }));

  router.post('/api/membership/payment-method', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.json({ subscription: await service.changePaymentMethod(userOf(req), bodyOf(req)) });
  }));

  // Pengingat WhatsApp. Body: { opt_in: boolean, whatsapp_number? }.
  router.post('/api/membership/whatsapp', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.json({ subscription: await service.updateWhatsApp(userOf(req), bodyOf(req)) });
  }));

  // Digital Member Pick (Reader Circle).
  router.get('/api/membership/picks', ctx.requireUser, read, asyncRoute(async (req, res) => {
    res.json(await service.pickOptions(userOf(req)));
  }));

  router.post('/api/membership/picks', ctx.requireUser, write, asyncRoute(async (req, res) => {
    res.status(201).json({ pick: await service.pick(userOf(req), bodyOf(req).product_id) });
  }));

  return router;
};
