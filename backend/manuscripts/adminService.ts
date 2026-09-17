import crypto from 'crypto';
import type { Request } from 'express';
import type { AssetStorage } from '../digital/storage';
import { effectiveTerms, validateAddendumInput, type EffectiveTerms, type ManuscriptAddendum } from './addenda';
import type { AuthorAccount, ManuscriptAdminStore } from './adminStore';
import { AuthorLinkService } from './authorLinks';
import { IMPORT_STAGE, previewImport, type ImportPreview } from './csvImport';
import { collectReminders, reminderEmail, type ReminderItem } from './reminders';
import { contractsCsv, costReport, paymentsCsv, reportCsv, type ReportEntry, type TitleCostRow } from './report';
import { summarizePayments, wibToday } from './rules';
import { ManuscriptError, ManuscriptService } from './service';
import { ManuscriptConflictError, type ManuscriptContractFilter, type ManuscriptStore } from './store';
import type { ManuscriptContract, ManuscriptPayment, ManuscriptPaymentSummary } from './types';
import { DOCUMENT_CONTENT_TYPE, receiveDocument } from './upload';

/**
 * Admin kontrak naskah fase 5R Langkah 2: kontrak & jadwal honor (service Langkah 1), addendum dengan nilai efektif,
 * dokumen di bucket privat, pengingat, laporan biaya per judul, ekspor & impor CSV, dan akun login penulis.
 */

export interface CatalogBook {
  id: string;
  slug: string;
  name: string;
  isbn: string;
}

