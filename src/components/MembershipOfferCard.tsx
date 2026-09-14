import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useMemberPrintDiscount } from '../hooks/useMemberPrintDiscount';
import { isMembershipOfferDue, markMembershipOfferShown, readMembershipOfferShownAt } from '../utils/membershipOffer';

interface MembershipOfferCardProps {
  onOpenMembership: () => void;
}

/**
 * Satu tawaran keanggotaan setelah pembelian buku cetak sukses (fase 3 Langkah 6, konversi Free Circle).
 * Paling sering sekali per 30 hari per pengguna; tidak tampil untuk anggota aktif (bila statusnya diketahui).
 */
export const MembershipOfferCard: React.FC<MembershipOfferCardProps> = ({ onOpenMembership }) => {
  const { t } = useTranslation('checkout');
  const membership = useMemberPrintDiscount();
  // Keputusan tampil dikunci sekali, agar kartu tidak langsung hilang setelah waktu tampil dicatat.
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    if (visible !== null || !membership.isResolved) return;
    const now = Date.now();
    const show = membership.isActiveMember !== true && isMembershipOfferDue(readMembershipOfferShownAt(membership.userId), now);
    if (show) markMembershipOfferShown(membership.userId, now);
    setVisible(show);
  }, [visible, membership.isResolved, membership.isActiveMember, membership.userId]);

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-[#DFBF64]/50 bg-amber-50/60 p-4 text-left flex flex-col sm:flex-row sm:items-center gap-3 print:hidden">
      <div className="w-9 h-9 rounded-lg bg-[#0F172A] text-[#DFBF64] flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900">{t('memberOffer.title')}</p>
        <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{t('memberOffer.description')}</p>
      </div>
      <button
        type="button"
        onClick={onOpenMembership}
        className="shrink-0 px-3.5 py-2 rounded-lg bg-[#0F172A] hover:bg-[#1E293B] text-[#DFBF64] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
      >
        <span>{t('memberOffer.cta')}</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
