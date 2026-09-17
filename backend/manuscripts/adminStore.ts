import crypto from 'crypto';
import { ManuscriptConflictError } from './store';
import type { ManuscriptAddendum, NewManuscriptAddendum } from './addenda';

/**
 * Data admin fase 5R Langkah 2: addendum, akun login penulis (authors.user_id + log), catatan pengingat, dan
 * pencarian akun Supabase Auth. Implementasi: SupabaseManuscriptAdminStore (produksi) dan memori (tes & dev).
 */

export type AuthorLinkSource = 'admin' | 'auto_email';

export interface AuthorAccount {
  id: string;
  name: string;
  email: string | null;
  userId: string | null;
  userLinkSource: AuthorLinkSource | null;
  userLinkedAt: string | null;
}

export interface AuthorLinkLog {
  id: string;
  authorId: string;
  userId: string;
  action: 'link' | 'unlink';
  source: AuthorLinkSource;
  actor: string | null;
  createdAt: string;
}

export interface LoginAccount {
  id: string;
  email: string;
  verified: boolean;
}

export type ReminderKind = 'payment_due_soon' | 'payment_overdue' | 'rights_revert_12m';

export interface ManuscriptAdminStore {
  readonly kind: 'supabase' | 'memory';

  createAddendum(row: NewManuscriptAddendum): Promise<ManuscriptAddendum>;
  getAddendum(id: string): Promise<ManuscriptAddendum | null>;
  listAddenda(contractIds: string[]): Promise<ManuscriptAddendum[]>;
  setAddendumFile(id: string, objectPath: string): Promise<ManuscriptAddendum | null>;

  listAuthorAccounts(): Promise<AuthorAccount[]>;
  getAuthorAccount(id: string): Promise<AuthorAccount | null>;
  /** Penulis dengan email ini (tanpa beda huruf besar/kecil). */
  findAuthorsByEmail(email: string): Promise<AuthorAccount[]>;
  findAuthorByUserId(userId: string): Promise<AuthorAccount | null>;
  /**
   * Update bersyarat authors.user_id: hanya bila user_id sekarang = expectedUserId (null = kosong).
   * null = tidak cocok; akun yang sudah tertaut ke penulis lain -> ManuscriptConflictError.
   */
  setAuthorUser(authorId: string, userId: string | null, source: AuthorLinkSource | null, expectedUserId: string | null): Promise<AuthorAccount | null>;
  logAuthorLink(entry: Omit<AuthorLinkLog, 'id' | 'createdAt'>): Promise<void>;
  listAuthorLinks(authorId: string): Promise<AuthorLinkLog[]>;

  /** true = baru dicatat (pengingat perlu dikirim); false = sudah pernah. */
  markReminderSent(kind: ReminderKind, refId: string, refDate: string): Promise<boolean>;

  getLoginAccount(userId: string): Promise<LoginAccount | null>;
  findLoginAccountByEmail(email: string): Promise<LoginAccount | null>;
}

export const normalizeEmail = (email: unknown) => String(email ?? '').trim().toLowerCase();

const nowIso = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class MemoryManuscriptAdminStore implements ManuscriptAdminStore {
  readonly kind = 'memory' as const;
  readonly addenda: ManuscriptAddendum[] = [];
  readonly authors: AuthorAccount[] = [];
  readonly links: AuthorLinkLog[] = [];
  readonly reminders = new Set<string>();
  readonly users: LoginAccount[] = [];

  async createAddendum(row: NewManuscriptAddendum) {
    if (this.addenda.some((a) => a.addendumNumber === row.addendumNumber)) throw new ManuscriptConflictError('Nomor addendum sudah dipakai.');
    const at = nowIso();
    const addendum: ManuscriptAddendum = { ...clone(row), id: crypto.randomUUID(), createdAt: at, updatedAt: at };
    this.addenda.push(addendum);
    return clone(addendum);
  }

  async getAddendum(id: string) {
    const found = this.addenda.find((a) => a.id === id);
    return found ? clone(found) : null;
  }

  async listAddenda(contractIds: string[]) {
    return clone(this.addenda.filter((a) => contractIds.includes(a.contractId)));
  }

  async setAddendumFile(id: string, objectPath: string) {
    const found = this.addenda.find((a) => a.id === id);
    if (!found) return null;
    found.filePath = objectPath;
    found.updatedAt = nowIso();
    return clone(found);
  }

  async listAuthorAccounts() {
    return clone([...this.authors].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async getAuthorAccount(id: string) {
    const found = this.authors.find((a) => a.id === id);
    return found ? clone(found) : null;
  }

  async findAuthorsByEmail(email: string) {
    const key = normalizeEmail(email);
    return clone(this.authors.filter((a) => key && normalizeEmail(a.email) === key));
  }

  async findAuthorByUserId(userId: string) {
    const found = this.authors.find((a) => a.userId === userId);
    return found ? clone(found) : null;
  }

  async setAuthorUser(authorId: string, userId: string | null, source: AuthorLinkSource | null, expectedUserId: string | null) {
    const found = this.authors.find((a) => a.id === authorId);
    if (!found || found.userId !== expectedUserId) return null;
    if (userId && this.authors.some((a) => a.id !== authorId && a.userId === userId)) {
      throw new ManuscriptConflictError('Akun ini sudah tertaut ke penulis lain.');
    }
    found.userId = userId;
    found.userLinkSource = userId ? source : null;
    found.userLinkedAt = userId ? nowIso() : null;
    return clone(found);
  }

  async logAuthorLink(entry: Omit<AuthorLinkLog, 'id' | 'createdAt'>) {
    this.links.push({ ...clone(entry), id: String(this.links.length + 1), createdAt: nowIso() });
  }

  async listAuthorLinks(authorId: string) {
    return clone(this.links.filter((l) => l.authorId === authorId).reverse());
  }

  async markReminderSent(kind: ReminderKind, refId: string, refDate: string) {
    const key = `${kind}|${refId}|${refDate}`;
    if (this.reminders.has(key)) return false;
    this.reminders.add(key);
    return true;
  }

  async getLoginAccount(userId: string) {
    const found = this.users.find((u) => u.id === userId);
    return found ? clone(found) : null;
  }

  async findLoginAccountByEmail(email: string) {
    const key = normalizeEmail(email);
    const found = this.users.find((u) => normalizeEmail(u.email) === key);
    return found ? clone(found) : null;
  }
}
