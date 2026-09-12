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
  return (
    <span className="inline-flex shrink-0" title={label}>
      <Icon className={className} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
