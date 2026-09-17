import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/hooks';
import type { BookFormat } from '../../types';

/** Label format, durasi, dan tanggal rak digital dalam bahasa aktif (fase 6: tanpa harga satuan). */
export const useDigitalFormatters = () => {
  const { t } = useTranslation('digital');
  const { date } = useFormatters();
  return {
    formatLabel: (format: BookFormat): string => t(`formats.${format}`),
    duration: (seconds: number | null): string | null => {
      if (!seconds || seconds <= 0) return null;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.round((seconds % 3600) / 60);
      return hours > 0 ? t('common.durationHoursMinutes', { hours, minutes }) : t('common.durationMinutes', { minutes });
    },
    /** Tanggal YYYY-MM-DD (tanpa zona waktu) sebagai tanggal lokal, mis. "1 Maret 2027". */
    isoDate: (isoDate: string): string => {
      const [year, month, day] = isoDate.split('-').map(Number);
      return date(new Date(year, month - 1, day));
    }
  };
};
