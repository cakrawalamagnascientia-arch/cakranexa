import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { asyncRoute, httpError } from '../errors';
import { clientInfo, type DigitalContext } from '../context';
import { createUserRateLimiter } from '../rateLimits';
import { publicInstitution, type InstitutionMembers } from './members';
import type { InstitutionService } from './service';
import type { InstitutionRecord, MemberRecord, MemberRole, MemberStatus } from './types';

/**
 * API anggota institusi (Langkah 3):
 *  - publik: GET /api/institution/public/:slug (halaman /institutions/join/:slug, Langkah 6);
 *  - anggota (login + flag fitur digital): /api/institution/me, /join/domain, /join/code, /join/ip, /:institutionId/leave;
 *  - admin institusi (anggota berperan admin): /api/institution/admin/:institutionId/members|codes;
 *  - admin CakraNexa: /api/admin/institution/institutions/:id/members (mis. mengundang admin institusi pertama).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEMBER_STATUSES: MemberStatus[] = ['invited', 'active', 'disabled'];

const bodyOf = (req: Request) => (req.body || {}) as Record<string, unknown>;

const textOrNull = (value: unknown, max: number, label: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw httpError(400, 'invalid_field', `${label} harus teks.`);
  const text = value.trim();
  if (text.length > max) throw httpError(400, 'invalid_field', `${label} maksimal ${max} karakter.`);
  return text || null;
};

const roleOf = (value: unknown, fallback: MemberRole = 'member'): MemberRole => {
  if (value === undefined || value === null || value === '') return fallback;
  if (value !== 'member' && value !== 'admin') throw httpError(400, 'invalid_field', 'Peran harus member atau admin.');
  return value;
};

export const createInstitutionMemberRouter = (ctx: DigitalContext, service: InstitutionService, members: InstitutionMembers): Router => {
  const router = express.Router();
  const store = service.store;
  const read = createUserRateLimiter(ctx, 'institutionRead');
  const join = createUserRateLimiter(ctx, 'institutionJoin');
  const manage = createUserRateLimiter(ctx, 'institutionAdmin');

  const loadMember = async (institutionId: string, memberId: string): Promise<MemberRecord> => {
    const member = UUID_RE.test(memberId) ? await store.getMember(memberId) : null;
    if (!member || member.institutionId !== institutionId) throw httpError(404, 'member_not_found', 'Anggota tidak ditemukan.');
    return member;
  };

  /** Ubah peran/status/label grup satu anggota (dipakai admin institusi dan admin CakraNexa). */
  const patchMember = async (institution: InstitutionRecord, member: MemberRecord, body: Record<string, unknown>, by: string, actingUserId: string | null) => {
    let current = member;
    if ('status' in body) {
      if (body.status !== 'active' && body.status !== 'disabled') throw httpError(400, 'invalid_field', 'Status harus active atau disabled.');
      if (body.status === 'disabled' && actingUserId && member.userId === actingUserId) {
        throw httpError(409, 'cannot_disable_self', 'Anda tidak bisa menonaktifkan akun admin Anda sendiri.');
      }
      current = await members.setStatus(institution, current, body.status, by);
    }
    if ('role' in body) {
      const role = roleOf(body.role, current.role);
      if (role === 'member' && actingUserId && member.userId === actingUserId) {
        throw httpError(409, 'cannot_demote_self', 'Anda tidak bisa melepas peran admin Anda sendiri.');
      }
      current = await members.setRole(institution, current, role, by);
    }
    if ('groupLabel' in body) current = await members.setGroup(current, textOrNull(body.groupLabel, 100, 'Label grup'));
    return current;
  };

  const inviteInput = (body: Record<string, unknown>, by: string) => ({
    emails: body.emails,
    role: roleOf(body.role),
    groupLabel: textOrNull(body.groupLabel, 100, 'Label grup'),
    invitedBy: by
  });

  // ---- Publik
  router.get('/api/institution/public/:slug', asyncRoute(async (req, res) => {
    const institution = await store.getInstitutionBySlug(String(req.params.slug).toLowerCase());
    if (!institution || institution.status === 'prospect') throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      slug: institution.slug,
      name: institution.name,
      type: institution.type,
      logoUrl: institution.showLogoPublic ? institution.logoUrl : null,
      joinable: ['trial', 'active', 'grace'].includes(institution.status),
      domains: institution.emailDomains,
      ipAccess: ctx.config.institution.ipAccessEnabled && (institution.ipRanges ?? []).length > 0
    });
  }));

  // ---- Anggota
  router.get('/api/institution/me', ctx.requireUser, read, asyncRoute(async (req, res) => {
    res.json(await members.me(req.digitalUser!));
  }));

  router.post('/api/institution/join/domain', ctx.requireUser, join, asyncRoute(async (req, res) => {
    const slug = String(bodyOf(req).slug || '').trim().toLowerCase();
    if (!slug) throw httpError(400, 'invalid_field', 'Pilih institusi.');
    const result = await members.joinByDomain(req.digitalUser!, slug);
    res.status(result.created ? 201 : 200).json({ institution: publicInstitution(result.institution), memberId: result.member.id, role: result.member.role });
  }));

  router.post('/api/institution/join/code', ctx.requireUser, join, asyncRoute(async (req, res) => {
    const result = await members.joinByCode(req.digitalUser!, bodyOf(req).code);
    res.status(result.created ? 201 : 200).json({ institution: publicInstitution(result.institution), memberId: result.member.id, role: result.member.role });
  }));

  router.post('/api/institution/join/ip', ctx.requireUser, join, asyncRoute(async (req, res) => {
    const result = await members.joinByIp(req.digitalUser!, clientInfo(req).ip);
    res.status(result.created ? 201 : 200).json({ institution: publicInstitution(result.institution), memberId: result.member.id, expiresAt: result.member.expiresAt });
  }));

  router.post('/api/institution/:institutionId/leave', ctx.requireUser, join, asyncRoute(async (req, res) => {
    const institutionId = String(req.params.institutionId);
    if (!UUID_RE.test(institutionId)) throw httpError(404, 'member_not_found', 'Anda bukan anggota institusi ini.');
    if (bodyOf(req).confirm !== true) throw httpError(400, 'confirm_required', 'Konfirmasi diperlukan.');
    await members.leave(req.digitalUser!, institutionId);
    res.json({ left: true });
  }));

  // ---- Admin institusi
  const requireInstitutionAdmin: RequestHandler = asyncRoute(async (req, res: Response, next) => {
    const institutionId = String(req.params.institutionId);
    const [member] = UUID_RE.test(institutionId)
      ? await store.listMembers({ institutionId, userId: req.digitalUser!.id, statuses: ['active'], roles: ['admin'] })
      : [];
    if (!member) throw httpError(403, 'not_institution_admin', 'Hanya admin institusi yang dapat mengakses halaman ini.');
    const institution = await service.requireInstitution(institutionId);
    res.locals.institution = institution;
    next();
  });
  const A = '/api/institution/admin/:institutionId';
  const admin = [ctx.requireUser, manage, requireInstitutionAdmin];
  const institutionOf = (res: Response) => res.locals.institution as InstitutionRecord;
  const actor = (req: Request) => `institution-admin:${req.digitalUser!.id}`;

  router.get(`${A}/members`, ...admin, asyncRoute(async (req, res) => {
    const status = String(req.query.status || '') as MemberStatus;
    res.json({ members: await members.listView(institutionOf(res).id, { status: MEMBER_STATUSES.includes(status) ? status : undefined, q: String(req.query.q || '').slice(0, 100) }) });
  }));

  // Body: { emails: string | string[] (CSV/daftar), role?: member|admin, groupLabel? }.
  router.post(`${A}/members/invite`, ...admin, asyncRoute(async (req, res) => {
    res.status(201).json(await members.invite(institutionOf(res), inviteInput(bodyOf(req), actor(req))));
  }));

  // Body: { role?, status?: active|disabled, groupLabel? }.
  router.patch(`${A}/members/:memberId`, ...admin, asyncRoute(async (req, res) => {
    const institution = institutionOf(res);
    const member = await loadMember(institution.id, String(req.params.memberId));
    const updated = await patchMember(institution, member, bodyOf(req), actor(req), req.digitalUser!.id);
    res.json({ member: (await members.listView(institution.id)).find((m) => m.id === updated.id) ?? null });
  }));

  router.post(`${A}/members/:memberId/resend`, ...admin, asyncRoute(async (req, res) => {
    const institution = institutionOf(res);
    await members.resendInvite(institution, await loadMember(institution.id, String(req.params.memberId)), actor(req));
    res.json({ sent: true });
  }));

  router.get(`${A}/codes`, ...admin, asyncRoute(async (_req, res) => {
    res.json({ codes: await store.listJoinCodes(institutionOf(res).id) });
  }));

  // Body: { code?, expiresOn?: YYYY-MM-DD (berlaku sampai akhir hari WIB), maxUses?, groupLabel? }.
  router.post(`${A}/codes`, ...admin, asyncRoute(async (req, res) => {
    const body = bodyOf(req);
    let expiresAt: string | null = null;
    if (body.expiresOn) {
      if (!DATE_RE.test(String(body.expiresOn))) throw httpError(400, 'invalid_field', 'Tanggal berakhir harus YYYY-MM-DD.');
      expiresAt = new Date(Date.parse(`${body.expiresOn}T23:59:59+07:00`)).toISOString();
      if (Date.parse(expiresAt) <= ctx.now().getTime()) throw httpError(400, 'invalid_field', 'Tanggal berakhir harus di masa depan.');
    }
    let maxUses: number | null = null;
    if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '') {
      maxUses = Number(body.maxUses);
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000) throw httpError(400, 'invalid_field', 'Kuota pemakaian 1–100.000.');
    }
    const code = await members.createCode(institutionOf(res), {
      code: textOrNull(body.code, 40, 'Kode'),
      expiresAt,
      maxUses,
      groupLabel: textOrNull(body.groupLabel, 100, 'Label grup'),
      createdBy: actor(req)
    });
    res.status(201).json({ code });
  }));

  router.post(`${A}/codes/:codeId/disable`, ...admin, asyncRoute(async (req, res) => {
    res.json({ code: await members.disableCode(institutionOf(res), String(req.params.codeId)) });
  }));

  // ---- Admin CakraNexa
  const loadInstitution = async (req: Request) => {
    const id = String(req.params.id);
    const institution = UUID_RE.test(id) ? await store.getInstitution(id) : null;
    if (!institution) throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    return institution;
  };

  router.get('/api/admin/institution/institutions/:id/members', ctx.requireAdmin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const status = String(req.query.status || '') as MemberStatus;
    res.json({ members: await members.listView(institution.id, { status: MEMBER_STATUSES.includes(status) ? status : undefined, q: String(req.query.q || '').slice(0, 100) }) });
  }));

  router.post('/api/admin/institution/institutions/:id/members/invite', ctx.requireAdmin, asyncRoute(async (req, res) => {
    res.status(201).json(await members.invite(await loadInstitution(req), inviteInput(bodyOf(req), 'admin')));
  }));

  router.patch('/api/admin/institution/institutions/:id/members/:memberId', ctx.requireAdmin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    const member = await loadMember(institution.id, String(req.params.memberId));
    const updated = await patchMember(institution, member, bodyOf(req), 'admin', null);
    res.json({ member: (await members.listView(institution.id)).find((m) => m.id === updated.id) ?? null });
  }));

  router.post('/api/admin/institution/institutions/:id/members/:memberId/resend', ctx.requireAdmin, asyncRoute(async (req, res) => {
    const institution = await loadInstitution(req);
    await members.resendInvite(institution, await loadMember(institution.id, String(req.params.memberId)), 'admin');
    res.json({ sent: true });
  }));

  return router;
};
