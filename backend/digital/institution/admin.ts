import express, { type Request, type Router } from 'express';
import Busboy from 'busboy';
import { asyncRoute, ConflictError, httpError } from '../errors';
import type { DigitalContext } from '../context';
import { ALLOWED_SCALE_PCTS, catalogScalePct, CONFIG_BOUNDS, CONFIG_KEYS, parseCatalogScale, parseNoticeDays } from './pricing';
import { runInstitutionJob } from './jobs';
import { sendInvoicePdf } from './router';
import type { ContractInput, InstitutionService } from './service';
import {
  INSTITUTION_STATUSES,
  OPEN_CONTRACT_STATUSES,
  OPEN_INVOICE_STATUSES,
  ORG_TYPES,
  RUNNING_CONTRACT_STATUSES,
  TIER_CODES,
  type InquiryRef,
  type InstitutionConfig,
  type InstitutionInvoiceRecord,
  type InstitutionOrgType,
  type InstitutionPatch,
  type InstitutionPaymentMethod,
  type InstitutionRecord,
  type InstitutionStatus,
  type InstitutionTierCode
} from './types';

/**
 * Admin CakraNexa — institusi & kontrak (docs/PHASE-4-BRIEF Langkah 2). Semua rute di bawah /api/admin/institution
 * (tunggal, agar tidak bentrok dengan /api/admin/institutions/inquiries fase 1). Aksi tercatat di institution_events.
 */

const BASE = '/api/admin/institution';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NPWP_RE = /^[0-9.\-\s]{8,32}$/;
const MANUAL_METHODS: InstitutionPaymentMethod[] = ['transfer', 'va', 'other'];
const PROOF_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const PROOF_CONTENT_TYPE: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const PROOF_MAX_BYTES = 10 * 1024 * 1024;
/** Tanda tangan file: tipe dari browser tidak dipercaya begitu saja. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
};
/** Jenis institusi dari form permintaan fase 1 (5 jenis) ke 9 jenis fase 4; 'other' dipilih admin. */
const INQUIRY_TYPE_MAP: Record<string, InstitutionOrgType> = { university: 'university', library: 'library', government: 'government', company: 'company' };

const bodyOf = (req: Request) => (req.body || {}) as Record<string, unknown>;
const requireConfirm = (body: Record<string, unknown>) => {
  if (body.confirm !== true) throw httpError(400, 'confirm_required', 'Konfirmasi diperlukan.');
};

export const slugify = (name: string): string => name
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)
  .replace(/-+$/, '') || 'institusi';

const optionalText = (body: Record<string, unknown>, key: string, max: number): string | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError(400, 'invalid_field', `${key} harus teks.`);
  const text = value.trim();
  if (text.length > max) throw httpError(400, 'invalid_field', `${key} maksimal ${max} karakter.`);
  return text || null;
};

