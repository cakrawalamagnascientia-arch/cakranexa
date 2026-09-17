import type { SupabaseClient } from '@supabase/supabase-js';
import { ManuscriptConflictError } from './store';
import {
  normalizeEmail,
  type AuthorAccount,
  type AuthorLinkLog,
  type AuthorLinkSource,
  type LoginAccount,
  type ManuscriptAdminStore,
  type ReminderKind
} from './adminStore';
import type { ManuscriptAddendum, NewManuscriptAddendum } from './addenda';

const iso = (value: unknown): string | null => (value ? new Date(String(value)).toISOString() : null);
const day = (value: unknown): string => String(value ?? '').slice(0, 10);
const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

const check = <T>(result: { data: T; error: { code?: string; message: string } | null }, what: string): T => {
  if (result.error) {
    if (result.error.code === '23505') throw new ManuscriptConflictError(`${what}: ${result.error.message}`);
    throw new Error(`Supabase ${what}: ${result.error.message}`);
  }
  return result.data;
};

const RIGHT_COLUMNS = {
  print: 'rights_print',
  ebook: 'rights_ebook',
  audiobook: 'rights_audiobook',
  translation: 'rights_translation',
  derivative: 'rights_derivative'
} as const;

const toAddendum = (r: any): ManuscriptAddendum => {
  const rights: ManuscriptAddendum['changes']['rights'] = {};
  for (const [key, column] of Object.entries(RIGHT_COLUMNS)) {
    if (r[column] !== null && r[column] !== undefined) rights[key as keyof typeof RIGHT_COLUMNS] = Boolean(r[column]);
  }
  return {
    id: r.id,
    contractId: r.contract_id,
    addendumNumber: r.addendum_number,
    signedAt: day(r.signed_at),
    changes: {
      rights,
      termYears: nullableNumber(r.term_years),
      honorTotal: nullableNumber(r.honor_total),
      revisionFeePerEdition: nullableNumber(r.revision_fee_per_edition)
    },
    description: r.description,
    filePath: r.file_path ?? null,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!
  };
};

const AUTHOR_COLUMNS = 'id, name, email, user_id, user_link_source, user_linked_at';

const toAuthor = (r: any): AuthorAccount => ({
  id: r.id,
  name: r.name,
  email: r.email ?? null,
  userId: r.user_id ?? null,
  userLinkSource: r.user_link_source ?? null,
  userLinkedAt: iso(r.user_linked_at)
});

const toLink = (r: any): AuthorLinkLog => ({
  id: String(r.id),
  authorId: r.author_id,
  userId: r.user_id,
  action: r.action,
  source: r.source,
  actor: r.actor ?? null,
  createdAt: iso(r.created_at)!
});