export interface ManuscriptAdminDeps {
  store: ManuscriptStore;
  adminStore: ManuscriptAdminStore;
  /** Bucket privat; null = unggah dokumen tidak tersedia. */
  storage: AssetStorage | null;
  loadBooks(): Promise<CatalogBook[]>;
  sendMail(message: { to: string[]; subject: string; html: string }): Promise<void>;
  adminEmails: string[];
  siteUrl: string;
  now?: () => Date;
  log?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface ContractView {
  contract: ManuscriptContract;
  effective: EffectiveTerms;
  summary: ManuscriptPaymentSummary;
  authorName: string;
  bookTitle: string;
}

export class ManuscriptImportError extends ManuscriptError {
  constructor(message: string, readonly preview: ImportPreview) {
    super(400, 'import_invalid', message);
  }
}

const fail = (status: number, code: string, message: string) => new ManuscriptError(status, code, message);
const stamp = () => `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const sum = (payments: ManuscriptPayment[]) => payments.reduce((total, p) => total + p.amount, 0);

/**
 * Store untuk operasi jadwal honor: honor total & honor revisi per edisi dibaca sebagai nilai efektif (setelah
 * addendum). Hanya dipakai untuk pembayaran dan tanda tangan (yang hanya menulis status), bukan untuk mengedit kontrak.
 */
const effectiveHonorStore = (store: ManuscriptStore, adminStore: ManuscriptAdminStore): ManuscriptStore => ({
  kind: store.kind,
  createContract: (row) => store.createContract(row),
  listContracts: (filter) => store.listContracts(filter),
  updateContract: (id, patch, from) => store.updateContract(id, patch, from),
  createPayment: (row) => store.createPayment(row),
  getPayment: (id) => store.getPayment(id),
  listPayments: (filter) => store.listPayments(filter),
  updatePayment: (id, patch, options) => store.updatePayment(id, patch, options),
  async getContract(id) {
    const contract = await store.getContract(id);
    if (!contract) return null;
    const effective = effectiveTerms(contract, await adminStore.listAddenda([id]));
    return { ...contract, honorTotal: effective.honorTotal, revisionFeePerEdition: effective.revisionFeePerEdition };
  }
});

export class ManuscriptAdminService {
  /** Kontrak (nilai dasar): buat, ubah draf/catatan, akhiri, file kontrak. */
  readonly contracts: ManuscriptService;
  /** Jadwal honor & tanda tangan dengan nilai honor efektif. */
  readonly schedule: ManuscriptService;
  readonly links: AuthorLinkService;

  constructor(private readonly deps: ManuscriptAdminDeps) {
    const refs = {
      authorExists: async (id: string) => Boolean(await deps.adminStore.getAuthorAccount(id)),
      bookExists: async (id: string) => (await deps.loadBooks()).some((b) => b.id === id),
      now: deps.now
    };
    this.contracts = new ManuscriptService({ store: deps.store, ...refs });
    this.schedule = new ManuscriptService({ store: effectiveHonorStore(deps.store, deps.adminStore), ...refs });
    this.links = new AuthorLinkService({ store: deps.adminStore, log: deps.log });
  }

  private get log() {
    return this.deps.log ?? console;
  }

  private today() {
    return wibToday(this.deps.now ? this.deps.now() : new Date());
  }

  private async lookups() {
    const [authors, books] = await Promise.all([this.deps.adminStore.listAuthorAccounts(), this.deps.loadBooks()]);
    const authorById = new Map(authors.map((a) => [a.id, a]));
    const bookById = new Map(books.map((b) => [b.id, b]));
    return {
      authors,
      books,
      authorName: (id: string) => authorById.get(id)?.name ?? '(penulis tidak ditemukan)',
      bookTitle: (id: string | null) => (id ? bookById.get(id)?.name ?? id : 'Naskah belum masuk katalog')
    };
  }

  private async entries(filter: ManuscriptContractFilter = {}): Promise<ReportEntry[]> {
    const contracts = await this.deps.store.listContracts(filter);
    const ids = contracts.map((c) => c.id);
    const [payments, addenda] = await Promise.all([
      this.deps.store.listPayments({ contractIds: ids }),
      this.deps.adminStore.listAddenda(ids)
    ]);
    return contracts.map((contract) => ({
      contract,
      effective: effectiveTerms(contract, addenda),
      payments: payments.filter((p) => p.contractId === contract.id)
    }));
  }

  private view(entry: ReportEntry, names: { authorName(id: string): string; bookTitle(id: string | null): string }, today: string): ContractView {
    return {
      contract: entry.contract,
      effective: entry.effective,
      summary: summarizePayments({ honorTotal: entry.effective.honorTotal }, entry.payments, today),
      authorName: names.authorName(entry.contract.authorId),
      bookTitle: names.bookTitle(entry.contract.bookId)
    };
  }

  // -------------------------------------------------------------- baca
  async options() {
    const { authors, books } = await this.lookups();
    return {
      authors: authors.map((a) => ({ id: a.id, name: a.name, email: a.email })),
      books: books.map((b) => ({ id: b.id, title: b.name, isbn: b.isbn }))
    };
  }

  async list(filter: ManuscriptContractFilter = {}): Promise<ContractView[]> {
    const [entries, names] = await Promise.all([this.entries(filter), this.lookups()]);
    const today = this.today();
    return entries.map((entry) => this.view(entry, names, today));
  }

  async detail(id: string) {
    const contract = await this.deps.store.getContract(id);
    if (!contract) throw fail(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    const [payments, addenda, names] = await Promise.all([
      this.deps.store.listPayments({ contractIds: [id] }),
      this.deps.adminStore.listAddenda([id]),
      this.lookups()
    ]);
    const entry = { contract, effective: effectiveTerms(contract, addenda), payments };
    return {
      ...this.view(entry, names, this.today()),
      payments,
      addenda: [...addenda].sort((a, b) => a.signedAt.localeCompare(b.signedAt) || a.createdAt.localeCompare(b.createdAt))
    };
  }

  // ------------------------------------------------------------ addendum
  async addAddendum(contractId: string, input: unknown): Promise<ManuscriptAddendum> {
    const contract = await this.deps.store.getContract(contractId);
    if (!contract) throw fail(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    if (contract.status !== 'signed') {
      throw fail(409, 'invalid_state', contract.status === 'draft'
        ? 'Kontrak draf diubah langsung; addendum hanya untuk kontrak yang sudah ditandatangani.'
        : 'Kontrak sudah diakhiri.');
    }
    const [addenda, payments] = await Promise.all([
      this.deps.adminStore.listAddenda([contractId]),
      this.deps.store.listPayments({ contractIds: [contractId] })
    ]);
    const current = effectiveTerms(contract, addenda);
    const validated = validateAddendumInput(input, contract, current);
    if ('error' in validated) throw fail(400, 'invalid_addendum', validated.error);
    const { changes } = validated.value;
    if (changes.honorTotal !== null && changes.honorTotal < sum(payments.filter((p) => p.kind === 'honor'))) {
      throw fail(409, 'schedule_exceeds_honor', 'Honor baru lebih kecil dari jadwal honor yang sudah dibuat. Sesuaikan tahap yang belum dibayar terlebih dahulu.');
    }
    if (changes.revisionFeePerEdition !== null) {
      const perEdition = new Map<number, number>();
      for (const p of payments.filter((x) => x.kind === 'revision')) perEdition.set(p.edition!, (perEdition.get(p.edition!) ?? 0) + p.amount);
      if ([...perEdition.values()].some((total) => total > changes.revisionFeePerEdition!)) {
        throw fail(409, 'revision_exceeds_fee', 'Honor revisi per edisi yang baru lebih kecil dari honor revisi yang sudah dijadwalkan.');
      }
    }
    try {
      return await this.deps.adminStore.createAddendum({ ...validated.value, contractId, filePath: null });
    } catch (err) {
      if (err instanceof ManuscriptConflictError) throw fail(409, 'addendum_conflict', 'Nomor addendum sudah dipakai.');
      throw err;
    }
  }

  // ------------------------------------------------------------- dokumen
  private requireStorage(): AssetStorage {
    if (!this.deps.storage) throw fail(503, 'storage_unavailable', 'Penyimpanan dokumen tidak tersedia.');
    return this.deps.storage;
  }

  private async storeDocument(req: Request, prefix: string): Promise<string> {
    const storage = this.requireStorage();
    const file = await receiveDocument(req);
    const objectPath = `${prefix}-${stamp()}.${file.extension}`;
    await storage.upload(objectPath, file.buffer, DOCUMENT_CONTENT_TYPE[file.extension]);
    return objectPath;
  }

  async uploadContractFile(contractId: string, req: Request) {
    const contract = await this.deps.store.getContract(contractId);
    if (!contract) throw fail(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    const objectPath = await this.storeDocument(req, `manuscripts/${contractId}/kontrak`);
    return this.contracts.setContractFile(contractId, objectPath);
  }

  async uploadAddendumFile(addendumId: string, req: Request) {
    const addendum = await this.deps.adminStore.getAddendum(addendumId);
    if (!addendum) throw fail(404, 'addendum_not_found', 'Addendum tidak ditemukan.');
    const objectPath = await this.storeDocument(req, `manuscripts/${addendum.contractId}/addendum-${addendumId}`);
    const updated = await this.deps.adminStore.setAddendumFile(addendumId, objectPath);
    if (!updated) throw fail(404, 'addendum_not_found', 'Addendum tidak ditemukan.');
    return updated;
  }

  async uploadPaymentFile(paymentId: string, kind: 'proof' | 'tax_slip', req: Request) {
    const payment = await this.deps.store.getPayment(paymentId);
    if (!payment) throw fail(404, 'payment_not_found', 'Tahap pembayaran tidak ditemukan.');
    const label = kind === 'proof' ? 'bukti-bayar' : 'bukti-potong';
    const objectPath = await this.storeDocument(req, `manuscripts/${payment.contractId}/pembayaran-${paymentId}-${label}`);
    return this.contracts.setPaymentFile(paymentId, kind, objectPath);
  }

  async download(kind: 'contract' | 'addendum' | 'proof' | 'tax_slip', id: string): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    let objectPath: string | null = null;
    let name = '';
    if (kind === 'contract') {
      const contract = await this.deps.store.getContract(id);
      objectPath = contract?.contractFilePath ?? null;
      name = `kontrak-${contract?.contractNumber ?? id}`;
    } else if (kind === 'addendum') {
      const addendum = await this.deps.adminStore.getAddendum(id);
      objectPath = addendum?.filePath ?? null;
      name = `addendum-${addendum?.addendumNumber ?? id}`;
    } else {
      const payment = await this.deps.store.getPayment(id);
      objectPath = (kind === 'proof' ? payment?.paymentProofPath : payment?.taxSlipPath) ?? null;
      name = `${kind === 'proof' ? 'bukti-bayar' : 'bukti-potong-pajak'}-${payment?.sequence ?? id}`;
    }
    if (!objectPath) throw fail(404, 'file_not_found', 'Dokumen belum diunggah.');
    const extension = objectPath.split('.').pop() || '';
    const buffer = await this.requireStorage().download(objectPath);
    return {
      buffer,
      contentType: DOCUMENT_CONTENT_TYPE[extension] || 'application/octet-stream',
      filename: `${name.replace(/[^A-Za-z0-9._-]+/g, '-')}.${extension}`
    };
  }

  // ------------------------------------------------------------ pengingat
  async reminders(): Promise<ReminderItem[]> {
    const [entries, names] = await Promise.all([this.entries({ statuses: ['signed'] }), this.lookups()]);
    return collectReminders({ entries, today: this.today(), authorName: names.authorName, bookTitle: names.bookTitle });
  }

  /** Job harian: kirim ringkasan pengingat yang belum pernah dikirim ke email admin. */
  async runReminderJob(): Promise<{ items: number; sent: number }> {
    const items = await this.reminders();
    const fresh: ReminderItem[] = [];
    for (const item of items) {
      if (await this.deps.adminStore.markReminderSent(item.kind, item.refId, item.refDate)) fresh.push(item);
    }
    if (fresh.length > 0 && this.deps.adminEmails.length > 0) {
      const { subject, html } = reminderEmail(fresh, `${this.deps.siteUrl.replace(/\/$/, '')}/admin`);
      try {
        await this.deps.sendMail({ to: this.deps.adminEmails, subject, html });
      } catch (err: any) {
        this.log.error('[manuscripts] email pengingat gagal:', err?.message || err);
      }
    }
    return { items: items.length, sent: fresh.length };
  }

  // ------------------------------------------------------ laporan & ekspor
  async report(): Promise<TitleCostRow[]> {
    const [entries, names] = await Promise.all([this.entries(), this.lookups()]);
    return costReport(entries, names.bookTitle);
  }

  async exportCsv(type: string): Promise<{ filename: string; body: string }> {
    const [entries, names] = await Promise.all([this.entries(), this.lookups()]);
    const date = this.today().replace(/-/g, '');
    if (type === 'contracts') return { filename: `kontrak-naskah-${date}.csv`, body: contractsCsv(entries, names.authorName, names.bookTitle) };
    if (type === 'payments') return { filename: `pembayaran-naskah-${date}.csv`, body: paymentsCsv(entries, names.authorName, names.bookTitle) };
    if (type === 'report') return { filename: `biaya-naskah-per-judul-${date}.csv`, body: reportCsv(costReport(entries, names.bookTitle)) };
    throw fail(404, 'unknown_export', 'Jenis ekspor tidak dikenal.');
  }

  // ---------------------------------------------------------------- impor
  async importPreview(csv: unknown): Promise<ImportPreview> {
    const text = String(csv ?? '');
    if (!text.trim()) throw fail(400, 'csv_required', 'Tempel atau unggah isi CSV.');
    if (text.length > 1_000_000) throw fail(413, 'csv_too_large', 'CSV maksimal 1 MB.');
    const [names, existing] = await Promise.all([this.lookups(), this.deps.store.listContracts({})]);
    return previewImport(text, {
      authors: names.authors.map((a: AuthorAccount) => ({ id: a.id, name: a.name, email: a.email })),
      books: names.books.map((b) => ({ id: b.id, slug: b.slug, title: b.name, isbn: b.isbn })),
      existing,
      today: this.today()
    });
  }

  /** Simpan hanya bila semua baris valid; kontrak tercatat sudah ditandatangani dengan satu tahap honor. */
  async importCommit(csv: unknown): Promise<{ created: string[] }> {
    const preview = await this.importPreview(csv);
    if (preview.fileErrors.length > 0 || preview.invalid > 0 || preview.total === 0) {
      throw new ManuscriptImportError('Impor dibatalkan: perbaiki baris yang bermasalah pada pratinjau.', preview);
    }
    const created: string[] = [];
    for (const row of preview.rows) {
      const input = row.contract!;
      try {
        const contract = await this.deps.store.createContract({ ...input, contractType: 'jual_putus', status: 'signed', contractFilePath: null });
        if (input.honorTotal > 0) {
          await this.deps.store.createPayment({
            contractId: contract.id,
            sequence: 1,
            stage: IMPORT_STAGE,
            kind: 'honor',
            edition: null,
            amount: input.honorTotal,
            dueDate: input.signedAt,
            paidAt: row.honorPaidAt,
            paymentReference: row.honorPaidAt ? 'Impor kontrak lama' : null,
            paymentProofPath: null,
            taxSlipPath: null,
            notes: null
          });
        }
        created.push(contract.contractNumber);
      } catch (err: any) {
        this.log.error('[manuscripts] impor terhenti:', { line: row.line, error: err?.message || err });
        throw fail(500, 'import_partial', `Impor terhenti di baris ${row.line}. Tersimpan ${created.length} kontrak: ${created.join(', ') || '-'}. Periksa lalu impor ulang sisanya.`);
      }
    }
    this.log.info('[manuscripts] impor kontrak lama:', { count: created.length });
    return { created };
  }

  // --------------------------------------------------------- akun penulis
  async authorAccounts(): Promise<AuthorAccount[]> {
    return this.deps.adminStore.listAuthorAccounts();
  }
}