/** Field profil institusi (buat & ubah). Hanya kunci yang dikirim yang diubah. */
const parseInstitutionFields = (body: Record<string, unknown>): InstitutionPatch => {
  const patch: InstitutionPatch = {};
  const name = optionalText(body, 'name', 200);
  if (name !== undefined) {
    if (!name || name.length < 2) throw httpError(400, 'invalid_field', 'Nama institusi 2–200 karakter.');
    patch.name = name;
  }
  if ('type' in body) {
    if (!ORG_TYPES.includes(body.type as InstitutionOrgType)) throw httpError(400, 'invalid_field', 'Jenis institusi tidak valid.');
    patch.type = body.type as InstitutionOrgType;
  }
  const slug = optionalText(body, 'slug', 80);
  if (slug) {
    if (!SLUG_RE.test(slug)) throw httpError(400, 'invalid_field', 'Slug hanya huruf kecil, angka, dan tanda hubung.');
    patch.slug = slug;
  }
  const address = optionalText(body, 'address', 500);
  if (address !== undefined) patch.address = address;
  const contactName = optionalText(body, 'contactName', 120);
  if (contactName !== undefined) patch.contactName = contactName;
  const contactEmail = optionalText(body, 'contactEmail', 254);
  if (contactEmail !== undefined) {
    if (contactEmail && !EMAIL_RE.test(contactEmail)) throw httpError(400, 'invalid_field', 'Email kontak tidak valid.');
    patch.contactEmail = contactEmail ? contactEmail.toLowerCase() : null;
  }
  const contactPhone = optionalText(body, 'contactPhone', 40);
  if (contactPhone !== undefined) patch.contactPhone = contactPhone;
  const npwp = optionalText(body, 'npwp', 32);
  if (npwp !== undefined) {
    if (npwp && !NPWP_RE.test(npwp)) throw httpError(400, 'invalid_field', 'NPWP hanya angka, titik, dan tanda hubung.');
    patch.npwp = npwp;
  }
  if ('emailDomains' in body) {
    const raw = body.emailDomains;
    const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(/[\s,;]+/))
      .map((d) => String(d).trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean);
    const invalid = list.filter((d) => !DOMAIN_RE.test(d));
    if (invalid.length > 0) throw httpError(400, 'invalid_field', `Domain email tidak valid: ${invalid.slice(0, 3).join(', ')}.`);
    if (list.length > 20) throw httpError(400, 'invalid_field', 'Maksimal 20 domain email.');
    patch.emailDomains = [...new Set(list)];
  }
  if ('language' in body) {
    if (body.language !== 'id' && body.language !== 'en') throw httpError(400, 'invalid_field', 'Bahasa invoice/email harus id atau en.');
    patch.language = body.language;
  }
  const accountManager = optionalText(body, 'accountManager', 120);
  if (accountManager !== undefined) patch.accountManager = accountManager;
  const notes = optionalText(body, 'notes', 2000);
  if (notes !== undefined) patch.notes = notes;
  const logoUrl = optionalText(body, 'logoUrl', 500);
  if (logoUrl !== undefined) {
    if (logoUrl && !/^https:\/\/[^\s]+$/i.test(logoUrl)) throw httpError(400, 'invalid_field', 'URL logo harus https://.');
    patch.logoUrl = logoUrl;
  }
  if ('showLogoPublic' in body) {
    if (typeof body.showLogoPublic !== 'boolean') throw httpError(400, 'invalid_field', 'showLogoPublic harus boolean.');
    patch.showLogoPublic = body.showLogoPublic;
  }
  return patch;
};

const readInt = (value: unknown, min: number, max: number, label: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, 'invalid_field', `${label} harus bilangan bulat ${min}–${max}.`);
  return n;
};

/** Tanggal WIB (YYYY-MM-DD) -> ISO jam tertentu, dibatasi rentang wajar dari sekarang. */
const wibDate = (value: unknown, time: string, now: number, pastDays: number, futureDays: number, label: string): string => {
  const text = String(value || '');
  const ms = DATE_RE.test(text) ? Date.parse(`${text}T${time}+07:00`) : NaN;
  if (!Number.isFinite(ms)) throw httpError(400, 'invalid_field', `${label} harus tanggal YYYY-MM-DD.`);
  if (ms < now - pastDays * 86_400_000 || ms > now + futureDays * 86_400_000) throw httpError(400, 'invalid_field', `${label} di luar rentang yang diizinkan.`);
  return new Date(ms).toISOString();
};