/** Pola ILIKE tanpa wildcard: email dicocokkan persis (tanpa beda huruf besar/kecil). */
const likeLiteral = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export class SupabaseManuscriptAdminStore implements ManuscriptAdminStore {
  readonly kind = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  async createAddendum(row: NewManuscriptAddendum) {
    const record: Record<string, unknown> = {
      contract_id: row.contractId,
      addendum_number: row.addendumNumber,
      signed_at: row.signedAt,
      term_years: row.changes.termYears,
      honor_total: row.changes.honorTotal,
      revision_fee_per_edition: row.changes.revisionFeePerEdition,
      description: row.description,
      file_path: row.filePath
    };
    for (const [key, column] of Object.entries(RIGHT_COLUMNS)) {
      record[column] = row.changes.rights[key as keyof typeof RIGHT_COLUMNS] ?? null;
    }
    const data = check(await this.client.from('manuscript_contract_addenda').insert(record).select('*').single(), 'manuscript_contract_addenda insert');
    return toAddendum(data);
  }

  async getAddendum(id: string) {
    const data = check(await this.client.from('manuscript_contract_addenda').select('*').eq('id', id).maybeSingle(), 'manuscript_contract_addenda');
    return data ? toAddendum(data) : null;
  }

  async listAddenda(contractIds: string[]) {
    if (contractIds.length === 0) return [];
    const data = check(await this.client.from('manuscript_contract_addenda').select('*').in('contract_id', contractIds)
      .order('signed_at', { ascending: true }).order('created_at', { ascending: true }), 'manuscript_contract_addenda');
    return (data ?? []).map(toAddendum);
  }

  async setAddendumFile(id: string, objectPath: string) {
    const data = check(await this.client.from('manuscript_contract_addenda').update({ file_path: objectPath }).eq('id', id).select('*').maybeSingle(), 'manuscript_contract_addenda update');
    return data ? toAddendum(data) : null;
  }

  async listAuthorAccounts() {
    const data = check(await this.client.from('authors').select(AUTHOR_COLUMNS).order('name', { ascending: true }), 'authors');
    return (data ?? []).map(toAuthor);
  }

  async getAuthorAccount(id: string) {
    const data = check(await this.client.from('authors').select(AUTHOR_COLUMNS).eq('id', id).maybeSingle(), 'authors');
    return data ? toAuthor(data) : null;
  }

  async findAuthorsByEmail(email: string) {
    const key = normalizeEmail(email);
    if (!key) return [];
    const data = check(await this.client.from('authors').select(AUTHOR_COLUMNS).ilike('email', likeLiteral(key)), 'authors');
    return (data ?? []).map(toAuthor).filter((a) => normalizeEmail(a.email) === key);
  }

  async findAuthorByUserId(userId: string) {
    const data = check(await this.client.from('authors').select(AUTHOR_COLUMNS).eq('user_id', userId).maybeSingle(), 'authors');
    return data ? toAuthor(data) : null;
  }

  async setAuthorUser(authorId: string, userId: string | null, source: AuthorLinkSource | null, expectedUserId: string | null) {
    let query = this.client.from('authors').update({
      user_id: userId,
      user_link_source: userId ? source : null,
      user_linked_at: userId ? new Date().toISOString() : null
    }).eq('id', authorId);
    query = expectedUserId === null ? query.is('user_id', null) : query.eq('user_id', expectedUserId);
    const data = check(await query.select(AUTHOR_COLUMNS).maybeSingle(), 'authors update user_id');
    return data ? toAuthor(data) : null;
  }

  async logAuthorLink(entry: Omit<AuthorLinkLog, 'id' | 'createdAt'>) {
    check(await this.client.from('author_account_links').insert({
      author_id: entry.authorId,
      user_id: entry.userId,
      action: entry.action,
      source: entry.source,
      actor: entry.actor
    }), 'author_account_links insert');
  }

  async listAuthorLinks(authorId: string) {
    const data = check(await this.client.from('author_account_links').select('*').eq('author_id', authorId)
      .order('created_at', { ascending: false }).limit(100), 'author_account_links');
    return (data ?? []).map(toLink);
  }

  async markReminderSent(kind: ReminderKind, refId: string, refDate: string) {
    const { error } = await this.client.from('manuscript_reminders').insert({ kind, ref_id: refId, ref_date: refDate });
    if (!error) return true;
    if (error.code === '23505') return false;
    throw new Error(`Supabase manuscript_reminders insert: ${error.message}`);
  }

  async getLoginAccount(userId: string): Promise<LoginAccount | null> {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error) {
      if (/not found/i.test(error.message)) return null;
      throw new Error(`Supabase getUserById: ${error.message}`);
    }
    const user = data?.user;
    return user ? { id: user.id, email: String(user.email || ''), verified: Boolean(user.email_confirmed_at) } : null;
  }

  /** Supabase Auth tidak punya pencarian per email: telusuri halaman akun (maks. 20.000 akun). */
  async findLoginAccountByEmail(email: string): Promise<LoginAccount | null> {
    const key = normalizeEmail(email);
    if (!key) return null;
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await this.client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`Supabase listUsers: ${error.message}`);
      const users = data?.users ?? [];
      const found = users.find((u) => normalizeEmail(u.email) === key);
      if (found) return { id: found.id, email: String(found.email || ''), verified: Boolean(found.email_confirmed_at) };
      if (users.length < 1000) break;
    }
    return null;
  }
}
