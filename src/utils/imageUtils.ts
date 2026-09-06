import type React from 'react';
import { toTitleCase } from './formatters';

/**
 * Image Utilities & Error-Free JPG Asset Handler
 * PT CAKRAWALA MAGNA SCIENTIA (CakraNexa)
 * 
 * Ensures all user-supplied JPG images render perfectly without broken icons,
 * with automatic path normalization and elegant high-definition vector fallbacks.
 */

export interface FallbackBookMeta {
  title?: string;
  author?: string;
  category?: string;
  isbn?: string;
  year?: number | string;
}

/**
 * Normalizes any image URL or filename to a valid absolute path or URL.
 * Handles patterns like "book-1.jpg", "images/books/book-1.jpg", "/images/books/book-1.jpg", etc.
 */
export function resolveImageUrl(src?: string | null, defaultType: 'book' | 'banner' | 'logo' | 'blog' | 'payment' = 'book', bookId?: string): string {
  if (!src || typeof src !== 'string' || src.trim() === '') {
    if (defaultType === 'book' && bookId) {
      return `/images/books/${bookId.replace('book-', 'book-')}.jpg`;
    }
    return '';
  }

  const trimmed = src.trim();

  // If already a full URL, protocol-relative, or data-URI, return as-is
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  // If already an absolute path starting with /
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // If relative path like "images/..."
  if (trimmed.startsWith('images/')) {
    return `/${trimmed}`;
  }

  // If simple filename like "book-1.jpg" or "banner-1.jpg"
  if (defaultType === 'book') {
    return `/images/books/${trimmed}`;
  }
  if (defaultType === 'banner') {
    return `/images/banners/${trimmed}`;
  }
  if (defaultType === 'blog') {
    return `/images/blog/${trimmed}`;
  }
  if (defaultType === 'logo') {
    return `/images/logo/${trimmed}`;
  }
  if (defaultType === 'payment') {
    return `/images/payment/${trimmed}`;
  }

  return `/${trimmed}`;
}

/**
 * Generates an ultra-crisp, high-definition SVG data-URI book cover.
 * This guarantees that even if a local JPG file is missing or still being copied,
 * the website renders a prestigious, publication-grade academic cover with zero error.
 */
