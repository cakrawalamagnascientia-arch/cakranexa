import crypto from 'crypto';
import { ConflictError, httpError } from '../errors';
import { AssetNotFoundError } from '../storage';
import { isProductOnShelf } from '../entitlements';
import { addDays, addMonths, DAY_MS, jakartaDate } from '../time';
import { mapMidtransToOrderStatus, verifyMidtransSignature, type MidtransClient } from '../checkout';
import type { DigitalContext, InstitutionAccessHooks } from '../context';
import type { NewSession } from '../store';
import type { EntitlementRecord, ProductRecord, SessionRecord } from '../types';
import { mergeConfig, quoteContract, QuoteError, type ContractQuote } from './pricing';
import { renderInvoicePdf, type InvoiceDocumentInput } from './pdf';
import { institutionEmail, renewalAdminEmail, type InstitutionEmailData, type InstitutionEmailKind } from './email';
import type { InstitutionStore } from './store';
import {
  OPEN_CONTRACT_STATUSES,
  OPEN_INVOICE_STATUSES,
  RUNNING_CONTRACT_STATUSES,
  type CollectionScope,
  type CompanyBankAccount,
  type CompanyProfile,
  type ContractRecord,
  type InquiryRef,
  type InstitutionConfig,
  type InstitutionInvoiceRecord,
  type InstitutionPaymentMethod,
  type InstitutionRecord,
  type InstitutionStatus,
  type InstitutionTierCode,
  type TierRecord
} from './types';

/**
 * Alur kontrak institusi (docs/PHASE-4-BRIEF Langkah 2 + koreksi review): kontrak & harga terkunci, invoice PDF bernomor,
 * pelunasan manual (dengan bukti) atau Midtrans (VA sekali bayar, order_id INST-), aktivasi + entitlement anggota,
 * perpanjangan otomatis (pemberitahuan institusi H-60, admin H-45, invoice terbit H-30, void +30 hari bila tidak
 * dibayar), masa tenggang, berakhir, dan trial 30 hari.
 *
 * Founding: 30 institusi PERTAMA yang membayar kontrak Founding (kumulatif, kursi tidak dibuka lagi walau institusi
 * berakhir). Kursi direservasi saat invoice Founding terbit dan dilepas bila invoice dibatalkan atau belum dibayar
 * sampai jatuh tempo.
 *
 * Hak akses anggota: SATU entitlement per anggota aktif per kontrak (source 'institution', scope 'shelf',
 * source_ref = id kontrak, berlaku period_start .. period_end + grace_days, max_devices 2). Dibuat saat kontrak lunas
 * dan aktif; anggota yang bergabung kemudian mendapatkannya lewat grantMemberAccess. Semua langkah idempoten
 * (update bersyarat, insert ON CONFLICT DO NOTHING, event ber-dedupe_key).
 */

export const INSTITUTION_ORDER_PREFIX = 'INST-';
const ORDER_ID_RE = /^INST-(INV-INST-\d{4}-\d{4,})-(\d+)$/;

/** Notifikasi Midtrans untuk invoice institusi (order_id "INST-<nomor invoice>-<percobaan>"). */
export const isInstitutionNotification = (n: Record<string, any>): boolean =>
  typeof n?.order_id === 'string' && n.order_id.startsWith(INSTITUTION_ORDER_PREFIX);

/** Batas perangkat anggota institusi (brief Langkah 3: 2, seperti Professional). */
export const INSTITUTION_MAX_DEVICES = 2;
/** Masa berlaku tautan unduh invoice di email. */
const INVOICE_LINK_DAYS = 180;
/** Invoice institusi dibayar lewat Virtual Account (transfer bank), bukan kartu/e-wallet. */
const MIDTRANS_VA_PAYMENTS = ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va', 'echannel'];
export const RENEWAL_CREATOR = 'system:renewal';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: 'PT Cakrawala Magna Scientia',
  address: '',
  phone: '',
  email: 'info@cakranexa.com',
  npwp: ''
};

export interface InstitutionDeps {
  store: InstitutionStore;
  midtransClient: MidtransClient;
  listBankAccounts: () => Promise<CompanyBankAccount[]>;
  getCompanyProfile: () => Promise<CompanyProfile>;
  getInquiry: (id: string) => Promise<InquiryRef | null>;
  /** Penerima email internal institusi (pemberitahuan perpanjangan H-45). */
  adminEmails: string[];
}

export interface FoundingStatus {
  cap: number;
  /** paid + reserved. */
  used: number;
  remaining: number;
  /** Institusi yang sudah membayar kontrak Founding (kumulatif). */
  paid: number;
  /** Institusi dengan invoice Founding terbit yang belum jatuh tempo. */
  reserved: number;
}

export type FoundingIneligibleReason = 'not_first_year' | 'founding_full' | 'suspended';

export interface FoundingEligibility extends FoundingStatus {
  eligible: boolean;
  reason: FoundingIneligibleReason | null;
}

export const FOUNDING_REASON_TEXT: Record<FoundingIneligibleReason, string> = {
  not_first_year: 'Diskon Founding hanya untuk tahun pertama institusi.',
  founding_full: 'Kuota Founding sudah penuh.',
  suspended: 'Institusi sedang ditangguhkan.'
};

export interface ContractInput {
  tier: InstitutionTierCode;
  founding: boolean;
  /** ISO; null = hari ini 00:00 WIB, atau akhir kontrak berbayar yang sedang berjalan (perpanjangan). */
  periodStart: string | null;
  overrides?: { concurrentUsers?: number; adminSeats?: number; fullPrice?: number; catalogScalePct?: number };
  collectionScope: CollectionScope;
  productIds: string[];
  notes: string | null;
}

export interface PreparedContract {
  quote: ContractQuote;
  founding: FoundingEligibility;
  periodStart: string;
  periodEnd: string;
  previous: ContractRecord | null;
  config: InstitutionConfig;
  warnings: string[];
}

export type PaymentResult = 'success' | 'duplicate' | 'invalid';

/** Ringkasan perpanjangan sebuah kontrak berjalan (tabel admin). */
export type RenewalSummary =
  | { state: 'declined' }
  | { state: 'draft' | 'issued' | 'paid' | 'active' | 'grace' | 'expired'; contractId: string; automatic: boolean }
  | null;

export class InstitutionService {
  readonly store: InstitutionStore;

  constructor(readonly ctx: DigitalContext, readonly deps: InstitutionDeps) {
    this.store = deps.store;
  }

  private iso(): string {
    return this.ctx.now().toISOString();
  }

  private nowMs(): number {
    return this.ctx.now().getTime();
  }

  // ---- Konfigurasi, tier, katalog
  async configState() {
    return mergeConfig(await this.store.loadConfig());
  }

  async config(): Promise<InstitutionConfig> {
    return (await this.configState()).config;
  }

