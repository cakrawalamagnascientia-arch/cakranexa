import React from 'react';
import { BookOpen, Headphones, TabletSmartphone, type LucideIcon } from 'lucide-react';
import type { BookFormat } from '../../types';

export const FORMAT_ICONS: Record<BookFormat, LucideIcon> = {
  print: BookOpen,
  ebook: TabletSmartphone,
  audiobook: Headphones
};

interface FormatIconProps {
  format: BookFormat;
  className?: string;
  /** Label untuk pembaca layar dan tooltip; tanpa label ikon dianggap dekoratif. */
  label?: string;
}

export const FormatIcon: React.FC<FormatIconProps> = ({ format, className = 'w-3.5 h-3.5', label }) => {
  const Icon = FORMAT_ICONS[format];
  // Label lewat aria-label (bukan teks sr-only): elemen sr-only berposisi absolute bisa lolos dari
  // kontainer scroll (mis. carousel buku) dan melebarkan halaman di ponsel.
  return (
    <span
      className="inline-flex shrink-0"
      title={label}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon className={className} aria-hidden="true" />
    </span>
  );
};
