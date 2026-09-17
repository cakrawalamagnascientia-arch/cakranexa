import { ManuscriptConflictError } from './store';
import { ManuscriptError } from './service';
import { normalizeEmail, type AuthorAccount, type AuthorLinkLog, type ManuscriptAdminStore } from './adminStore';

/**
 * Penautan akun login ke penulis (authors.user_id) untuk dashboard /author.
 *  - Otomatis hanya bila: email akun sudah dikonfirmasi di Supabase Auth, sama dengan authors.email (tanpa beda huruf
 *    besar/kecil), tepat satu penulis cocok, user_id penulis masih kosong, dan admin belum pernah melepas pasangan
 *    penulis–akun itu. Nilai yang ditetapkan admin tidak pernah ditimpa.
 *  - Admin bisa menautkan (id akun atau email) dan melepas tautan. Setiap tautan/pelepasan dicatat.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (status: number, code: string, message: string) => new ManuscriptError(status, code, message);

export class AuthorLinkService {
  constructor(private readonly deps: { store: ManuscriptAdminStore; log?: Pick<Console, 'info' | 'warn'> }) {}

  private get log() {
    return this.deps.log ?? console;
  }

  /** Dipanggil saat penulis membuka dashboard. null = akun ini bukan (atau belum boleh ditautkan ke) penulis. */
  async autoLink(userId: string): Promise<AuthorAccount | null> {
    const store = this.deps.store;
    const existing = await store.findAuthorByUserId(userId);
    if (existing) return existing;
    const account = await store.getLoginAccount(userId);
    if (!account || !account.verified) return null;
    const email = normalizeEmail(account.email);
    if (!email) return null;
    const candidates = await store.findAuthorsByEmail(email);
    if (candidates.length !== 1) {
      if (candidates.length > 1) this.log.warn('[author-link] email cocok dengan lebih dari satu penulis; tidak ditautkan otomatis:', { email, authors: candidates.map((a) => a.id) });
      return null;
    }
    const target = candidates[0];
    if (target.userId) return null;
    const history = await store.listAuthorLinks(target.id);
    if (history.some((entry) => entry.action === 'unlink' && entry.userId === userId)) return null;
    let linked: AuthorAccount | null;
    try {
      linked = await store.setAuthorUser(target.id, userId, 'auto_email', null);
    } catch (err) {
      if (err instanceof ManuscriptConflictError) return null;
      throw err;
    }
    if (!linked) return null;
    await store.logAuthorLink({ authorId: target.id, userId, action: 'link', source: 'auto_email', actor: email });
    this.log.info('[author-link] akun ditautkan otomatis ke penulis:', { authorId: target.id, userId, email });
    return linked;
  }

  async adminLink(authorId: string, input: Record<string, unknown>, actor: string): Promise<AuthorAccount> {
    const store = this.deps.store;
    const author = await store.getAuthorAccount(authorId);
    if (!author) throw fail(404, 'author_not_found', 'Penulis tidak ditemukan.');
    if (author.userId) throw fail(409, 'author_linked', 'Penulis ini sudah tertaut ke akun lain. Lepas tautan terlebih dahulu.');
    const rawId = String(input?.userId ?? '').trim();
    const rawEmail = String(input?.email ?? '').trim();
    const account = rawId
      ? (UUID_RE.test(rawId) ? await store.getLoginAccount(rawId) : null)
      : rawEmail ? await store.findLoginAccountByEmail(rawEmail) : null;
    if (!rawId && !rawEmail) throw fail(400, 'account_required', 'Isi email atau ID akun login penulis.');
    if (!account) throw fail(404, 'account_not_found', 'Akun login tidak ditemukan. Penulis perlu mendaftar terlebih dahulu.');
    let linked: AuthorAccount | null;
    try {
      linked = await store.setAuthorUser(authorId, account.id, 'admin', null);
    } catch (err) {
      if (err instanceof ManuscriptConflictError) throw fail(409, 'account_linked', 'Akun ini sudah tertaut ke penulis lain.');
      throw err;
    }
    if (!linked) throw fail(409, 'state_changed', 'Data penulis berubah. Muat ulang.');
    await store.logAuthorLink({ authorId, userId: account.id, action: 'link', source: 'admin', actor });
    this.log.info('[author-link] admin menautkan akun ke penulis:', { authorId, userId: account.id, actor });
    return linked;
  }

  async adminUnlink(authorId: string, actor: string): Promise<AuthorAccount> {
    const store = this.deps.store;
    const author = await store.getAuthorAccount(authorId);
    if (!author) throw fail(404, 'author_not_found', 'Penulis tidak ditemukan.');
    if (!author.userId) throw fail(409, 'author_not_linked', 'Penulis ini belum tertaut ke akun login.');
    const unlinked = await store.setAuthorUser(authorId, null, null, author.userId);
    if (!unlinked) throw fail(409, 'state_changed', 'Data penulis berubah. Muat ulang.');
    await store.logAuthorLink({ authorId, userId: author.userId, action: 'unlink', source: 'admin', actor });
    this.log.info('[author-link] admin melepas tautan akun penulis:', { authorId, userId: author.userId, actor });
    return unlinked;
  }

  links(authorId: string): Promise<AuthorLinkLog[]> {
    return this.deps.store.listAuthorLinks(authorId);
  }
}