  async tiers(): Promise<TierRecord[]> {
    return (await this.store.listTiers()).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async tier(code: string): Promise<TierRecord | null> {
    return (await this.tiers()).find((t) => t.tier === code) ?? null;
  }

  /** Digital Reading Shelf hari ini (WIB). Satu judul = satu buku, walau tersedia sebagai e-book dan audiobook. */
  async shelfCatalog(): Promise<{ products: ProductRecord[]; titles: number }> {
    const today = jakartaDate(this.ctx.now());
    const products = (await this.ctx.store.listProductsWithShelfDate()).filter((p) => isProductOnShelf(p, today));
    return { products, titles: new Set(products.map((p) => p.bookId)).size };
  }

  /** 00:00 WIB hari ini. */
  todayStart(): string {
    return new Date(Date.parse(`${jakartaDate(this.ctx.now())}T00:00:00+07:00`)).toISOString();
  }

  accessEndsAt(contract: Pick<ContractRecord, 'periodEnd' | 'graceDays'>): string {
    return addDays(contract.periodEnd, contract.graceDays);
  }

  event(institutionId: string, contractId: string | null, type: string, meta: Record<string, unknown> = {}, dedupeKey: string | null = null): Promise<boolean> {
    return this.store.insertEvent({ institutionId, contractId, type, meta, dedupeKey });
  }

  private async hasEvent(contractId: string, dedupeKey: string): Promise<boolean> {
    return (await this.store.listEvents({ contractId, limit: 500 })).some((e) => e.dedupeKey === dedupeKey);
  }

  async requireInstitution(id: string): Promise<InstitutionRecord> {
    const institution = await this.store.getInstitution(id);
    if (!institution) throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    return institution;
  }

  async requireContract(id: string): Promise<ContractRecord> {
    const contract = await this.store.getContract(id);
    if (!contract) throw httpError(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    return contract;
  }

  /** Trial selalu dianggap lunas; kontrak lain lunas bila ada invoice berstatus paid. */
  async isPaid(contract: ContractRecord): Promise<boolean> {
    if (contract.isTrial) return true;
    return (await this.store.listInvoices({ contractId: contract.id, statuses: ['paid'] })).length > 0;
  }

  // ---- Founding
  /** Kursi Founding: institusi yang sudah membayar (kumulatif) dan reservasi invoice Founding yang belum jatuh tempo. */
  private async foundingSeats(): Promise<{ paid: Set<string>; reserved: Set<string> }> {
    const now = this.nowMs();
    const paid = new Set<string>();
    const reserved = new Set<string>();
    const founding = (await this.store.listContracts({})).filter((c) => c.foundingDiscountPct > 0 && !c.isTrial);
    if (founding.length === 0) return { paid, reserved };
    const ids = new Set(founding.map((c) => c.id));
    const invoices = (await this.store.listInvoices({})).filter((i) => ids.has(i.contractId));
    for (const c of founding) {
      const own = invoices.filter((i) => i.contractId === c.id);
      if (own.some((i) => i.status === 'paid')) paid.add(c.institutionId);
      else if (c.status === 'issued' && own.some((i) => i.status === 'issued' && i.dueAt !== null && Date.parse(i.dueAt) > now)) reserved.add(c.institutionId);
    }
    for (const id of paid) reserved.delete(id);
    return { paid, reserved };
  }

  async foundingStatus(): Promise<FoundingStatus> {
    const cap = (await this.config()).foundingCap;
    const { paid, reserved } = await this.foundingSeats();
    const used = paid.size + reserved.size;
    return { cap, used, remaining: Math.max(0, cap - used), paid: paid.size, reserved: reserved.size };
  }

  async foundingEligibility(institution: InstitutionRecord): Promise<FoundingEligibility> {
    const status = await this.foundingStatus();
    if (institution.status === 'suspended') return { ...status, eligible: false, reason: 'suspended' };
    const contracts = await this.store.listContracts({ institutionId: institution.id });
    if (contracts.some((c) => !c.isTrial && ['active', 'grace', 'expired'].includes(c.status))) {
      return { ...status, eligible: false, reason: 'not_first_year' };
    }
    if (await this.foundingFullFor(institution.id)) return { ...status, eligible: false, reason: 'founding_full' };
    return { ...status, eligible: true, reason: null };
  }

  /** Kuota penuh untuk institusi ini (kursi yang dipegang institusi ini sendiri tidak dihitung). */
  private async foundingFullFor(institutionId: string): Promise<boolean> {
    const cap = (await this.config()).foundingCap;
    const { paid, reserved } = await this.foundingSeats();
    const holders = new Set([...paid, ...reserved]);
    holders.delete(institutionId);
    return holders.size >= cap;
  }

  // ---- Kontrak
  async prepareContract(institution: InstitutionRecord, input: ContractInput): Promise<PreparedContract> {
    if (institution.status === 'suspended') throw httpError(409, 'institution_suspended', 'Institusi sedang ditangguhkan.');
    const tier = await this.tier(input.tier);
    if (!tier) throw httpError(400, 'invalid_tier', 'Tier tidak dikenal.');
    const config = await this.config();
    const { titles } = await this.shelfCatalog();
    const founding = await this.foundingEligibility(institution);
    if (input.founding && !founding.eligible) {
      throw httpError(409, 'founding_unavailable', FOUNDING_REASON_TEXT[founding.reason ?? 'founding_full'], { founding });
    }
    let quote: ContractQuote;
    try {
      quote = quoteContract({ tier, titleCount: titles, founding: input.founding, config, overrides: input.overrides });
    } catch (err) {
      if (err instanceof QuoteError) throw httpError(400, err.code, err.message);
      throw err;
    }
    if (quote.contractedPrice <= 0) throw httpError(400, 'invalid_price', 'Harga kontrak harus lebih dari 0. Gunakan trial untuk akses gratis.');
    const running = (await this.store.listContracts({ institutionId: institution.id, statuses: RUNNING_CONTRACT_STATUSES }))[0] ?? null;
    const periodStart = input.periodStart ?? (running && !running.isTrial ? running.periodEnd : this.todayStart());
    const periodEnd = addMonths(periodStart, 12);
    const warnings: string[] = [];
    if (running && Date.parse(periodStart) < Date.parse(running.periodEnd)) {
      warnings.push(running.isTrial
        ? 'Trial yang sedang berjalan diakhiri saat kontrak ini aktif.'
        : 'Periode baru dimulai sebelum kontrak berjalan berakhir; saat dibayar, kontrak berjalan diakhiri lebih awal.');
    }
    if (input.founding) warnings.push('Kursi Founding baru direservasi saat invoice terbit, dan dilepas bila invoice tidak dibayar sampai jatuh tempo.');
    return { quote, founding, periodStart, periodEnd, previous: running, config, warnings };
  }

  private async validCollection(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids.map(String))];
    if (unique.length === 0) throw httpError(400, 'collection_empty', 'Pilih minimal satu judul untuk koleksi custom.');
    const invalid: string[] = [];
    for (const id of unique) {
      const product = await this.ctx.store.getProduct(id);
      if (!product || !product.isActive) invalid.push(id);
    }
    if (invalid.length > 0) throw httpError(400, 'collection_invalid', 'Sebagian judul tidak ditemukan atau tidak aktif.', { productIds: invalid });
    return unique;
  }

