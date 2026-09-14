import crypto from 'crypto';
import { ConflictError, httpError } from '../errors';
import { memberInviteEmail } from './email';
import { INSTITUTION_MAX_DEVICES, type InstitutionService } from './service';
import {
  RUNNING_CONTRACT_STATUSES,
  type ContractRecord,
  type InstitutionRecord,
  type InstitutionStatus,
  type JoinCodeRecord,
  type JoinMethod,
  type MemberRecord,
  type MemberRole,
  type MemberStatus
} from './types';
import type { AuthUser, UserProfile } from '../types';

/**
 * Anggota institusi (docs/PHASE-4-BRIEF Langkah 3). Cara bergabung:
 *  a) undangan email (Resend) — diterima otomatis saat pengguna masuk dengan email itu dan emailnya terverifikasi;
 *  b) domain email institusi (termasuk subdomain) — email wajib terverifikasi;
 *  c) kode gabung dengan batas waktu & kuota (pemakaian atomik);
 *  d) IP jaringan institusi (flag ENABLE_IP_ACCESS, bawaan mati) — anggota tamu sementara (ip_guest_session_hours).
 * Anggota aktif mendapat entitlement dari kontrak yang lunas (sedang berjalan atau periode berikutnya yang sudah
 * dibayar). Dinonaktifkan/keluar -> entitlement dicabut dan sesi berjalan diakhiri. Anggota yang dinonaktifkan admin
 * tidak bisa bergabung ulang sendiri; anggota yang keluar sendiri bisa.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const JOIN_CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/;
const MAX_INVITES = 500;
/** Institusi yang menerima anggota lewat domain/kode/IP: kontrak sedang berjalan. Undangan diterima pada status apa pun kecuali ditangguhkan. */
const JOINABLE: InstitutionStatus[] = ['trial', 'active', 'grace'];

/** Domain email beserta domain induknya (mhs.ui.ac.id -> mhs.ui.ac.id, ui.ac.id, ac.id). */
export const emailDomainCandidates = (email: string): string[] => {
  const labels = (email.split('@')[1] ?? '').toLowerCase().split('.').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i <= labels.length - 2; i += 1) out.push(labels.slice(i).join('.'));
  return out;
};

/** Daftar email dari teks bebas atau CSV (koma, titik koma, spasi, baris baru). Kata tanpa "@" (nama, header) diabaikan. */
export const parseEmailList = (input: unknown): { valid: string[]; invalid: string[] } => {
  const raw = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[\s,;]+/);
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const item of raw) {
    const email = item.trim().replace(/^["'<]+|["'>]+$/g, '').toLowerCase();
    if (!email.includes('@')) continue;
    if (EMAIL_RE.test(email) && email.length <= 254) valid.add(email);
    else invalid.push(item.trim());
  }
  return { valid: [...valid], invalid };
};

const parseIpv4 = (ip: string): number | null => {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    n = n * 256 + Number(part);
  }
  return n;
};

