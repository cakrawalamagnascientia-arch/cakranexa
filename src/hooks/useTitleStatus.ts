import { useCallback, useEffect, useState } from 'react';
import { useMemberSession } from '../services/memberSession';
import { getTitleStatus, type TitleStatus } from '../services/membershipApi';

export type TitleStatusState =
  | { kind: 'guest' }
  | { kind: 'loading' }
  | { kind: 'ready'; status: TitleStatus }
  | { kind: 'error' };

/**
 * Status tombol utama halaman buku digital untuk pengguna yang sedang login (fase 6 Langkah 3).
 * Pengunjung tidak memanggil API; kegagalan jaringan menampilkan tombol sampel + paket (aman, tanpa klaim akses).
 */
export const useTitleStatus = (productId: string | null): { state: TitleStatusState; reload: () => void } => {
  const member = useMemberSession();
  const [state, setState] = useState<TitleStatusState>({ kind: member.isLoggedIn ? 'loading' : 'guest' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!productId || member.isLoading) return;
    if (!member.isLoggedIn) {
      setState({ kind: 'guest' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });
    getTitleStatus(productId)
      .then((status) => { if (!cancelled) setState({ kind: 'ready', status }); })
      .catch(() => { if (!cancelled) setState({ kind: 'error' }); });
    return () => { cancelled = true; };
  }, [productId, member.isLoggedIn, member.isLoading, member.userId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
};
