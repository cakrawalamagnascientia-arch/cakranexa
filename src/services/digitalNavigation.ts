import { buildPath } from '../utils/router';
import type { DigitalFormat } from '../types';

/**
 * Navigasi ke halaman internal dari komponen mana pun tanpa prop drilling: URL diganti lalu App menerapkannya
 * lewat handler Back/Forward (popstate) yang sama.
 */
export const navigateToAppPath = (path: string): void => {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
};

export const goToDigitalCheckout = (productIds: string[]): void =>
  navigateToAppPath(buildPath({ page: 'digital', subSection: 'checkout', query: `items=${productIds.map(encodeURIComponent).join(',')}` }));

export const goToDigitalOrder = (orderNumber: string): void =>
  navigateToAppPath(buildPath({ page: 'digital', subSection: 'checkout', query: `order=${encodeURIComponent(orderNumber)}` }));

/** Ke halaman masuk; setelah login pengguna dikembalikan ke `nextPath` (default: halaman saat ini). */
export const goToLogin = (nextPath: string = window.location.pathname + window.location.search, mode: 'login' | 'register' = 'login'): void =>
  navigateToAppPath(buildPath({ page: 'account', subSection: mode, query: `next=${encodeURIComponent(nextPath)}` }));

export const libraryItemPath = (format: DigitalFormat, productId: string): string =>
  buildPath({ page: 'library', subSection: format === 'ebook' ? 'read' : 'listen', digitalItem: productId });

export const goToLibraryItem = (format: DigitalFormat, productId: string): void => navigateToAppPath(libraryItemPath(format, productId));

export const goToLibrary = (): void => navigateToAppPath(buildPath({ page: 'library' }));

/** Beranda digital fase 6 (/digital). */
export const goToDigitalHome = (): void => navigateToAppPath(buildPath({ page: 'digital' }));

/** Daftar e-book/audiobook, opsional terfilter kategori (/digital/<format>?kategori=...). */
export const goToDigitalListing = (format: DigitalFormat, category?: string): void =>
  navigateToAppPath(buildPath({ page: 'digital', subSection: format, query: category ? `kategori=${encodeURIComponent(category)}` : undefined }));

export const goToMembership = (): void => navigateToAppPath(buildPath({ page: 'membership' }));

export const goToMembershipCheckout = (planCode: string, cycle: 'monthly' | 'yearly'): void =>
  navigateToAppPath(buildPath({ page: 'membership', subSection: 'checkout', query: `plan=${encodeURIComponent(planCode)}&cycle=${cycle}` }));

export const membershipTermsPath = (): string => buildPath({ page: 'membership', subSection: 'terms' });

export const goToMembershipTerms = (): void => navigateToAppPath(membershipTermsPath());

/** Fase 6: instruksi transfer keanggotaan (nominal berkode unik, rekening, bukti, status). */
export const membershipInvoicePath = (invoiceId: string): string => buildPath({ page: 'membership', subSection: 'invoice', digitalItem: invoiceId });
export const goToMembershipInvoice = (invoiceId: string): void => navigateToAppPath(membershipInvoicePath(invoiceId));

/** Fase 6: layar "Pilih buku bulan ini". */
export const goToPickScreen = (): void => navigateToAppPath(buildPath({ page: 'library', subSection: 'pick' }));

export const goToAccountMembership = (query = ''): void =>
  navigateToAppPath(buildPath({ page: 'account', subSection: 'membership', query }));

/** Setelah pembayaran keanggotaan pertama: Pustaka Saya dengan onboarding singkat. */
export const goToLibraryWelcome = (): void => navigateToAppPath(buildPath({ page: 'library', query: 'welcome=1' }));

export const goToContact = (): void => navigateToAppPath(buildPath({ page: 'kontak' }));
