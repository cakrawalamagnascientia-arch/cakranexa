import { useEffect, useState } from 'react';
import { useMemberSession } from '../services/memberSession';
import { getMembershipPlans, type MembershipPlans } from '../services/membershipApi';
import { FALLBACK_MEMBERSHIP } from '../data/membership';

/**
 * Paket keanggotaan dari server (harga, sisa kursi Founding, manfaat sesuai flag, paket pengguna).
 * Bila API tidak tersedia, memakai data cadangan dengan pendaftaran tertutup (`live: false`).
 */
export const useMembershipPlans = (): { data: MembershipPlans; loading: boolean; live: boolean } => {
  const member = useMemberSession();
  const [state, setState] = useState<{ data: MembershipPlans; live: boolean } | null>(null);

  useEffect(() => {
    if (member.isLoading) return;
    let active = true;
    getMembershipPlans()
      .then((data) => {
        if (active) setState({ data, live: true });
      })
      .catch(() => {
        if (active) setState({ data: FALLBACK_MEMBERSHIP, live: false });
      });
    return () => {
      active = false;
    };
  }, [member.isLoading, member.userId]);

  return { data: state?.data ?? FALLBACK_MEMBERSHIP, loading: state === null, live: state?.live ?? false };
};
