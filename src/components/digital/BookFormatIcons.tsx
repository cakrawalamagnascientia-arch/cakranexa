import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDigitalCatalog } from '../../hooks/useDigitalCatalog';
import { FormatIcon } from './FormatIcon';

/** Ikon format (cetak / e-book / audiobook) untuk baris metadata kartu buku. Format "Segera" tampil pudar. */
export const BookFormatIcons: React.FC<{ bookId: string }> = ({ bookId }) => {
  const { t } = useTranslation('digital');
  const products = useDigitalCatalog().forBook(bookId);
  const { ebook, audiobook } = products;

  return (
    <span className="flex shrink-0 items-center gap-1 text-slate-500">
      <FormatIcon format="print" className="w-3 h-3" label={t('formatIcons.print')} />
      {ebook && (
        <span className={ebook.availabilityStatus === 'available' ? '' : 'opacity-40'}>
          <FormatIcon
            format="ebook"
            className="w-3 h-3"
            label={ebook.availabilityStatus === 'available' ? t('formatIcons.ebook') : t('formatIcons.ebookSoon')}
          />
        </span>
      )}
      {audiobook && (
        <span className={audiobook.availabilityStatus === 'available' ? '' : 'opacity-40'}>
          <FormatIcon
            format="audiobook"
            className="w-3 h-3"
            label={audiobook.availabilityStatus === 'available' ? t('formatIcons.audiobook') : t('formatIcons.audiobookSoon')}
          />
        </span>
      )}
    </span>
  );
};