const parseIpv6 = (ip: string): bigint | null => {
  let text = ip.toLowerCase().split('%')[0];
  const embedded = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded) {
    const v4 = parseIpv4(embedded[2]);
    if (v4 === null) return null;
    text = `${embedded[1]}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  let n = BigInt(0);
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    n = (n << BigInt(16)) | BigInt(parseInt(group, 16));
  }
  return n;
};

/** IP termasuk rentang CIDR (IPv4, IPv6, dan IPv4-mapped IPv6 "::ffff:a.b.c.d"). */
export const ipInCidr = (rawIp: string, cidr: string): boolean => {
  const ip = /^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(rawIp) ? rawIp.slice(7) : rawIp;
  const [base, bitsText] = cidr.trim().split('/');
  const v4Ip = parseIpv4(ip);
  const v4Base = parseIpv4(base ?? '');
  if (v4Ip !== null && v4Base !== null) {
    const bits = bitsText === undefined ? 32 : Number(bitsText);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    const block = 2 ** (32 - bits);
    return Math.floor(v4Ip / block) === Math.floor(v4Base / block);
  }
  const v6Ip = parseIpv6(ip);
  const v6Base = parseIpv6(base ?? '');
  if (v6Ip === null || v6Base === null) return false;
  const bits = bitsText === undefined ? 128 : Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  const shift = BigInt(128 - bits);
  return (v6Ip >> shift) === (v6Base >> shift);
};

/** Institusi untuk anggota (tanpa data internal). */
export const publicInstitution = (i: InstitutionRecord) => ({ id: i.id, slug: i.slug, name: i.name, type: i.type, logoUrl: i.logoUrl });

/** Keanggotaan aktif pengguna di GET /api/institution/me. */
export interface MembershipSummary {
  institution: ReturnType<typeof publicInstitution>;
  memberId: string;
  role: MemberRecord['role'];
  joinedVia: MemberRecord['joinedVia'];
  groupLabel: string | null;
  expiresAt: string | null;
  access: {
    status: ContractRecord['status'];
    trial: boolean;
    accessEndsAt: string;
    concurrentUsers: number;
    collection: ContractRecord['collectionScope'];
  } | null;
}

export interface MemberView {
  id: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedVia: JoinMethod | null;
  groupLabel: string | null;
  invitedAt: string | null;
  joinedAt: string | null;
  disabledAt: string | null;
  disabledBy: MemberRecord['disabledBy'];
  expiresAt: string | null;
}

export class InstitutionMembers {
  constructor(readonly service: InstitutionService) {}

  private get store() {
    return this.service.store;
  }

  private get ctx() {
    return this.service.ctx;
  }

  private nowIso(): string {
    return this.ctx.now().toISOString();
  }

  // ---- Hak akses anggota
  /** Kontrak yang memberi akses anggota sekarang atau nanti: berjalan (trial/aktif/tenggang) atau terbit & sudah lunas. */
  async accessContracts(institutionId: string): Promise<ContractRecord[]> {
    const out: ContractRecord[] = [];
    for (const c of await this.store.listContracts({ institutionId, statuses: ['issued', 'active', 'grace'] })) {
      if (c.status !== 'issued' || await this.service.isPaid(c)) out.push(c);
    }
    return out;
  }

  /** Entitlement institusi untuk satu anggota aktif; baris yang pernah dicabut diaktifkan kembali. */
  async grantMemberAccess(member: MemberRecord): Promise<number> {
    if (member.status !== 'active' || !member.userId) return 0;
    if (member.expiresAt && Date.parse(member.expiresAt) <= this.ctx.now().getTime()) return 0;
    const existing = await this.ctx.store.listEntitlements({ userId: member.userId, source: 'institution', scope: 'shelf' });
    let changed = 0;
    for (const contract of await this.accessContracts(member.institutionId)) {
      const accessEnd = this.service.accessEndsAt(contract);
      // Tamu jaringan: akses hanya sampai sesi tamunya berakhir.
      const endsAt = member.expiresAt && Date.parse(member.expiresAt) < Date.parse(accessEnd) ? member.expiresAt : accessEnd;
      const rows = existing.filter((e) => e.sourceRef === contract.id);
      if (rows.length === 0) {
        changed += await this.ctx.store.insertEntitlements([{
          userId: member.userId,
          productId: null,
          scope: 'shelf',
          source: 'institution',
          sourceRef: contract.id,
          startsAt: contract.periodStart,
          endsAt,
          maxDevices: INSTITUTION_MAX_DEVICES,
          statusChangedBy: 'institution'
        }]);
        continue;
      }
      const revoked = rows.filter((e) => e.status === 'revoked').map((e) => e.id);
      if (revoked.length > 0) {
        await this.ctx.store.updateEntitlements(revoked, { status: 'active', revokedReason: null, statusChangedBy: 'institution' });
        changed += revoked.length;
      }
      const stale = rows.filter((e) => e.endsAt !== endsAt).map((e) => e.id);
      if (stale.length > 0) await this.ctx.store.updateEntitlementsEndsAt(stale, endsAt);
    }
    return changed;
  }

  /** Cabut entitlement institusi ini dari anggota dan akhiri sesi yang memakainya. */
  async revokeMemberAccess(member: MemberRecord, reason: string): Promise<number> {
    if (!member.userId) return 0;
    const contractIds = new Set((await this.store.listContracts({ institutionId: member.institutionId })).map((c) => c.id));
    const rows = (await this.ctx.store.listEntitlements({ userId: member.userId, source: 'institution' }))
      .filter((e) => e.sourceRef !== null && contractIds.has(e.sourceRef) && e.status !== 'revoked');
    if (rows.length === 0) return 0;
    const ids = rows.map((e) => e.id);
    await this.ctx.store.updateEntitlements(ids, { status: 'revoked', revokedReason: reason, statusChangedBy: 'institution' });
    const idSet = new Set(ids);
    const sessions = (await this.ctx.store.listOpenSessions({ userId: member.userId }))
      .filter((s) => s.entitlementId !== null && idSet.has(s.entitlementId))
      .map((s) => s.id);
    if (sessions.length > 0) await this.ctx.store.endSessions({ ids: sessions }, 'revoked');
    return ids.length;
  }

  private async verifiedEmail(user: AuthUser): Promise<string | null> {
    const verification = await this.ctx.store.getEmailVerification(user.id);
    return verification?.verified && verification.email ? verification.email.toLowerCase() : null;
  }

  private assertJoinable(institution: InstitutionRecord) {
    if (!JOINABLE.includes(institution.status)) {
      throw httpError(409, 'institution_inactive', 'Langganan institusi ini belum atau tidak lagi aktif.');
    }
  }

  /**
   * Aktifkan keanggotaan user di institusi (idempoten). Baris undangan dengan email user dipakai bila ada.
   * Anggota yang dinonaktifkan admin ditolak.
   */
  async activate(institution: InstitutionRecord, user: AuthUser, via: JoinMethod, options: { groupLabel?: string | null; expiresAt?: string | null } = {}): Promise<{ member: MemberRecord; created: boolean }> {
    const nowIso = this.nowIso();
    const [byUser] = await this.store.listMembers({ institutionId: institution.id, userId: user.id });
    const email = user.email.toLowerCase();
    const byEmail = byUser ? null : (await this.store.listMembers({ institutionId: institution.id, invitedEmail: email }))[0] ?? null;
    const existing = byUser ?? byEmail;
    if (existing?.status === 'disabled' && existing.disabledBy === 'admin') {
      throw httpError(403, 'member_disabled', 'Keanggotaan Anda di institusi ini dinonaktifkan oleh admin institusi.');
    }
    if (existing?.status === 'active' && existing.userId === user.id) {
      let member = existing;
      if (via === 'ip' && existing.expiresAt) {
        member = (await this.store.updateMember(existing.id, { expiresAt: options.expiresAt ?? null })) ?? existing;
      } else if (via !== 'ip' && existing.expiresAt) {
        // Tamu jaringan menjadi anggota tetap (domain/kode/undangan).
        member = (await this.store.updateMember(existing.id, { expiresAt: null, joinedVia: via, groupLabel: options.groupLabel ?? existing.groupLabel })) ?? existing;
      }
      await this.grantMemberAccess(member);
      return { member, created: false };
    }
    let member: MemberRecord;
    if (existing) {
      member = (await this.store.updateMember(existing.id, {
        userId: user.id,
        status: 'active',
        joinedAt: nowIso,
        joinedVia: existing.status === 'invited' ? 'invite' : via,
        groupLabel: options.groupLabel ?? existing.groupLabel,
        disabledAt: null,
        disabledBy: null,
        expiresAt: options.expiresAt ?? null
      })) ?? existing;
    } else {
      try {
        member = await this.store.insertMember({
          institutionId: institution.id,
          userId: user.id,
          role: 'member',
          status: 'active',
          invitedEmail: null,
          invitedAt: null,
          invitedBy: null,
          joinedAt: nowIso,
          joinedVia: via,
          groupLabel: options.groupLabel ?? null,
          disabledAt: null,
          expiresAt: options.expiresAt ?? null
        });
      } catch (err) {
        // Permintaan paralel dari user yang sama sudah membuat keanggotaannya.
        if (!(err instanceof ConflictError)) throw err;
        const [raced] = await this.store.listMembers({ institutionId: institution.id, userId: user.id });
        if (!raced) throw err;
        await this.grantMemberAccess(raced);
        return { member: raced, created: false };
      }
    }
    await this.grantMemberAccess(member);
    await this.service.event(institution.id, null, 'member_joined', { memberId: member.id, via: member.joinedVia });
    return { member, created: true };
  }

  /** Terima undangan untuk email terverifikasi pengguna (dipanggil saat pengguna membuka akunnya). */
  async acceptInvites(user: AuthUser): Promise<MemberRecord[]> {
    const email = await this.verifiedEmail(user);
    if (!email) return [];
    const joined: MemberRecord[] = [];
    for (const invite of await this.store.listMembers({ invitedEmail: email, statuses: ['invited'] })) {
      if (invite.userId) continue;
      const institution = await this.store.getInstitution(invite.institutionId);
      if (!institution || institution.status === 'suspended') continue;
      const [byUser] = await this.store.listMembers({ institutionId: invite.institutionId, userId: user.id });
      if (byUser && byUser.id !== invite.id) {
        // Sudah punya keanggotaan lain di institusi ini: undangan admin menggabungkannya (peran admin, aktif kembali).
        const merged = (await this.store.updateMember(byUser.id, {
          status: 'active',
          role: invite.role === 'admin' ? 'admin' : byUser.role,
          groupLabel: invite.groupLabel ?? byUser.groupLabel,
          disabledAt: null,
          disabledBy: null,
          expiresAt: null
        })) ?? byUser;
        await this.store.updateMember(invite.id, { status: 'disabled', disabledAt: this.nowIso(), disabledBy: 'system' }, ['invited']);
        await this.grantMemberAccess(merged);
        joined.push(merged);
        continue;
      }
      const { member } = await this.activate(institution, user, 'invite');
      joined.push(member);
    }
    return joined;
  }

  async joinByDomain(user: AuthUser, slug: string) {
    const institution = await this.store.getInstitutionBySlug(slug);
    if (!institution) throw httpError(404, 'institution_not_found', 'Institusi tidak ditemukan.');
    this.assertJoinable(institution);
    const email = await this.verifiedEmail(user);
    if (!email) throw httpError(403, 'email_unverified', 'Verifikasi email Anda terlebih dahulu, lalu coba lagi.');
    const candidates = emailDomainCandidates(email);
    if (!institution.emailDomains.some((d) => candidates.includes(d))) {
      throw httpError(403, 'domain_mismatch', `Email Anda tidak termasuk domain ${institution.name}.`, { domains: institution.emailDomains });
    }
    return { institution, ...(await this.activate(institution, user, 'domain')) };
  }

  async joinByCode(user: AuthUser, rawCode: unknown) {
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!JOIN_CODE_RE.test(code)) throw httpError(400, 'invalid_code', 'Format kode gabung tidak valid.');
    const record = await this.store.getJoinCodeByCode(code);
    if (!record) throw httpError(404, 'code_not_found', 'Kode gabung tidak ditemukan.');
    const institution = await this.service.requireInstitution(record.institutionId);
    this.assertJoinable(institution);
    const [existing] = await this.store.listMembers({ institutionId: institution.id, userId: user.id });
    if (existing?.status === 'active' && !existing.expiresAt) {
      // Sudah anggota: kuota kode tidak dipakai.
      await this.grantMemberAccess(existing);
      return { institution, member: existing, created: false };
    }
    if (existing?.status === 'disabled' && existing.disabledBy === 'admin') {
      throw httpError(403, 'member_disabled', 'Keanggotaan Anda di institusi ini dinonaktifkan oleh admin institusi.');
    }
    const used = await this.store.useJoinCode(code, this.nowIso());
    if (!used) throw httpError(410, 'code_unavailable', 'Kode gabung sudah kedaluwarsa, dinonaktifkan, atau kuotanya habis.');
    return { institution, ...(await this.activate(institution, user, 'code', { groupLabel: used.groupLabel })) };
  }

  async joinByIp(user: AuthUser, ip: string | null) {
    if (!this.ctx.config.institution.ipAccessEnabled) throw httpError(404, 'ip_access_disabled', 'Akses lewat jaringan institusi tidak aktif.');
    const institution = ip
      ? (await this.store.listInstitutionsWithIpRanges()).find((i) => JOINABLE.includes(i.status) && (i.ipRanges ?? []).some((range) => ipInCidr(ip, range)))
      : undefined;
    if (!institution) throw httpError(403, 'ip_not_recognized', 'Jaringan Anda tidak dikenali sebagai jaringan institusi berlangganan.');
    const hours = (await this.service.config()).ipGuestSessionHours;
    const expiresAt = new Date(this.ctx.now().getTime() + hours * 3_600_000).toISOString();
    return { institution, ...(await this.activate(institution, user, 'ip', { expiresAt })) };
  }

  async leave(user: AuthUser, institutionId: string): Promise<MemberRecord> {
    const [member] = await this.store.listMembers({ institutionId, userId: user.id, statuses: ['active'] });
    if (!member) throw httpError(404, 'member_not_found', 'Anda bukan anggota institusi ini.');
    const updated = await this.store.updateMember(member.id, { status: 'disabled', disabledAt: this.nowIso(), disabledBy: 'member' }, ['active']);
    if (!updated) throw httpError(409, 'state_changed', 'Status keanggotaan berubah. Muat ulang halaman.');
    await this.revokeMemberAccess(updated, 'member_left');
    await this.service.event(institutionId, null, 'member_left', { memberId: member.id });
    return updated;
  }

  /** Ringkasan untuk pengguna: keanggotaan aktif + institusi yang bisa diikuti lewat domain email. */
  async me(user: AuthUser) {
    const accepted = await this.acceptInvites(user);
    const now = this.ctx.now().getTime();
    const all = await this.store.listMembers({ userId: user.id });
    const memberships: MembershipSummary[] = [];
    for (const m of all) {
      if (m.status !== 'active' || (m.expiresAt && Date.parse(m.expiresAt) <= now)) continue;
      const institution = await this.store.getInstitution(m.institutionId);
      if (!institution) continue;
      const running = (await this.accessContracts(m.institutionId)).find((c) => RUNNING_CONTRACT_STATUSES.includes(c.status)) ?? null;
      memberships.push({
        institution: publicInstitution(institution),
        memberId: m.id,
        role: m.role,
        joinedVia: m.joinedVia,
        groupLabel: m.groupLabel,
        expiresAt: m.expiresAt,
        access: running && institution.status !== 'suspended'
          ? {
            status: running.status,
            trial: running.isTrial,
            accessEndsAt: m.expiresAt && Date.parse(m.expiresAt) < Date.parse(this.service.accessEndsAt(running)) ? m.expiresAt : this.service.accessEndsAt(running),
            concurrentUsers: running.concurrentUsers,
            collection: running.collectionScope
          }
          : null
      });
    }
    const email = await this.verifiedEmail(user);
    const blocked = new Set(all.filter((m) => m.status === 'active' || (m.status === 'disabled' && m.disabledBy === 'admin')).map((m) => m.institutionId));
    const domainOffers = email
      ? (await this.store.listInstitutionsByDomains(emailDomainCandidates(email)))
        .filter((i) => JOINABLE.includes(i.status) && !blocked.has(i.id))
        .map(publicInstitution)
      : [];
    return {
      memberships,
      joinedNow: accepted.map((m) => m.institutionId),
      domainOffers,
      emailVerified: Boolean(email),
      ipAccess: this.ctx.config.institution.ipAccessEnabled
    };
  }

  // ---- Pengelolaan anggota (admin institusi & admin CakraNexa)
  /** Kursi admin = kontrak berjalan (atau kontrak terakhir yang tidak dibatalkan); prospek tanpa kontrak = 1 kursi. */
  private async assertAdminSeats(institution: InstitutionRecord, adding: number, exceptMemberId?: string) {
    const contracts = (await this.store.listContracts({ institutionId: institution.id })).filter((c) => c.status !== 'canceled');
    const contract = contracts.find((c) => RUNNING_CONTRACT_STATUSES.includes(c.status)) ?? contracts[0] ?? null;
    const seats = contract?.adminSeats ?? 1;
    const admins = (await this.store.listMembers({ institutionId: institution.id, roles: ['admin'], statuses: ['active', 'invited'] }))
      .filter((m) => m.id !== exceptMemberId).length;
    if (admins + adding > seats) throw httpError(409, 'admin_seats_full', `Kursi admin institusi penuh (${admins}/${seats}).`, { admins, seats });
  }

  private sendInvite(institution: InstitutionRecord, member: MemberRecord) {
    if (!member.invitedEmail) return;
    const prefix = institution.language === 'en' ? '/en' : '';
    const email = memberInviteEmail({
      language: institution.language,
      institutionName: institution.name,
      email: member.invitedEmail,
      role: member.role,
      joinUrl: `${this.ctx.config.siteUrl}${prefix}/institutions/join/${encodeURIComponent(institution.slug)}?invite=1`
    });
    const to = member.invitedEmail;
    this.ctx.defer(async () => {
      await this.ctx.mailer.send({ to: [to], subject: email.subject, html: email.html });
    });
  }

  async invite(institution: InstitutionRecord, input: { emails: unknown; role: MemberRole; groupLabel: string | null; invitedBy: string }) {
    if (institution.status === 'suspended') throw httpError(409, 'institution_suspended', 'Institusi sedang ditangguhkan.');
    const { valid, invalid } = parseEmailList(input.emails);
    if (valid.length === 0) throw httpError(400, 'no_emails', 'Tidak ada alamat email yang valid.', { invalid });
    if (valid.length > MAX_INVITES) throw httpError(400, 'too_many_emails', `Maksimal ${MAX_INVITES} email per unggahan.`);
    const pending: string[] = [];
    const skipped: Array<{ email: string; reason: 'already_invited' | 'already_member' }> = [];
    let reactivated = 0;
    const invitedRows: MemberRecord[] = [];
    for (const email of valid) {
      const [existing] = await this.store.listMembers({ institutionId: institution.id, invitedEmail: email });
      if (!existing) {
        pending.push(email);
        continue;
      }
      if (existing.status === 'invited') skipped.push({ email, reason: 'already_invited' });
      else if (existing.status === 'active') skipped.push({ email, reason: 'already_member' });
      else if (existing.userId) {
        // Undangan ulang untuk anggota nonaktif yang sudah punya akun = aktifkan kembali.
        const member = await this.setStatus(institution, existing, 'active', input.invitedBy);
        if (member.status === 'active') reactivated += 1;
      } else {
        const again = await this.store.updateMember(existing.id, { status: 'invited', invitedAt: this.nowIso(), invitedBy: input.invitedBy, disabledAt: null, disabledBy: null, role: input.role }, ['disabled']);
        if (again) invitedRows.push(again);
      }
    }
    if (input.role === 'admin') await this.assertAdminSeats(institution, pending.length + invitedRows.length);
    for (const email of pending) {
      try {
        invitedRows.push(await this.store.insertMember({
          institutionId: institution.id,
          userId: null,
          role: input.role,
          status: 'invited',
          invitedEmail: email,
          invitedAt: this.nowIso(),
          invitedBy: input.invitedBy,
          joinedAt: null,
          joinedVia: null,
          groupLabel: input.groupLabel,
          disabledAt: null,
          expiresAt: null
        }));
      } catch (err) {
        if (!(err instanceof ConflictError)) throw err;
        skipped.push({ email, reason: 'already_invited' });
      }
    }
    for (const member of invitedRows) this.sendInvite(institution, member);
    if (invitedRows.length > 0 || reactivated > 0) {
      await this.service.event(institution.id, null, 'members_invited', { count: invitedRows.length, reactivated, role: input.role, by: input.invitedBy });
    }
    return { invited: invitedRows.length, reactivated, skipped, invalid };
  }

  async resendInvite(institution: InstitutionRecord, member: MemberRecord, by: string): Promise<MemberRecord> {
    if (member.status !== 'invited' || !member.invitedEmail) throw httpError(409, 'not_invited', 'Hanya undangan yang belum diterima yang bisa dikirim ulang.');
    const updated = (await this.store.updateMember(member.id, { invitedAt: this.nowIso(), invitedBy: by }, ['invited'])) ?? member;
    this.sendInvite(institution, updated);
    return updated;
  }

  async setRole(institution: InstitutionRecord, member: MemberRecord, role: MemberRole, by: string): Promise<MemberRecord> {
    if (member.role === role) return member;
    if (role === 'admin') await this.assertAdminSeats(institution, 1, member.id);
    const updated = await this.store.updateMember(member.id, { role });
    if (!updated) throw httpError(404, 'member_not_found', 'Anggota tidak ditemukan.');
    await this.service.event(institution.id, null, 'member_role_changed', { memberId: member.id, role, by });
    return updated;
  }

  async setStatus(institution: InstitutionRecord, member: MemberRecord, status: 'active' | 'disabled', by: string): Promise<MemberRecord> {
    if (status === 'disabled') {
      if (member.status === 'disabled' && member.disabledBy === 'admin') return member;
      const updated = await this.store.updateMember(member.id, { status: 'disabled', disabledAt: this.nowIso(), disabledBy: 'admin' });
      if (!updated) throw httpError(404, 'member_not_found', 'Anggota tidak ditemukan.');
      await this.revokeMemberAccess(updated, 'member_disabled');
      await this.service.event(institution.id, null, 'member_disabled', { memberId: member.id, by });
      return updated;
    }
    if (member.status === 'active') return member;
    if (member.role === 'admin') await this.assertAdminSeats(institution, 1, member.id);
    const updated = await this.store.updateMember(member.id, {
      status: member.userId ? 'active' : 'invited',
      disabledAt: null,
      disabledBy: null,
      ...(member.userId ? { joinedAt: member.joinedAt ?? this.nowIso() } : { invitedAt: this.nowIso() })
    });
    if (!updated) throw httpError(404, 'member_not_found', 'Anggota tidak ditemukan.');
    if (updated.status === 'active') await this.grantMemberAccess(updated);
    else this.sendInvite(institution, updated);
    await this.service.event(institution.id, null, 'member_enabled', { memberId: member.id, by });
    return updated;
  }

  async setGroup(member: MemberRecord, groupLabel: string | null): Promise<MemberRecord> {
    return (await this.store.updateMember(member.id, { groupLabel })) ?? member;
  }

  /** Daftar anggota untuk admin: email/nama dari akun, tanpa aktivitas baca individu. */
  async listView(institutionId: string, filter: { status?: MemberStatus; q?: string } = {}): Promise<MemberView[]> {
    const members = await this.store.listMembers({ institutionId, ...(filter.status ? { statuses: [filter.status] } : {}) });
    const ids = members.map((m) => m.userId).filter((id): id is string => Boolean(id));
    const profiles = new Map<string, UserProfile>((await this.ctx.store.getUserProfiles(ids)).map((p) => [p.id, p]));
    const q = (filter.q ?? '').trim().toLowerCase();
    return members
      .map((m): MemberView => ({
        id: m.id,
        userId: m.userId,
        email: (m.userId ? profiles.get(m.userId)?.email : null) ?? m.invitedEmail,
        name: m.userId ? profiles.get(m.userId)?.fullName ?? null : null,
        role: m.role,
        status: m.status,
        joinedVia: m.joinedVia,
        groupLabel: m.groupLabel,
        invitedAt: m.invitedAt,
        joinedAt: m.joinedAt,
        disabledAt: m.disabledAt,
        disabledBy: m.disabledBy,
        expiresAt: m.expiresAt
      }))
      .filter((m) => !q || (m.email ?? '').toLowerCase().includes(q) || (m.name ?? '').toLowerCase().includes(q) || (m.groupLabel ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.role === b.role ? (a.email ?? '').localeCompare(b.email ?? '') : a.role === 'admin' ? -1 : 1));
  }

  // ---- Kode gabung
  async createCode(institution: InstitutionRecord, input: { code: string | null; expiresAt: string | null; maxUses: number | null; groupLabel: string | null; createdBy: string }): Promise<JoinCodeRecord> {
    if (institution.status === 'suspended') throw httpError(409, 'institution_suspended', 'Institusi sedang ditangguhkan.');
    const base = institution.slug.replace(/-/g, '').slice(0, 10).toUpperCase() || 'KODE';
    const code = (input.code ?? `${base}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`).trim().toUpperCase();
    if (!JOIN_CODE_RE.test(code)) throw httpError(400, 'invalid_code', 'Kode 4–40 karakter: huruf besar, angka, dan tanda hubung.');
    try {
      const record = await this.store.createJoinCode({ institutionId: institution.id, code, expiresAt: input.expiresAt, maxUses: input.maxUses, groupLabel: input.groupLabel, createdBy: input.createdBy });
      await this.service.event(institution.id, null, 'join_code_created', { code, maxUses: input.maxUses, expiresAt: input.expiresAt, by: input.createdBy });
      return record;
    } catch (err) {
      if (err instanceof ConflictError) throw httpError(409, 'code_taken', 'Kode sudah dipakai. Pilih kode lain.');
      throw err;
    }
  }

  async disableCode(institution: InstitutionRecord, codeId: string): Promise<JoinCodeRecord> {
    const record = (await this.store.listJoinCodes(institution.id)).find((c) => c.id === codeId);
    if (!record) throw httpError(404, 'code_not_found', 'Kode gabung tidak ditemukan.');
    return (await this.store.disableJoinCode(record.id, this.nowIso())) ?? record;
  }
}