  async createContract(institution: InstitutionRecord, input: ContractInput, createdBy: string): Promise<{ contract: ContractRecord; prepared: PreparedContract }> {
    const prepared = await this.prepareContract(institution, input);
    const productIds = input.collectionScope === 'custom' ? await this.validCollection(input.productIds) : [];
    if ((await this.store.listContracts({ institutionId: institution.id, statuses: OPEN_CONTRACT_STATUSES })).length > 0) {
      throw httpError(409, 'contract_open', 'Masih ada kontrak draf atau terbit untuk institusi ini. Terbitkan atau batalkan dulu.');
    }
    const q = prepared.quote;
    let contract: ContractRecord;
    try {
      contract = await this.store.createContract({
        institutionId: institution.id,
        tier: q.tier,
        isTrial: false,
        concurrentUsers: q.concurrentUsers,
        adminSeats: q.adminSeats,
        fullPrice: q.fullPrice,
        catalogScalePct: q.catalogScalePct,
        catalogTitleCountAtSigning: q.catalogTitleCount,
        foundingDiscountPct: q.foundingDiscountPct,
        contractedPrice: q.contractedPrice,
        ebaPct: q.ebaPct,
        ebaCredit: q.ebaCredit,
        periodStart: prepared.periodStart,
        periodEnd: prepared.periodEnd,
        graceDays: prepared.config.graceDays,
        status: 'draft',
        collectionScope: input.collectionScope,
        previousContractId: prepared.previous && !prepared.previous.isTrial ? prepared.previous.id : null,
        notes: input.notes,
        signedAt: null,
        createdBy
      });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'contract_open', 'Masih ada kontrak draf atau terbit untuk institusi ini. Terbitkan atau batalkan dulu.');
      throw err;
    }
    if (productIds.length > 0) await this.store.addContractCollection(contract.id, productIds);
    await this.event(institution.id, contract.id, 'contract_created', {
      tier: q.tier, price: q.contractedPrice, foundingPct: q.foundingDiscountPct, titles: q.catalogTitleCount, scalePct: q.catalogScalePct, by: createdBy
    });
    return { contract, prepared };
  }

  /** Trial gratis 30 hari (Starter, tanpa EBA), maksimal sekali per institusi; langsung aktif. */
  async createTrial(institution: InstitutionRecord, notes: string | null, createdBy: string): Promise<ContractRecord> {
    if (institution.status === 'suspended') throw httpError(409, 'institution_suspended', 'Institusi sedang ditangguhkan.');
    const contracts = await this.store.listContracts({ institutionId: institution.id });
    if (contracts.some((c) => c.isTrial)) throw httpError(409, 'trial_used', 'Trial gratis sudah pernah dipakai institusi ini.');
    if (contracts.some((c) => RUNNING_CONTRACT_STATUSES.includes(c.status))) throw httpError(409, 'contract_running', 'Institusi sudah memiliki kontrak berjalan.');
    const tier = await this.tier('starter');
    if (!tier) throw httpError(500, 'tier_missing', 'Tier Starter tidak ditemukan.');
    const config = await this.config();
    const { titles } = await this.shelfCatalog();
    const quote = quoteContract({ tier, titleCount: titles, founding: false, config, isTrial: true });
    const start = this.iso();
    let contract: ContractRecord;
    try {
      contract = await this.store.createContract({
        institutionId: institution.id,
        tier: 'starter',
        isTrial: true,
        concurrentUsers: quote.concurrentUsers,
        adminSeats: quote.adminSeats,
        fullPrice: quote.fullPrice,
        catalogScalePct: quote.catalogScalePct,
        catalogTitleCountAtSigning: quote.catalogTitleCount,
        foundingDiscountPct: 0,
        contractedPrice: 0,
        ebaPct: 0,
        ebaCredit: 0,
        periodStart: start,
        periodEnd: addDays(start, config.trialDays),
        graceDays: 0,
        status: 'active',
        collectionScope: 'full',
        previousContractId: null,
        notes,
        signedAt: start,
        createdBy
      });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'trial_used', 'Trial tidak bisa dibuat (sudah pernah dipakai atau ada kontrak berjalan).');
      throw err;
    }
    await this.grantContractAccess(contract);
    await this.syncInstitutionStatus(institution.id);
    await this.event(institution.id, contract.id, 'trial_started', { days: config.trialDays, by: createdBy });
    this.notify(institution, 'trialStarted', { periodEnd: contract.periodEnd, concurrentUsers: contract.concurrentUsers, tierName: tier.name });
    return contract;
  }

  async cancelContract(contract: ContractRecord, reason: string | null, by: string): Promise<ContractRecord> {
    if (!OPEN_CONTRACT_STATUSES.includes(contract.status)) throw httpError(409, 'contract_not_open', 'Hanya kontrak draf atau terbit yang bisa dibatalkan.');
    if (await this.isPaid(contract)) throw httpError(409, 'contract_paid', 'Kontrak sudah dibayar. Pengembalian dana dan pengakhiran kontrak ditangani manual.');
    for (const invoice of await this.store.listInvoices({ contractId: contract.id, statuses: OPEN_INVOICE_STATUSES })) {
      await this.store.updateInvoice(invoice.id, { status: 'void', notes: reason ? `Kontrak dibatalkan: ${reason}` : 'Kontrak dibatalkan' }, OPEN_INVOICE_STATUSES);
    }
    const updated = await this.store.updateContract(contract.id, { status: 'canceled' }, OPEN_CONTRACT_STATUSES);
    if (!updated) throw httpError(409, 'state_changed', 'Status kontrak berubah. Muat ulang halaman.');
    await this.event(contract.institutionId, contract.id, 'contract_canceled', { reason, by });
    await this.syncInstitutionStatus(contract.institutionId);
    return updated;
  }

  // ---- Invoice
  async issueInvoice(contract: ContractRecord, options: { sendEmail: boolean; createdBy: string }): Promise<InstitutionInvoiceRecord> {
    if (contract.status !== 'draft') throw httpError(409, 'contract_not_draft', 'Hanya kontrak draf yang bisa diterbitkan invoicenya.');
    if (contract.isTrial || contract.contractedPrice <= 0) throw httpError(400, 'nothing_to_invoice', 'Kontrak trial tidak ditagih.');
    const institution = await this.requireInstitution(contract.institutionId);
    if (institution.status === 'suspended') throw httpError(409, 'institution_suspended', 'Institusi sedang ditangguhkan.');
    // Kursi Founding direservasi saat invoice terbit: kuota diperiksa ulang karena bisa penuh sejak draf dibuat.
    if (contract.foundingDiscountPct > 0 && await this.foundingFullFor(contract.institutionId)) {
      throw httpError(409, 'founding_full', 'Kuota Founding sudah penuh sejak draf dibuat. Batalkan draf ini dan buat ulang tanpa Founding.');
    }
    const banks = await this.deps.listBankAccounts();
    if (banks.length === 0) {
      throw httpError(409, 'bank_accounts_missing', 'Belum ada rekening bank aktif di CMS (tab Pembayaran). Isi dan simpan dulu sebelum menerbitkan invoice.');
    }
    const config = await this.config();
    const now = this.ctx.now();
    const nowIso = now.toISOString();
    const number = await this.store.nextInvoiceNumber(Number(jakartaDate(now).slice(0, 4)));
    const taxAmount = Math.round((contract.contractedPrice * config.ppnPct) / 100);
    const invoice = await this.store.createInvoice({
      contractId: contract.id,
      institutionId: contract.institutionId,
      number,
      amount: contract.contractedPrice,
      taxPct: config.ppnPct,
      taxAmount,
      total: contract.contractedPrice + taxAmount,
      issuedAt: nowIso,
      dueAt: addDays(nowIso, config.invoiceDueDays),
      status: 'issued',
      paymentMethod: null,
      paidAt: null,
      paymentReference: null,
      proofPath: null,
      pdfPath: null,
      midtransOrderId: null,
      snapRedirectUrl: null,
      notes: null,
      createdBy: options.createdBy
    });
    const issued = await this.store.updateContract(contract.id, { status: 'issued' }, ['draft']);
    if (!issued) {
      await this.store.updateInvoice(invoice.id, { status: 'void', notes: 'Kontrak berubah saat invoice diterbitkan' }, ['issued']);
      throw httpError(409, 'state_changed', 'Status kontrak berubah. Muat ulang halaman.');
    }
    let stored = invoice;
    try {
      stored = await this.storePdf(invoice, issued, institution, banks);
    } catch (err: any) {
      // Invoice tetap sah; PDF dibuat ulang saat diunduh.
      console.warn(`[institution] PDF invoice ${number} gagal dibuat:`, err?.message || err);
    }
    await this.event(institution.id, contract.id, 'invoice_issued', { invoiceId: invoice.id, number, total: invoice.total, by: options.createdBy });
    if (options.sendEmail) this.sendInvoiceEmail(stored, 'invoiceIssued');
    return stored;
  }

  async voidInvoice(invoice: InstitutionInvoiceRecord, reason: string | null, by: string): Promise<InstitutionInvoiceRecord> {
    const updated = await this.store.updateInvoice(invoice.id, { status: 'void', notes: reason }, OPEN_INVOICE_STATUSES);
    if (!updated) throw httpError(409, 'invoice_not_open', 'Hanya invoice yang belum dibayar yang bisa dibatalkan.');
    const contract = await this.store.getContract(invoice.contractId);
    // Kontrak kembali ke draf: admin bisa menerbitkan invoice baru (nomor baru) atau membatalkan kontrak.
    if (contract?.status === 'issued' && !(await this.isPaid(contract))) await this.store.updateContract(contract.id, { status: 'draft' }, ['issued']);
    await this.event(invoice.institutionId, invoice.contractId, 'invoice_void', { number: invoice.number, reason, by });
    return updated;
  }

  private async documentInput(invoice: InstitutionInvoiceRecord, contract?: ContractRecord, institution?: InstitutionRecord, banks?: CompanyBankAccount[]): Promise<InvoiceDocumentInput> {
    const c = contract ?? await this.requireContract(invoice.contractId);
    const inst = institution ?? await this.requireInstitution(invoice.institutionId);
    const tier = await this.tier(c.tier);
    return {
      language: inst.language,
      company: await this.deps.getCompanyProfile(),
      bankAccounts: banks ?? await this.deps.listBankAccounts(),
      institution: inst,
      invoice,
      contract: c,
      tierName: tier?.name ?? c.tier,
      paymentUrl: invoice.snapRedirectUrl
    };
  }

  pdfPathFor(invoice: Pick<InstitutionInvoiceRecord, 'institutionId' | 'number'>): string {
    return `institutions/${invoice.institutionId}/invoices/${invoice.number}.pdf`;
  }

  /** Render PDF dan simpan di bucket privat (menimpa versi sebelumnya untuk invoice yang sama). */
  async storePdf(invoice: InstitutionInvoiceRecord, contract?: ContractRecord, institution?: InstitutionRecord, banks?: CompanyBankAccount[]): Promise<InstitutionInvoiceRecord> {
    const buffer = await renderInvoicePdf(await this.documentInput(invoice, contract, institution, banks));
    const objectPath = this.pdfPathFor(invoice);
    await this.ctx.storage.upload(objectPath, buffer, 'application/pdf');
    return (await this.store.updateInvoice(invoice.id, { pdfPath: objectPath })) ?? { ...invoice, pdfPath: objectPath };
  }

  async invoicePdf(invoice: InstitutionInvoiceRecord): Promise<Buffer> {
    if (invoice.pdfPath) {
      try {
        return await this.ctx.storage.download(invoice.pdfPath);
      } catch (err) {
        if (!(err instanceof AssetNotFoundError)) throw err;
      }
    }
    const stored = await this.storePdf(invoice);
    return this.ctx.storage.download(stored.pdfPath!);
  }

  // Tautan unduh bertanda tangan HMAC (tanpa login) untuk email: terikat ke id invoice, berlaku 180 hari.
  private sign(data: string): string {
    return crypto.createHmac('sha256', this.ctx.config.accessTokenSecret).update(data).digest('base64url');
  }

  invoiceToken(invoiceId: string): string {
    const exp = Math.floor((this.nowMs() + INVOICE_LINK_DAYS * DAY_MS) / 1000);
    return `${exp}.${this.sign(`institution-invoice:${invoiceId}:${exp}`)}`;
  }

  verifyInvoiceToken(invoiceId: string, token: string): boolean {
    if (typeof token !== 'string' || token.length > 200) return false;
    const [expText, signature] = token.split('.');
    const exp = Number(expText);
    if (!Number.isInteger(exp) || !signature || exp * 1000 < this.nowMs()) return false;
    const expected = Buffer.from(this.sign(`institution-invoice:${invoiceId}:${exp}`));
    const given = Buffer.from(signature);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  invoiceLink(invoice: Pick<InstitutionInvoiceRecord, 'id'>): string {
    return `${this.ctx.config.publicApiUrl}/api/institution/invoices/${encodeURIComponent(invoice.id)}/pdf?t=${encodeURIComponent(this.invoiceToken(invoice.id))}`;
  }

  // ---- Email ke kontak institusi + admin institusi (anggota berperan admin yang aktif)
  async recipients(institution: InstitutionRecord): Promise<string[]> {
    const emails = new Set<string>();
    if (institution.contactEmail) emails.add(institution.contactEmail.toLowerCase());
    const admins = await this.store.listMembers({ institutionId: institution.id, statuses: ['active'], roles: ['admin'] });
    const ids = admins.map((m) => m.userId).filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      for (const profile of await this.ctx.store.getUserProfiles(ids)) if (profile.email) emails.add(profile.email.toLowerCase());
    }
    return [...emails];
  }

  private async send(institution: InstitutionRecord, kind: InstitutionEmailKind, data: Partial<InstitutionEmailData>): Promise<string[]> {
    const to = await this.recipients(institution);
    if (to.length === 0) {
      console.warn(`[institution] email ${kind} untuk ${institution.slug} dilewati: belum ada email kontak atau admin.`);
      return [];
    }
    const email = institutionEmail(kind, { language: institution.language, institutionName: institution.name, siteUrl: this.ctx.config.siteUrl, ...data });
    await this.ctx.mailer.send({ to, subject: email.subject, html: email.html });
    return to;
  }

  /** Kirim di latar (setelah respons/job); kegagalan hanya dicatat. */
  notify(institution: InstitutionRecord, kind: InstitutionEmailKind, data: Partial<InstitutionEmailData> = {}): void {
    this.ctx.defer(async () => {
      await this.send(institution, kind, data);
    });
  }

  private async invoiceEmailData(invoice: InstitutionInvoiceRecord): Promise<{ institution: InstitutionRecord; data: Partial<InstitutionEmailData> } | null> {
    const [contract, institution] = await Promise.all([this.store.getContract(invoice.contractId), this.store.getInstitution(invoice.institutionId)]);
    if (!contract || !institution) return null;
    const tier = await this.tier(contract.tier);
    return {
      institution,
      data: {
        invoiceNumber: invoice.number,
        total: invoice.total,
        dueAt: invoice.dueAt,
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        tierName: tier?.name ?? contract.tier,
        concurrentUsers: contract.concurrentUsers,
        downloadUrl: this.invoiceLink(invoice),
        paymentUrl: invoice.snapRedirectUrl,
        bankAccounts: await this.deps.listBankAccounts()
      }
    };
  }

  /** Field email khusus invoice (tanpa periode kontrak) untuk digabung ke email lain. */
  private async invoiceFields(invoice: InstitutionInvoiceRecord): Promise<Partial<InstitutionEmailData>> {
    return {
      invoiceNumber: invoice.number,
      total: invoice.total,
      dueAt: invoice.dueAt,
      downloadUrl: this.invoiceLink(invoice),
      paymentUrl: invoice.snapRedirectUrl,
      bankAccounts: await this.deps.listBankAccounts()
    };
  }

  /** Kirim email invoice sekarang (admin "kirim ulang"): mengembalikan penerima, error diteruskan. */
  async sendInvoiceEmailNow(invoice: InstitutionInvoiceRecord, kind: 'invoiceIssued' | 'invoiceReminder' | 'invoiceOverdue'): Promise<string[]> {
    const prepared = await this.invoiceEmailData(invoice);
    return prepared ? this.send(prepared.institution, kind, prepared.data) : [];
  }

  sendInvoiceEmail(invoice: InstitutionInvoiceRecord, kind: 'invoiceIssued' | 'invoiceReminder' | 'invoiceOverdue'): void {
    this.ctx.defer(async () => {
      await this.sendInvoiceEmailNow(invoice, kind);
    });
  }

  // ---- Pembayaran & aktivasi
  /** Entitlement untuk semua anggota aktif (satu insert; duplikat diabaikan). Hanya kontrak lunas yang belum berakhir. */
  async grantContractAccess(contract: ContractRecord): Promise<number> {
    if (!['issued', 'active', 'grace'].includes(contract.status)) return 0;
    if (contract.status === 'issued' && !(await this.isPaid(contract))) return 0;
    const now = this.nowMs();
    const members = await this.store.listMembers({ institutionId: contract.institutionId, statuses: ['active'] });
    const rows = members
      .filter((m) => m.userId && (!m.expiresAt || Date.parse(m.expiresAt) > now))
      .map((m) => ({
        userId: m.userId!,
        productId: null,
        scope: 'shelf' as const,
        source: 'institution' as const,
        sourceRef: contract.id,
        startsAt: contract.periodStart,
        // Anggota tamu jaringan: akses hanya sampai sesi tamunya berakhir.
        endsAt: m.expiresAt && Date.parse(m.expiresAt) < Date.parse(this.accessEndsAt(contract)) ? m.expiresAt : this.accessEndsAt(contract),
        maxDevices: INSTITUTION_MAX_DEVICES,
        statusChangedBy: 'institution'
      }));
    return rows.length > 0 ? this.ctx.store.insertEntitlements(rows) : 0;
  }

  /** Status institusi mengikuti kontrak berjalannya (suspended hanya diubah admin, Langkah 7). */
  async syncInstitutionStatus(institutionId: string): Promise<InstitutionRecord | null> {
    const institution = await this.store.getInstitution(institutionId);
    if (!institution || institution.status === 'suspended') return institution;
    const contracts = await this.store.listContracts({ institutionId });
    const running = contracts.find((c) => RUNNING_CONTRACT_STATUSES.includes(c.status));
    let status: InstitutionStatus;
    if (running) status = running.isTrial ? 'trial' : running.status === 'grace' ? 'grace' : 'active';
    else status = contracts.some((c) => c.status === 'expired') ? 'expired' : 'prospect';
    if (status === institution.status) return institution;
    return this.store.updateInstitution(institutionId, { status }, [institution.status]);
  }

  /**
   * Kontrak lunas yang periodenya sudah mulai -> active. Kontrak berjalan lain milik institusi (trial, atau periode
   * sebelumnya yang sedang tenggang) diakhiri; entitlement lamanya berakhir alami pada tanggalnya sendiri.
   */
  async activateContract(contract: ContractRecord): Promise<ContractRecord | null> {
    if (contract.status !== 'issued' || Date.parse(contract.periodStart) > this.nowMs()) return null;
    if (!(await this.isPaid(contract))) return null;
    for (const other of await this.store.listContracts({ institutionId: contract.institutionId, statuses: RUNNING_CONTRACT_STATUSES })) {
      if (other.id === contract.id) continue;
      if (await this.store.updateContract(other.id, { status: 'expired' }, RUNNING_CONTRACT_STATUSES)) {
        await this.event(other.institutionId, other.id, other.isTrial ? 'trial_superseded' : 'contract_superseded', { by: contract.id });
      }
    }
    let activated: ContractRecord | null;
    try {
      activated = await this.store.updateContract(contract.id, { status: 'active', signedAt: contract.signedAt ?? this.iso() }, ['issued']);
    } catch (err) {
      if (err instanceof ConflictError) return null;
      throw err;
    }
    if (!activated) return null;
    await this.grantContractAccess(activated);
    await this.syncInstitutionStatus(activated.institutionId);
    await this.event(activated.institutionId, activated.id, 'contract_activated', {});
    return activated;
  }

  private async afterPaid(contract: ContractRecord): Promise<ContractRecord> {
    let current = contract;
    if (current.status === 'issued') current = (await this.activateContract(current)) ?? (await this.store.getContract(current.id)) ?? current;
    await this.grantContractAccess(current);
    await this.syncInstitutionStatus(current.institutionId);
    return current;
  }

  /**
   * Catat pelunasan (admin atau webhook). Transisi issued/overdue -> paid terjadi sekali (update bersyarat);
   * panggilan ulang untuk invoice yang sudah lunas hanya memastikan aktivasi & entitlement ('duplicate').
   */
  async applyPayment(invoice: InstitutionInvoiceRecord, payment: { method: InstitutionPaymentMethod; paidAt: string; reference: string | null; by: string }): Promise<PaymentResult> {
    const updated = await this.store.updateInvoice(invoice.id, {
      status: 'paid',
      paymentMethod: payment.method,
      paidAt: payment.paidAt,
      paymentReference: payment.reference
    }, OPEN_INVOICE_STATUSES);
    if (!updated) {
      const fresh = await this.store.getInvoice(invoice.id);
      if (fresh?.status !== 'paid') return 'invalid';
      const contract = await this.store.getContract(fresh.contractId);
      if (contract && contract.status !== 'canceled') await this.afterPaid(contract);
      return 'duplicate';
    }
    await this.event(updated.institutionId, updated.contractId, 'invoice_paid', {
      invoiceId: updated.id, number: updated.number, total: updated.total, method: payment.method, reference: payment.reference, by: payment.by
    }, `invoice_paid:${updated.id}`);
    const contract = await this.store.getContract(updated.contractId);
    if (!contract) return 'success';
    if (contract.status === 'canceled' || contract.status === 'draft') {
      await this.event(updated.institutionId, contract.id, 'payment_needs_review', { number: updated.number, contractStatus: contract.status });
      return 'success';
    }
    if (contract.foundingDiscountPct > 0) {
      // Invoice Founding yang dibayar setelah jatuh tempo (reservasi sudah lepas) bisa melampaui kuota: tandai untuk admin.
      const { paid } = await this.foundingSeats();
      const cap = (await this.config()).foundingCap;
      if (paid.size > cap) await this.event(updated.institutionId, contract.id, 'founding_over_cap', { paid: paid.size, cap, number: updated.number }, `founding_over_cap:${contract.id}`);
    }
    const current = await this.afterPaid(contract);
    const institution = await this.store.getInstitution(contract.institutionId);
    if (institution) {
      const tier = await this.tier(contract.tier);
      this.notify(institution, current.status === 'issued' ? 'paidScheduled' : 'activated', {
        invoiceNumber: updated.number,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd,
        tierName: tier?.name ?? current.tier,
        concurrentUsers: current.concurrentUsers
      });
    }
    return 'success';
  }

  /** Pelunasan manual oleh admin CakraNexa: wajib ada bukti pembayaran yang sudah diunggah. */
  async markPaid(invoice: InstitutionInvoiceRecord, input: { method: InstitutionPaymentMethod; paidAt: string; reference: string | null; note: string | null; by: string }): Promise<PaymentResult> {
    if (invoice.status === 'paid') throw httpError(409, 'already_paid', 'Invoice sudah lunas.');
    if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) throw httpError(409, 'invoice_not_open', 'Invoice tidak dalam status menunggu pembayaran.');
    if (!invoice.proofPath) throw httpError(409, 'proof_required', 'Unggah bukti pembayaran terlebih dahulu.');
    const result = await this.applyPayment(invoice, { method: input.method, paidAt: input.paidAt, reference: input.reference, by: input.by });
    if (result === 'invalid') throw httpError(409, 'state_changed', 'Status invoice berubah. Muat ulang halaman.');
    if (input.note) await this.event(invoice.institutionId, invoice.contractId, 'admin_note', { number: invoice.number, note: input.note, by: input.by });
    return result;
  }

  // ---- Midtrans (opsional): halaman bayar Snap khusus Virtual Account; webhook mengaktifkan.
  async createPaymentLink(invoice: InstitutionInvoiceRecord): Promise<InstitutionInvoiceRecord> {
    if (!this.ctx.midtrans.enabled) throw httpError(503, 'payment_unavailable', 'Midtrans belum dikonfigurasi di server ini.');
    if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) throw httpError(409, 'invoice_not_open', 'Invoice tidak dalam status menunggu pembayaran.');
    const [contract, institution] = await Promise.all([this.requireContract(invoice.contractId), this.requireInstitution(invoice.institutionId)]);
    const previous = invoice.midtransOrderId ? ORDER_ID_RE.exec(invoice.midtransOrderId) : null;
    const orderId = `${INSTITUTION_ORDER_PREFIX}${invoice.number}-${previous ? Number(previous[2]) + 1 : 1}`;
    const days = invoice.dueAt ? Math.max(1, Math.ceil((Date.parse(invoice.dueAt) - this.nowMs()) / DAY_MS)) : 14;
    const tier = await this.tier(contract.tier);
    let redirectUrl: string | null;
    try {
      const snap = await this.deps.midtransClient.createTransaction({
        transaction_details: { order_id: orderId, gross_amount: invoice.total },
        item_details: [{ id: invoice.number, price: invoice.total, quantity: 1, name: `CakraNexa Institusi ${tier?.name ?? contract.tier}`.slice(0, 50) }],
        customer_details: { first_name: institution.name.slice(0, 50), ...(institution.contactEmail ? { email: institution.contactEmail } : {}) },
        enabled_payments: MIDTRANS_VA_PAYMENTS,
        expiry: { unit: 'day', duration: Math.min(days, 60) }
      });
      redirectUrl = snap.redirectUrl;
    } catch (err: any) {
      console.error('[institution] Midtrans Snap gagal:', err?.message || err);
      throw httpError(502, 'payment_error', 'Gagal membuat tautan pembayaran Midtrans.');
    }
    const updated = await this.store.updateInvoice(invoice.id, { midtransOrderId: orderId, snapRedirectUrl: redirectUrl }, OPEN_INVOICE_STATUSES);
    if (!updated) throw httpError(409, 'state_changed', 'Status invoice berubah. Muat ulang halaman.');
    await this.event(invoice.institutionId, invoice.contractId, 'midtrans_link_created', { number: invoice.number, orderId });
    // PDF diperbarui agar memuat tautan Virtual Account.
    try {
      return await this.storePdf(updated, contract, institution);
    } catch (err: any) {
      console.warn(`[institution] PDF invoice ${invoice.number} gagal diperbarui:`, err?.message || err);
      return updated;
    }
  }

  /**
   * Webhook Midtrans untuk order INST-. Signature diverifikasi di sini; nominal harus sama dengan total invoice.
   * Refund hanya dicatat untuk ditinjau admin (akses tidak dicabut otomatis).
   */
  async handleNotification(n: Record<string, any>): Promise<{ status: number; body: Record<string, unknown> }> {
    if (!verifyMidtransSignature(this.ctx.midtrans.serverKey, n)) {
      console.warn('[institution] webhook Midtrans dengan signature tidak valid ditolak:', n.order_id);
      return { status: 403, body: { error: 'Invalid signature' } };
    }
    const match = ORDER_ID_RE.exec(String(n.order_id || ''));
    const invoice = match ? await this.store.getInvoiceByNumber(match[1]) : null;
    if (!invoice) return { status: 404, body: { error: 'Invoice not found' } };
    if (Math.round(Number(n.gross_amount)) !== invoice.total) {
      console.error(`[institution] nominal webhook ${n.gross_amount} tidak sama dengan invoice ${invoice.number} (${invoice.total})`);
      return { status: 400, body: { error: 'Amount mismatch' } };
    }
    const target = mapMidtransToOrderStatus(String(n.transaction_status), n.fraud_status);
    if (target === 'paid') {
      const result = await this.applyPayment(invoice, { method: 'midtrans', paidAt: this.iso(), reference: String(n.transaction_id || n.order_id), by: 'midtrans' });
      if (result === 'invalid') {
        await this.event(invoice.institutionId, invoice.contractId, 'payment_orphan', { orderId: n.order_id, invoiceStatus: invoice.status }, `payment_orphan:${n.order_id}`);
      }
      return { status: 200, body: { status: result } };
    }
    if (target === 'refunded') {
      await this.event(invoice.institutionId, invoice.contractId, 'midtrans_refund', { orderId: n.order_id, status: n.transaction_status }, `midtrans_refund:${n.order_id}:${n.transaction_status}`);
      return { status: 200, body: { status: 'recorded' } };
    }
    return { status: 200, body: { status: 'ignored' } };
  }

  // ---- Perpanjangan, tenggang, berakhir (dipanggil job dan admin)
  /** Kontrak perpanjangan yang sudah lunas (menunggu periodenya mulai). */
  async paidRenewal(contract: ContractRecord): Promise<ContractRecord | null> {
    for (const next of await this.store.listContracts({ previousContractId: contract.id, statuses: ['issued'] })) {
      if (await this.isPaid(next)) return next;
    }
    return null;
  }

  /** "Tidak diperpanjang": ada kontrak perpanjangan dan semuanya dibatalkan. Kontrak baru dari admin membuka lagi. */
  async renewalDeclined(contract: ContractRecord): Promise<boolean> {
    const renewals = await this.store.listContracts({ previousContractId: contract.id });
    return renewals.length > 0 && renewals.every((c) => c.status === 'canceled');
  }

  /** Status perpanjangan untuk tabel admin. */
  async renewalSummary(contract: ContractRecord): Promise<RenewalSummary> {
    if (contract.isTrial) return null;
    const renewals = await this.store.listContracts({ previousContractId: contract.id });
    if (renewals.length === 0) return null;
    const current = renewals.find((c) => c.status !== 'canceled');
    if (!current) return { state: 'declined' };
    const state = current.status === 'issued' && await this.isPaid(current) ? 'paid' : current.status;
    return { state: state as Exclude<RenewalSummary, null | { state: 'declined' }>['state'], contractId: current.id, automatic: current.createdBy === RENEWAL_CREATOR };
  }

  /**
   * Draf kontrak periode berikutnya dengan harga dihitung ulang dari jumlah judul di rak saat ini (skala baru, tanpa
   * Founding). Draf buatan sistem dihitung ulang tiap kali dipanggil selama masih draf; bila perpanjangan sudah
   * dinyatakan tidak diperpanjang, tidak ada draf baru.
   */
  async ensureRenewalDraft(contract: ContractRecord): Promise<ContractRecord | null> {
    if (contract.isTrial) return null;
    const renewals = await this.store.listContracts({ previousContractId: contract.id });
    const existing = renewals.find((c) => c.status !== 'canceled');
    if (!existing && renewals.length > 0) return null;
    if (existing && (existing.status !== 'draft' || existing.createdBy !== RENEWAL_CREATOR)) return existing;
    const tier = await this.tier(contract.tier);
    if (!tier) return existing ?? null;
    const config = await this.config();
    const { titles } = await this.shelfCatalog();
    const quote = quoteContract({
      tier,
      titleCount: titles,
      founding: false,
      config,
      overrides: contract.tier === 'enterprise' ? { concurrentUsers: contract.concurrentUsers, adminSeats: contract.adminSeats, fullPrice: contract.fullPrice } : undefined
    });
    const pricing = {
      concurrentUsers: quote.concurrentUsers,
      adminSeats: quote.adminSeats,
      fullPrice: quote.fullPrice,
      catalogScalePct: quote.catalogScalePct,
      catalogTitleCountAtSigning: quote.catalogTitleCount,
      foundingDiscountPct: 0,
      contractedPrice: quote.contractedPrice,
      ebaPct: quote.ebaPct,
      ebaCredit: quote.ebaCredit
    };
    if (existing) return (await this.store.updateContract(existing.id, pricing, ['draft'])) ?? existing;
    const open = await this.store.listContracts({ institutionId: contract.institutionId, statuses: OPEN_CONTRACT_STATUSES });
    if (open.length > 0) return open[0];
    let draft: ContractRecord;
    try {
      draft = await this.store.createContract({
        institutionId: contract.institutionId,
        tier: contract.tier,
        isTrial: false,
        ...pricing,
        periodStart: contract.periodEnd,
        periodEnd: addMonths(contract.periodEnd, 12),
        graceDays: config.graceDays,
        status: 'draft',
        collectionScope: contract.collectionScope,
        previousContractId: contract.id,
        notes: null,
        signedAt: null,
        createdBy: RENEWAL_CREATOR
      });
    } catch (err) {
      if (err instanceof ConflictError) return (await this.store.listContracts({ institutionId: contract.institutionId, statuses: OPEN_CONTRACT_STATUSES }))[0] ?? null;
      throw err;
    }
    if (contract.collectionScope === 'custom') await this.store.addContractCollection(draft.id, await this.store.listContractCollection(contract.id));
    await this.event(contract.institutionId, draft.id, 'renewal_draft_created', { previousContractId: contract.id, price: draft.contractedPrice, scalePct: draft.catalogScalePct });
    return draft;
  }

  /** Invoice terbuka milik kontrak perpanjangan (bila sudah terbit). */
  private async openRenewalInvoice(contract: ContractRecord): Promise<InstitutionInvoiceRecord | null> {
    for (const next of await this.store.listContracts({ previousContractId: contract.id, statuses: ['issued'] })) {
      const invoice = (await this.store.listInvoices({ contractId: next.id, statuses: OPEN_INVOICE_STATUSES }))[0];
      if (invoice) return invoice;
    }
    return null;
  }

  /** H-45: email internal ke admin CakraNexa bahwa invoice perpanjangan akan terbit otomatis (sekali per kontrak). */
  async sendRenewalAdminNotice(contract: ContractRecord): Promise<boolean> {
    if (contract.isTrial) return false;
    const dedupeKey = `renewal_admin_notice:${contract.id}`;
    if (await this.hasEvent(contract.id, dedupeKey)) return false;
    if (await this.renewalDeclined(contract) || await this.paidRenewal(contract)) return false;
    const draft = await this.ensureRenewalDraft(contract);
    if (!draft || draft.status !== 'draft' || draft.previousContractId !== contract.id) return false;
    if (!(await this.event(contract.institutionId, contract.id, 'renewal_admin_notice', { renewalContractId: draft.id }, dedupeKey))) return false;
    const institution = await this.store.getInstitution(contract.institutionId);
    const to = this.deps.adminEmails;
    if (!institution || to.length === 0) return true;
    const config = await this.config();
    const tier = await this.tier(contract.tier);
    const email = renewalAdminEmail({
      institutionName: institution.name,
      tierName: tier?.name ?? contract.tier,
      contactEmail: institution.contactEmail,
      periodEnd: contract.periodEnd,
      price: draft.contractedPrice,
      total: draft.contractedPrice + Math.round((draft.contractedPrice * config.ppnPct) / 100),
      scalePct: draft.catalogScalePct,
      titleCount: draft.catalogTitleCountAtSigning,
      invoiceDate: addDays(contract.periodEnd, -config.renewalInvoiceDays),
      adminUrl: `${this.ctx.config.siteUrl}/admin`
    });
    this.ctx.defer(async () => {
      await this.ctx.mailer.send({ to, subject: email.subject, html: email.html });
    });
    return true;
  }

  /**
   * H-30: invoice perpanjangan terbit otomatis dari draf (harga dihitung ulang dulu). Tidak berjalan bila perpanjangan
   * dinyatakan tidak diperpanjang atau sudah lunas. Email invoice disatukan dengan pemberitahuan perpanjangan H-30.
   */
  async autoIssueRenewal(contract: ContractRecord): Promise<{ invoice: InstitutionInvoiceRecord; created: boolean } | null> {
    if (contract.isTrial || await this.renewalDeclined(contract) || await this.paidRenewal(contract)) return null;
    const draft = await this.ensureRenewalDraft(contract);
    if (!draft || draft.previousContractId !== contract.id) return null;
    if (draft.status === 'issued') {
      const open = (await this.store.listInvoices({ contractId: draft.id, statuses: OPEN_INVOICE_STATUSES }))[0];
      return open ? { invoice: open, created: false } : null;
    }
    if (draft.status !== 'draft') return null;
    try {
      const invoice = await this.issueInvoice(draft, { sendEmail: false, createdBy: RENEWAL_CREATOR });
      await this.event(contract.institutionId, draft.id, 'renewal_invoice_issued', { number: invoice.number, total: invoice.total, previousContractId: contract.id }, `renewal_invoice:${draft.id}`);
      return { invoice, created: true };
    } catch (err: any) {
      await this.event(contract.institutionId, draft.id, 'renewal_invoice_failed', { error: String(err?.message || err).slice(0, 300) }, `renewal_invoice_failed:${draft.id}:${jakartaDate(this.ctx.now())}`);
      throw err;
    }
  }

  /** Admin: institusi tidak memperpanjang. Draf/invoice perpanjangan yang belum dibayar dibatalkan; job berhenti menagih. */
  async declineRenewal(contract: ContractRecord, reason: string | null, by: string): Promise<void> {
    if (contract.isTrial || !RUNNING_CONTRACT_STATUSES.includes(contract.status)) {
      throw httpError(409, 'contract_not_running', 'Hanya kontrak berbayar yang sedang berjalan yang bisa ditandai tidak diperpanjang.');
    }
    let renewals = (await this.store.listContracts({ previousContractId: contract.id })).filter((c) => c.status !== 'canceled');
    for (const renewal of renewals) {
      if (await this.isPaid(renewal) || !OPEN_CONTRACT_STATUSES.includes(renewal.status)) {
        throw httpError(409, 'renewal_paid', 'Perpanjangan sudah dibayar atau berjalan; pengakhiran ditangani manual.');
      }
    }
    if (renewals.length === 0) {
      // Penanda: draf perpanjangan dibuat lalu dibatalkan, sehingga job tidak membuat draf/invoice baru.
      const draft = await this.ensureRenewalDraft(contract);
      if (!draft) return;
      if (draft.previousContractId !== contract.id) {
        throw httpError(409, 'contract_open', 'Ada kontrak draf/terbit lain untuk institusi ini. Terbitkan atau batalkan dulu.');
      }
      renewals = [draft];
    }
    for (const renewal of renewals) await this.cancelContract(renewal, reason ?? 'Tidak diperpanjang', by);
    await this.event(contract.institutionId, contract.id, 'renewal_declined', { reason, by });
  }

  /** Invoice perpanjangan yang belum dibayar sampai `renewalVoidDays` setelah periode sebelumnya berakhir -> void. */
  async autoVoidUnpaidRenewal(contract: ContractRecord): Promise<boolean> {
    if (contract.status !== 'issued' || !contract.previousContractId) return false;
    const config = await this.config();
    if (this.nowMs() < Date.parse(contract.periodStart) + config.renewalVoidDays * DAY_MS) return false;
    if (await this.isPaid(contract)) return false;
    await this.cancelContract(contract, `Tidak dibayar ${config.renewalVoidDays} hari setelah periode sebelumnya berakhir`, 'system');
    await this.event(contract.institutionId, contract.id, 'renewal_auto_voided', { days: config.renewalVoidDays }, `renewal_auto_voided:${contract.id}`);
    return true;
  }

  /** Pemberitahuan perpanjangan ke institusi H-`threshold` (sekali per ambang). Memuat invoice bila sudah terbit. */
  async sendRenewalNotice(contract: ContractRecord, threshold: number): Promise<boolean> {
    const dedupeKey = `renewal_notice:${contract.id}:${threshold}`;
    if (await this.hasEvent(contract.id, dedupeKey)) return false;
    if (await this.renewalDeclined(contract) || await this.paidRenewal(contract)) return false;
    const draft = await this.ensureRenewalDraft(contract);
    if (!(await this.event(contract.institutionId, contract.id, 'renewal_notice', { threshold, renewalContractId: draft?.id ?? null }, dedupeKey))) return false;
    const institution = await this.store.getInstitution(contract.institutionId);
    if (!institution) return true;
    const config = await this.config();
    const usage = await this.store.usageSummary(institution.id, jakartaDate(contract.periodStart), jakartaDate(this.ctx.now()));
    const topTitles: string[] = [];
    for (const top of usage.topProducts.slice(0, 3)) {
      const product = await this.ctx.store.getProduct(top.productId);
      const book = product ? await this.ctx.getBook(product.bookId) : null;
      if (book?.title) topTitles.push(book.title);
    }
    const tier = await this.tier(contract.tier);
    const invoice = await this.openRenewalInvoice(contract);
    this.notify(institution, 'renewalNotice', {
      ...(invoice ? await this.invoiceFields(invoice) : {}),
      days: Math.max(0, Math.ceil((Date.parse(contract.periodEnd) - this.nowMs()) / DAY_MS)),
      periodEnd: contract.periodEnd,
      tierName: tier?.name ?? contract.tier,
      renewal: draft ? {
        price: draft.contractedPrice,
        total: draft.contractedPrice + Math.round((draft.contractedPrice * config.ppnPct) / 100),
        scalePct: draft.catalogScalePct,
        titleCount: draft.catalogTitleCountAtSigning,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        invoiceDate: invoice ? null : addDays(contract.periodEnd, -config.renewalInvoiceDays)
      } : null,
      usage: {
        sessions: usage.sessions,
        pagesRead: usage.pagesRead,
        minutesListened: Math.round(usage.secondsListened / 60),
        deniedConcurrency: usage.deniedConcurrency,
        topTitles
      }
    });
    return true;
  }

  async startGrace(contract: ContractRecord): Promise<boolean> {
    const updated = await this.store.updateContract(contract.id, { status: 'grace' }, ['active']);
    if (!updated) return false;
    const institution = await this.syncInstitutionStatus(contract.institutionId);
    if (institution && await this.event(contract.institutionId, contract.id, 'grace_started', { accessEndsAt: this.accessEndsAt(contract) }, `grace:${contract.id}`)) {
      const invoice = await this.openRenewalInvoice(contract);
      const invoiceData = invoice ? (await this.invoiceEmailData(invoice))?.data ?? {} : {};
      this.notify(institution, 'grace', { ...invoiceData, periodEnd: contract.periodEnd, accessEndsAt: this.accessEndsAt(contract) });
    }
    return true;
  }

  async expireContract(contract: ContractRecord, reason: string): Promise<boolean> {
    const updated = await this.store.updateContract(contract.id, { status: 'expired' }, RUNNING_CONTRACT_STATUSES);
    if (!updated) return false;
    const institution = await this.syncInstitutionStatus(contract.institutionId);
    if (await this.event(contract.institutionId, contract.id, 'contract_expired', { reason }, `expired:${contract.id}`)) {
      // Tanpa kontrak pengganti: kontak diberi tahu akses berakhir (anggota melihat pesan di /library, Langkah 6).
      if (institution && institution.status === 'expired') this.notify(institution, 'expired', { accessEndsAt: this.accessEndsAt(contract), periodEnd: contract.periodEnd });
    }
    return true;
  }

  // ---- Akses anggota (Langkah 3): koleksi custom & batas pengguna bersamaan
  /** Entitlement institusi scope 'shelf' hanya membuka judul koleksi kontraknya bila kontrak berkoleksi custom. */
  async coversProduct(entitlement: EntitlementRecord, product: ProductRecord): Promise<boolean> {
    if (entitlement.source !== 'institution' || entitlement.scope !== 'shelf') return true;
    const contract = entitlement.sourceRef ? await this.store.getContract(entitlement.sourceRef) : null;
    if (!contract) return false;
    if (contract.collectionScope === 'full') return true;
    return (await this.store.listContractCollection(contract.id)).includes(product.id);
  }

  /** Institusi & kapasitas yang membatasi sesi dengan entitlement ini (null = tidak dibatasi). */
  async sessionScope(entitlement: EntitlementRecord): Promise<{ institutionId: string; capacity: number; scopeProductId: string | null } | null> {
    // Lisensi permanen per judul (scope 'product') dibatasi per lisensi di Langkah 5.
    if (entitlement.source !== 'institution' || entitlement.scope !== 'shelf' || !entitlement.sourceRef) return null;
    const contract = await this.store.getContract(entitlement.sourceRef);
    if (!contract) return null;
    // Kapasitas mengikuti kontrak yang sedang berjalan (mis. tambahan sementara dari admin), bukan kontrak lama.
    const running = (await this.store.listContracts({ institutionId: contract.institutionId, statuses: RUNNING_CONTRACT_STATUSES }))[0];
    return { institutionId: contract.institutionId, capacity: (running ?? contract).concurrentUsers, scopeProductId: null };
  }

  /**
   * Klaim slot pengguna bersamaan + buat sesi. Pengguna dihitung sekali walau membuka beberapa judul; sesi hidup bila
   * heartbeat lebih baru dari jendela heartbeat. Supabase: fungsi SQL institution_claim_session (mengunci baris
   * institusi). Store memori: aturan yang sama tanpa kunci (tes/dev satu proses).
   */
  async claimSession(entitlement: EntitlementRecord, row: NewSession): Promise<{ session: SessionRecord } | { busy: { inUse: number; capacity: number; institutionId: string } } | null> {
    const scope = await this.sessionScope(entitlement);
    if (!scope) return null;
    const windowMs = this.ctx.config.heartbeatWindowMs;
    const claimRow: NewSession = { ...row, institutionId: scope.institutionId };
    if (this.store.kind === 'supabase') {
      const result = await this.store.claimSession({
        institutionId: scope.institutionId,
        capacity: scope.capacity,
        scopeProductId: scope.scopeProductId,
        row: claimRow,
        windowSeconds: Math.round(windowMs / 1000)
      });
      if (!result.sessionId) return { busy: { inUse: result.inUse, capacity: result.capacity, institutionId: scope.institutionId } };
      const session = await this.ctx.store.getSession(result.sessionId);
      if (!session) throw new Error('Sesi institusi tidak ditemukan setelah diklaim.');
      return { session };
    }
    const now = Date.parse(row.startedAt);
    const live = (await this.ctx.store.listOpenSessions({ institutionId: scope.institutionId }))
      .filter((s) => now - Date.parse(s.lastHeartbeat) < windowMs
        && (!scope.scopeProductId || s.productId === scope.scopeProductId)
        && !(s.userId === row.userId && s.productId === row.productId));
    const users = new Set(live.map((s) => s.userId));
    if (!users.has(row.userId) && users.size >= scope.capacity) {
      return { busy: { inUse: users.size, capacity: scope.capacity, institutionId: scope.institutionId } };
    }
    return { session: await this.ctx.store.insertSession(claimRow) };
  }

  /** Hook untuk lapisan akses fase 2 (DigitalContext.institution). */
  accessHooks(): InstitutionAccessHooks {
    return {
      coversProduct: (entitlement, product) => this.coversProduct(entitlement, product),
      claimSession: (entitlement, row) => this.claimSession(entitlement, row)
    };
  }
}