export function createFallbackBookCoverSvg(meta?: FallbackBookMeta): string {
  const title = toTitleCase(meta?.title || 'Monografi Akademik & Ilmiah');
  const author = meta?.author || 'PT Cakrawala Magna Scientia';
  const category = (meta?.category || 'PERPAJAKAN & HUKUM').toUpperCase();
  const isbn = meta?.isbn || '978-623-8120-XX-X';
  const year = meta?.year || new Date().getFullYear();

  // Escape special XML characters
  const escapeXml = (str: string) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  const safeTitle = escapeXml(title);
  const safeAuthor = escapeXml(author);
  const safeCategory = escapeXml(category);
  const safeIsbn = escapeXml(isbn);

  // Split title into lines for clean multi-line display
  const words = safeTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 24) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + ' ' + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine);

  const titleLinesSvg = lines.slice(0, 4).map((line, idx) => 
    `<text x="300" y="${320 + idx * 38}" font-family="Cinzel, Georgia, serif" font-size="24" font-weight="bold" fill="#DFBF64" text-anchor="middle" letter-spacing="1.5">${line}</text>`
  ).join('');

  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 850" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#080D1A" />
        <stop offset="50%" stop-color="#0F172A" />
        <stop offset="100%" stop-color="#050811" />
      </linearGradient>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#DFBF64" />
        <stop offset="50%" stop-color="#D4AF37" />
        <stop offset="100%" stop-color="#9A7B38" />
      </linearGradient>
      <linearGradient id="spineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.8" />
        <stop offset="3%" stop-color="#ffffff" stop-opacity="0.15" />
        <stop offset="7%" stop-color="#000000" stop-opacity="0.4" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="600" height="850" fill="url(#bgGrad)" />

    <!-- Ornate Golden Border Frames -->
    <rect x="24" y="24" width="552" height="802" fill="none" stroke="#D4AF37" stroke-width="2" stroke-opacity="0.4" />
    <rect x="32" y="32" width="536" height="786" fill="none" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.8" />
    
    <!-- Corner Ornaments -->
    <path d="M 40 50 L 50 40 L 60 40 L 40 60 Z" fill="#DFBF64" opacity="0.8" />
    <path d="M 560 50 L 550 40 L 540 40 L 560 60 Z" fill="#DFBF64" opacity="0.8" />
    <path d="M 40 800 L 50 810 L 60 810 L 40 790 Z" fill="#DFBF64" opacity="0.8" />
    <path d="M 560 800 L 550 810 L 540 810 L 560 790 Z" fill="#DFBF64" opacity="0.8" />

    <!-- Publisher Header -->
    <text x="300" y="80" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="12" font-weight="700" fill="#DFBF64" text-anchor="middle" letter-spacing="4">PT CAKRAWALA MAGNA SCIENTIA</text>
    <line x1="200" y1="95" x2="400" y2="95" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.5" />
    
    <!-- Category Badge -->
    <rect x="180" y="125" width="240" height="32" rx="6" fill="#1E293B" stroke="#D4AF37" stroke-width="1" />
    <text x="300" y="146" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="11" font-weight="bold" fill="#DFBF64" text-anchor="middle" letter-spacing="2">${safeCategory}</text>

    <!-- Center Monogram Embellishment -->
    <circle cx="300" cy="230" r="42" fill="none" stroke="url(#goldGrad)" stroke-width="2" />
    <circle cx="300" cy="230" r="36" fill="#0B1120" stroke="#DFBF64" stroke-width="1" stroke-dasharray="3,3" />
    <text x="300" y="238" font-family="Cinzel, Georgia, serif" font-size="24" font-weight="bold" fill="#DFBF64" text-anchor="middle">CN</text>

    <!-- Main Title -->
    ${titleLinesSvg}

    <!-- Author & Institutional Affiliation -->
    <line x1="220" y1="580" x2="380" y2="580" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.5" />
    <text x="300" y="620" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="15" font-weight="600" fill="#E2E8F0" text-anchor="middle" letter-spacing="1">PENULIS / TIM PENYUSUN</text>
    <text x="300" y="650" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${safeAuthor}</text>

    <!-- Footer Bar & ISBN -->
    <rect x="32" y="745" width="536" height="73" fill="#0B1120" />
    <line x1="32" y1="745" x2="568" y2="745" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.6" />
    <text x="60" y="785" font-family="monospace" font-size="12" fill="#94A3B8">ISBN: ${safeIsbn}</text>
    <text x="540" y="785" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="12" font-weight="bold" fill="#DFBF64" text-anchor="end">${year} EDITION</text>

    <!-- 3D Realistic Spine Shadow on Left Edge -->
    <rect x="0" y="0" width="40" height="850" fill="url(#spineGrad)" pointer-events="none" />
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgString)}`;
}

/**
 * Universal error handler for <img> tags.
 * If a custom JPG fails (404, network, or invalid file), it automatically switches
 * to an alternative path or high-definition SVG cover with ZERO broken image icon.
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  meta?: FallbackBookMeta,
  fallbackType: 'book' | 'banner' | 'avatar' | 'general' = 'book'
): void {
  const target = event.currentTarget;
  if (!target) return;

  const currentSrc = target.src || '';
  const attempts = parseInt(target.dataset.errorAttempts || '0', 10);

  // Prevent infinite loop
  if (attempts >= 2) {
    target.src = createFallbackBookCoverSvg(meta);
    return;
  }

  target.dataset.errorAttempts = String(attempts + 1);

  // First fallback attempt: Try standard online placeholder if local file isn't uploaded yet
  if (fallbackType === 'book') {
    if (attempts === 0 && !currentSrc.includes('unsplash.com')) {
      target.src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80';
    } else {
      target.src = createFallbackBookCoverSvg(meta);
    }
  } else if (fallbackType === 'banner') {
    target.src = 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=1200';
  } else {
    target.src = 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=800&q=80';
  }
}