const parseContractInput = (body: Record<string, unknown>, now: number): ContractInput => {
  const tier = String(body.tier || '') as InstitutionTierCode;
  if (!TIER_CODES.includes(tier)) throw httpError(400, 'invalid_tier', 'Pilih tier kontrak.');
  const overrides: ContractInput['overrides'] = {};
  if (tier === 'enterprise') {
    overrides.concurrentUsers = readInt(body.concurrentUsers, 1, 100_000, 'Pengguna bersamaan');
    overrides.adminSeats = readInt(body.adminSeats, 1, 1_000, 'Kursi admin');
    overrides.fullPrice = readInt(body.fullPrice, 1, 100_000_000_000, 'Harga penuh');
    if (body.catalogScalePct !== undefined && body.catalogScalePct !== null && body.catalogScalePct !== '') {
      const pct = Number(body.catalogScalePct);
      if (!(ALLOWED_SCALE_PCTS as readonly number[]).includes(pct)) throw httpError(400, 'invalid_field', 'Skala katalog harus 40, 60, 80, atau 100.');
      overrides.catalogScalePct = pct;
    }
  }
  const scope = body.collectionScope === 'custom' ? 'custom' : 'full';
  const productIds = Array.isArray(body.productIds) ? body.productIds.map(String).slice(0, 5000) : [];
  const notes = optionalText(body, 'notes', 2000) ?? null;
  return {
    tier,
    founding: body.founding === true,
    periodStart: body.periodStart ? wibDate(body.periodStart, '00:00:00', now, 365, 730, 'Tanggal mulai') : null,
    overrides,
    collectionScope: scope,
    productIds,
    notes
  };
};

/** Invoice untuk admin: path penyimpanan internal diganti penanda. */
const adminInvoice = (invoice: InstitutionInvoiceRecord) => {
  const { proofPath, pdfPath, ...rest } = invoice;
  return { ...rest, hasProof: Boolean(proofPath), hasPdf: Boolean(pdfPath) };
};

/** Satu file multipart (field "file") ke memori, dengan batas tipe & ukuran. */
const receiveProof = (req: Request) =>
  new Promise<{ buffer: Buffer; extension: string }>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 5, fileSize: PROOF_MAX_BYTES } });
    } catch {
      reject(httpError(400, 'invalid_upload', 'Unggahan harus multipart/form-data.'));
      return;
    }
    let failure: Error | null = null;
    let received: { buffer: Buffer; extension: string } | null = null;
    let reading: Promise<void> | null = null;
    parser.on('file', (field, stream, meta) => {
      const extension = PROOF_TYPES[String(meta.mimeType || '').toLowerCase()];
      if (field !== 'file' || reading) {
        stream.resume();
        return;
      }
      if (!extension) {
        failure = httpError(415, 'unsupported_type', 'Bukti pembayaran harus PDF, PNG, JPG, atau WebP.');
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('limit', () => {
        failure = httpError(413, 'file_too_large', 'Ukuran bukti pembayaran maksimal 10 MB.');
      });
      reading = new Promise((done) => stream.on('end', () => {
        received = { buffer: Buffer.concat(chunks), extension };
        done();
      }));
    });
    parser.on('error', () => reject(httpError(400, 'invalid_upload', 'Unggahan terputus atau rusak.')));
    parser.on('close', async () => {
      if (reading) await reading;
      if (failure) reject(failure);
      else if (!received || (received as { buffer: Buffer }).buffer.length === 0) reject(httpError(400, 'no_file', 'File bukti pembayaran tidak ditemukan.'));
      else resolve(received);
    });
    req.pipe(parser);
  });

