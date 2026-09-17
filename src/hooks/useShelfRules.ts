import { useMemo } from 'react';
import { useMembershipPlans } from './useMembershipPlans';
import { isPaidStatus } from '../services/membershipApi';
import { frontlistDaysByPlan, jakartaToday, viewerFrontlistDays, type ShelfPlanCode } from '../data/digitalShelf';

/**
 * Aturan rak untuk halaman digital: hari ini (WIB), hari frontlist per paket (dari server), dan paket pengguna yang
 * menentukan tanggal "Segera masuk rak". Pengunjung dan Blue memakai tanggal Platinum (paling awal).
 */
export const useShelfRules = (): {
  today: string;
  frontlist: Record<ShelfPlanCode, number>;
  viewer: { plan: ShelfPlanCode; days: number };
  memberPlan: ShelfPlanCode | null;
} => {
  const { data } = useMembershipPlans();
  const frontlist = useMemo(() => frontlistDaysByPlan(data.plans), [data.plans]);
  const current = data.current && isPaidStatus(data.current.status) ? data.current.planCode : null;
  const viewer = viewerFrontlistDays(current, frontlist);
  const memberPlan = current === 'silver' || current === 'gold' || current === 'platinum' ? current : null;
  return { today: jakartaToday(), frontlist, viewer, memberPlan };
};