export const createInstitutionAdminRouter = (ctx: DigitalContext, service: InstitutionService): Router => {
  const router = express.Router();
  const admin = ctx.requireAdmin;
  const store = service.store;

  const loadInstitution = async (req: Request): Promise<InstitutionRecord> => {
    const id = String(req.params.id);
    const institution = UUID_RE.test(id) ? await store.getInstitution(id) : null;
    if (!institution) throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    return institution;
  };
  const loadContract = async (req: Request) => {
    const id = String(req.params.id);
    const contract = UUID_RE.test(id) ? await store.getContract(id) : null;
    if (!contract) throw httpError(404, 'contract_not_found', 'Kontrak tidak ditemukan.');
    return contract;
  };
  const loadInvoice = async (req: Request) => {
    const id = String(req.params.id);
    const invoice = UUID_RE.test(id) ? await store.getInvoice(id) : null;
    if (!invoice) throw httpError(404, 'invoice_not_found', 'Invoice tidak ditemukan.');
    return invoice;
  };

  /** Slug unik: slug eksplisit harus bebas; slug otomatis diberi akhiran -2, -3, ... */
  const uniqueSlug = async (base: string, explicit: boolean, exceptId?: string): Promise<string> => {
    const taken = async (slug: string) => {
      const existing = await store.getInstitutionBySlug(slug);
      return Boolean(existing && existing.id !== exceptId);
    };
    if (!(await taken(base))) return base;
    if (explicit) throw httpError(409, 'slug_taken', 'Slug sudah dipakai institusi lain.');
    for (let n = 2; n <= 99; n += 1) {
      const candidate = `${base.slice(0, 76)}-${n}`;
      if (!(await taken(candidate))) return candidate;
    }
    throw httpError(409, 'slug_taken', 'Tidak menemukan slug yang bebas; isi slug secara manual.');
  };

  // ---- Ringkasan, konfigurasi, katalog rak
  router.get(`${BASE}/summary`, admin, asyncRoute(async (_req, res) => {
    const [institutions, openInvoices, configState, tiers, founding, catalog, bankAccounts] = await Promise.all([
      store.listInstitutions({}),
      store.listInvoices({ statuses: OPEN_INVOICE_STATUSES }),
      service.configState(),
      service.tiers(),
      service.foundingStatus(),
      service.shelfCatalog(),
      service.deps.listBankAccounts()
    ]);
    res.json({
      counts: Object.fromEntries(INSTITUTION_STATUSES.map((s) => [s, institutions.filter((i) => i.status === s).length])),
      total: institutions.length,
      founding,
      catalog: { titles: catalog.titles, products: catalog.products.length, scalePct: catalogScalePct(catalog.titles, configState.config.catalogScale) },
      config: configState.config,
      invalidConfig: configState.invalid,
      tiers,
      openInvoices: openInvoices.filter((i) => i.status === 'issued').length,
      overdueInvoices: openInvoices.filter((i) => i.status === 'overdue').length,
      bankAccounts,
      paymentAvailable: ctx.midtrans.enabled,
      publicApiUrl: ctx.config.publicApiUrl
    });
  }));

  // Body: field InstitutionConfig yang diubah (camelCase). Berlaku untuk kontrak & invoice baru; kontrak lama terkunci.
  router.patch(`${BASE}/config`, admin, asyncRoute(async (req, res) => {
    const body = bodyOf(req);
    const writes: Array<[string, unknown]> = [];
    for (const [field, key] of Object.entries(CONFIG_KEYS) as Array<[keyof InstitutionConfig, string]>) {
      if (!(field in body)) continue;
      const value = body[field];
      if (field === 'catalogScale') {
        const parsed = parseCatalogScale(value);
        if (!parsed) throw httpError(400, 'invalid_config', 'Skala katalog: daftar {minTitles, pct} dengan pct 40/60/80/100 dan satu pita minTitles 0.');
        writes.push([key, parsed.map((band) => ({ min_titles: band.minTitles, pct: band.pct }))]);
      } else if (field === 'renewalNoticeDays') {
        const parsed = parseNoticeDays(value);
        if (!parsed) throw httpError(400, 'invalid_config', 'Hari pemberitahuan perpanjangan: 1–5 angka antara 1 dan 365.');
        writes.push([key, parsed]);
      } else {
        const [min, max, integer] = CONFIG_BOUNDS[field];
        const n = Number(value);
        if (value === null || value === '' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
          throw httpError(400, 'invalid_config', `${field} harus ${integer ? 'bilangan bulat ' : ''}${min}–${max}.`);
        }
        writes.push([key, integer ? n : Math.round(n * 100) / 100]);
      }
    }
    if (writes.length === 0) throw httpError(400, 'no_change', 'Tidak ada perubahan.');
    for (const [key, value] of writes) await store.setConfig(key, value);
    console.log(`[institution] admin mengubah konfigurasi: ${JSON.stringify(Object.fromEntries(writes))}`);
    res.json({ config: await service.config(), note: 'Berlaku untuk kontrak dan invoice yang dibuat setelah ini. Harga kontrak yang sudah dibuat tidak berubah.' });
  }));

  // Judul di rak hari ini (pilihan koleksi custom; "pilih semua per kategori" di UI).
  router.get(`${BASE}/catalog`, admin, asyncRoute(async (_req, res) => {
    const { products, titles } = await service.shelfCatalog();
    const items: Array<{ id: string; format: string; bookId: string; title: string; category: string }> = [];
    for (const p of products) {
      const book = await ctx.getBook(p.bookId);
      items.push({ id: p.id, format: p.format, bookId: p.bookId, title: book?.title || p.bookId, category: book?.category || 'Lainnya' });
    }
    items.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title) || a.format.localeCompare(b.format));
    res.json({ titles, products: items });
  }));

  // ---- Institusi
  router.get(`${BASE}/institutions`, admin, asyncRoute(async (req, res) => {
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
    const [institutions, contracts, invoices, members] = await Promise.all([
      store.listInstitutions(INSTITUTION_STATUSES.includes(status as InstitutionStatus) ? { statuses: [status as InstitutionStatus] } : {}),
      store.listContracts({}),
      store.listInvoices({ statuses: OPEN_INVOICE_STATUSES }),
      store.listMembers({ statuses: ['active', 'invited'] })
    ]);
    const rows = institutions
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.slug.includes(q) || (i.contactEmail ?? '').includes(q))
      .map((i) => {
        const own = contracts.filter((c) => c.institutionId === i.id);
        const openInvoice = invoices.find((inv) => inv.institutionId === i.id) ?? null;
        const people = members.filter((m) => m.institutionId === i.id);
        return {
          institution: i,
          runningContract: own.find((c) => RUNNING_CONTRACT_STATUSES.includes(c.status)) ?? null,
          openContract: own.find((c) => OPEN_CONTRACT_STATUSES.includes(c.status)) ?? null,
          openInvoice: openInvoice ? adminInvoice(openInvoice) : null,
          members: { active: people.filter((m) => m.status === 'active').length, invited: people.filter((m) => m.status === 'invited').length }
        };
      });
    res.json({ institutions: rows.slice(0, 500), total: rows.length });
  }));

  // Buat institusi (prospect), opsional dari permintaan penawaran fase 1: { inquiryId?, name?, type?, ... }.
  router.post(`${BASE}/institutions`, admin, asyncRoute(async (req, res) => {
    const body = bodyOf(req);
    let inquiry: InquiryRef | null = null;
    if (body.inquiryId !== undefined && body.inquiryId !== null && body.inquiryId !== '') {
      const inquiryId = String(body.inquiryId);
      if (!UUID_RE.test(inquiryId)) throw httpError(400, 'invalid_field', 'ID permintaan tidak valid.');
      inquiry = await service.deps.getInquiry(inquiryId);
      if (!inquiry) throw httpError(404, 'inquiry_not_found', 'Permintaan penawaran tidak ditemukan.');
      if ((await store.listInstitutions({ inquiryId })).length > 0) throw httpError(409, 'inquiry_converted', 'Permintaan ini sudah dikonversi menjadi institusi.');
    }
    const fields = parseInstitutionFields(body);
    const name = fields.name ?? inquiry?.institutionName ?? null;
    if (!name || name.length < 2) throw httpError(400, 'invalid_field', 'Nama institusi wajib diisi.');
    const type = fields.type ?? (inquiry ? INQUIRY_TYPE_MAP[inquiry.institutionType] : undefined);
    if (!type) throw httpError(400, 'invalid_field', 'Pilih jenis institusi.');
    const slug = await uniqueSlug(fields.slug ?? slugify(name), Boolean(fields.slug));
    let institution: InstitutionRecord;
    try {
      institution = await store.createInstitution({
        slug,
        name,
        type,
        address: fields.address ?? null,
        contactName: fields.contactName ?? inquiry?.contactName ?? null,
        contactEmail: fields.contactEmail ?? (inquiry?.email ? inquiry.email.toLowerCase() : null),
        contactPhone: fields.contactPhone ?? inquiry?.phone ?? null,
        npwp: fields.npwp ?? null,
        emailDomains: fields.emailDomains ?? [],
        ipRanges: null,
        status: 'prospect',
        inquiryId: inquiry?.id ?? null,
        accountManager: fields.accountManager ?? null,
        logoUrl: fields.logoUrl ?? null,
        showLogoPublic: fields.showLogoPublic ?? false,
        notes: fields.notes ?? null,
        language: fields.language ?? (inquiry && inquiry.language !== 'id' ? 'en' : 'id')
      });
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'slug_taken', 'Slug sudah dipakai institusi lain.');
      throw err;
    }
    await service.event(institution.id, null, 'institution_created', { inquiryId: institution.inquiryId, by: 'admin' });
    res.status(201).json({ institution });
  }));

  router.get(`${BASE}/institutions/:id`, admin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const [contracts, invoices, events, members, founding] = await Promise.all([
      store.listContracts({ institutionId: institution.id }),
      store.listInvoices({ institutionId: institution.id }),
      store.listEvents({ institutionId: institution.id, limit: 100 }),
      store.listMembers({ institutionId: institution.id }),
      service.foundingEligibility(institution)
    ]);
    const paid = new Set(invoices.filter((i) => i.status === 'paid').map((i) => i.contractId));
    const collectionSizes = new Map<string, number>();
    for (const c of contracts.filter((x) => x.collectionScope === 'custom')) collectionSizes.set(c.id, (await store.listContractCollection(c.id)).length);
    const renewals = new Map<string, Awaited<ReturnType<typeof service.renewalSummary>>>();
    for (const c of contracts.filter((x) => RUNNING_CONTRACT_STATUSES.includes(x.status) && !x.isTrial)) renewals.set(c.id, await service.renewalSummary(c));
    res.json({
      institution,
      contracts: contracts.map((c) => ({
        ...c,
        paid: c.isTrial || paid.has(c.id),
        accessEndsAt: service.accessEndsAt(c),
        collectionSize: collectionSizes.get(c.id) ?? null,
        renewal: renewals.get(c.id) ?? null
      })),
      invoices: invoices.map(adminInvoice),
      events,
      members: {
        active: members.filter((m) => m.status === 'active').length,
        invited: members.filter((m) => m.status === 'invited').length,
        disabled: members.filter((m) => m.status === 'disabled').length,
        admins: members.filter((m) => m.status === 'active' && m.role === 'admin').length
      },
      founding,
      trialAvailable: !contracts.some((c) => c.isTrial) && !contracts.some((c) => RUNNING_CONTRACT_STATUSES.includes(c.status)) && institution.status !== 'suspended'
    });
  }));

  router.patch(`${BASE}/institutions/:id`, admin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const patch = parseInstitutionFields(bodyOf(req));
    if (Object.keys(patch).length === 0) throw httpError(400, 'no_change', 'Tidak ada perubahan.');
    if (patch.slug && patch.slug !== institution.slug) patch.slug = await uniqueSlug(patch.slug, true, institution.id);
    let updated: InstitutionRecord | null;
    try {
      updated = await store.updateInstitution(institution.id, patch);
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'slug_taken', 'Slug sudah dipakai institusi lain.');
      throw err;
    }
    if (!updated) throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    await service.event(institution.id, null, 'institution_updated', { fields: Object.keys(patch), by: 'admin' });
    res.json({ institution: updated });
  }));

  // ---- Kontrak: pratinjau rincian perhitungan (tanpa menyimpan), simpan draf, trial, terbitkan, batalkan
  router.post(`${BASE}/institutions/:id/contracts/preview`, admin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const prepared = await service.prepareContract(institution, parseContractInput(bodyOf(req), ctx.now().getTime()));
    res.json({
      quote: prepared.quote,
      founding: prepared.founding,
      periodStart: prepared.periodStart,
      periodEnd: prepared.periodEnd,
      graceDays: prepared.config.graceDays,
      invoiceDueDays: prepared.config.invoiceDueDays,
      previousContractId: prepared.previous?.id ?? null,
      warnings: prepared.warnings
    });
  }));

  router.post(`${BASE}/institutions/:id/contracts`, admin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const { contract, prepared } = await service.createContract(institution, parseContractInput(bodyOf(req), ctx.now().getTime()), 'admin');
    res.status(201).json({ contract, quote: prepared.quote, warnings: prepared.warnings });
  }));

  router.post(`${BASE}/institutions/:id/trial`, admin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const contract = await service.createTrial(institution, optionalText(bodyOf(req), 'notes', 2000) ?? null, 'admin');
    res.status(201).json({ contract, institution: await store.getInstitution(institution.id) });
  }));

  // Body: { sendEmail?: boolean } (bawaan true).
  router.post(`${BASE}/contracts/:id/issue`, admin, asyncRoute(async (req, res) => {
    const contract = await loadContract(req);
    const invoice = await service.issueInvoice(contract, { sendEmail: bodyOf(req).sendEmail !== false, createdBy: 'admin' });
    res.status(201).json({ invoice: adminInvoice(invoice), contract: await store.getContract(contract.id), link: service.invoiceLink(invoice) });
  }));

  // Body: { confirm: true, reason? }. Hanya draf/terbit yang belum dibayar; invoice terbukanya dibatalkan.
  router.post(`${BASE}/contracts/:id/cancel`, admin, asyncRoute(async (req, res) => {
    const contract = await loadContract(req);
    const body = bodyOf(req);
    requireConfirm(body);
    res.json({ contract: await service.cancelContract(contract, optionalText(body, 'reason', 300) ?? null, 'admin') });
  }));

  // Tidak diperpanjang. Body: { confirm: true, reason? }. Draf/invoice perpanjangan yang belum dibayar dibatalkan.
  router.post(`${BASE}/contracts/:id/decline-renewal`, admin, asyncRoute(async (req, res) => {
    const contract = await loadContract(req);
    const body = bodyOf(req);
    requireConfirm(body);
    await service.declineRenewal(contract, optionalText(body, 'reason', 300) ?? null, 'admin');
    res.json({ contract: await store.getContract(contract.id), renewal: await service.renewalSummary(contract) });
  }));

  // ---- Invoice
  router.get(`${BASE}/invoices/:id/pdf`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    sendInvoicePdf(res, invoice.number, await service.invoicePdf(invoice));
  }));

  // Tautan unduh bertoken (untuk dikirim manual, mis. lewat WhatsApp).
  router.get(`${BASE}/invoices/:id/link`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    if (invoice.status === 'void') throw httpError(409, 'invoice_void', 'Invoice sudah dibatalkan.');
    res.json({ url: service.invoiceLink(invoice) });
  }));

  // Kirim ulang email invoice ke kontak + admin institusi.
  router.post(`${BASE}/invoices/:id/send`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    if (!OPEN_INVOICE_STATUSES.includes(invoice.status)) throw httpError(409, 'invoice_not_open', 'Hanya invoice yang belum dibayar yang dikirim ulang.');
    let sentTo: string[];
    try {
      sentTo = await service.sendInvoiceEmailNow(invoice, invoice.status === 'overdue' ? 'invoiceOverdue' : 'invoiceIssued');
    } catch (err: any) {
      throw httpError(502, 'email_failed', `Email gagal dikirim: ${String(err?.message || err).slice(0, 200)}`);
    }
    if (sentTo.length === 0) throw httpError(409, 'no_recipient', 'Isi email kontak institusi terlebih dahulu.');
    await service.event(invoice.institutionId, invoice.contractId, 'invoice_sent', { number: invoice.number, to: sentTo.length, by: 'admin' });
    res.json({ sentTo });
  }));

  // Unggah bukti pembayaran (multipart, field "file"; PDF/PNG/JPG/WebP maks 10 MB) ke bucket privat.
  router.post(`${BASE}/invoices/:id/proof`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    if (invoice.status === 'void') throw httpError(409, 'invoice_void', 'Invoice sudah dibatalkan.');
    const file = await receiveProof(req);
    if (!MAGIC[file.extension](file.buffer)) throw httpError(415, 'unsupported_type', 'Isi file tidak sesuai tipenya.');
    const objectPath = `institutions/${invoice.institutionId}/proofs/${invoice.number}-${ctx.now().getTime()}.${file.extension}`;
    await ctx.storage.upload(objectPath, file.buffer, PROOF_CONTENT_TYPE[file.extension]);
    const updated = await store.updateInvoice(invoice.id, { proofPath: objectPath });
    await service.event(invoice.institutionId, invoice.contractId, 'proof_uploaded', { number: invoice.number, bytes: file.buffer.length, by: 'admin' });
    res.json({ invoice: adminInvoice(updated ?? { ...invoice, proofPath: objectPath }) });
  }));

  router.get(`${BASE}/invoices/:id/proof`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    if (!invoice.proofPath) throw httpError(404, 'proof_not_found', 'Belum ada bukti pembayaran.');
    const extension = invoice.proofPath.split('.').pop() || '';
    const buffer = await ctx.storage.download(invoice.proofPath);
    res.set('Content-Type', PROOF_CONTENT_TYPE[extension] || 'application/octet-stream');
    res.set('Content-Disposition', `inline; filename="bukti-${invoice.number}.${extension}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.send(buffer);
  }));

  // Tandai lunas (manual). Body: { confirm: true, method: transfer|va|other, paidDate?: YYYY-MM-DD, reference?, note? }.
  router.post(`${BASE}/invoices/:id/mark-paid`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    const body = bodyOf(req);
    requireConfirm(body);
    const method = String(body.method || 'transfer') as InstitutionPaymentMethod;
    if (!MANUAL_METHODS.includes(method)) throw httpError(400, 'invalid_field', 'Metode pembayaran: transfer, va, atau other.');
    const now = ctx.now().getTime();
    const paidAt = body.paidDate ? wibDate(body.paidDate, '12:00:00', now, 365, 1, 'Tanggal bayar') : new Date(now).toISOString();
    const result = await service.markPaid(invoice, {
      method,
      paidAt,
      reference: optionalText(body, 'reference', 120) ?? null,
      note: optionalText(body, 'note', 500) ?? null,
      by: 'admin'
    });
    const fresh = await store.getInvoice(invoice.id);
    res.json({
      result,
      invoice: fresh ? adminInvoice(fresh) : null,
      contract: fresh ? await store.getContract(fresh.contractId) : null,
      institution: await store.getInstitution(invoice.institutionId)
    });
  }));

  // Buat halaman bayar Midtrans (Virtual Account sekali bayar, order_id INST-...). PDF diperbarui dengan tautannya.
  router.post(`${BASE}/invoices/:id/midtrans`, admin, asyncRoute(async (req, res) => {
    const invoice = await service.createPaymentLink(await loadInvoice(req));
    res.json({ invoice: adminInvoice(invoice), paymentUrl: invoice.snapRedirectUrl });
  }));

  // Batalkan invoice yang belum dibayar. Body: { confirm: true, reason? }. Kontraknya kembali ke draf.
  router.post(`${BASE}/invoices/:id/void`, admin, asyncRoute(async (req, res) => {
    const invoice = await loadInvoice(req);
    const body = bodyOf(req);
    requireConfirm(body);
    const updated = await service.voidInvoice(invoice, optionalText(body, 'reason', 300) ?? null, 'admin');
    res.json({ invoice: adminInvoice(updated), contract: await store.getContract(invoice.contractId) });
  }));

  // Jalankan job kontrak sekarang (tanpa menunggu jadwal per jam).
  router.post(`${BASE}/jobs/run`, admin, asyncRoute(async (_req, res) => {
    res.json(await runInstitutionJob(service));
  }));

  return router;
};
