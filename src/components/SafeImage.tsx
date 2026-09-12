import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl, createFallbackBookCoverSvg, FallbackBookMeta } from '../utils/imageUtils';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  fallbackType?: 'book' | 'banner' | 'logo' | 'blog' | 'payment' | 'general';
  bookMeta?: FallbackBookMeta;
  bookId?: string;
  className?: string;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt,
  fallbackType = 'book',
  bookMeta,
  bookId,
  className = '',
  ...rest
}) => {
  const { t } = useTranslation('common');
  const resolvedType = (fallbackType === 'general' || !fallbackType ? 'book' : fallbackType) as 'book' | 'banner' | 'logo' | 'blog' | 'payment';
  const initialUrl = resolveImageUrl(src, resolvedType, bookId);
  const [imgSrc, setImgSrc] = useState<string>(initialUrl);
  const [hasError, setHasError] = useState<boolean>(false);

  // Update image when src prop changes
  React.useEffect(() => {
    const currentResolvedType = (fallbackType === 'general' || !fallbackType ? 'book' : fallbackType) as 'book' | 'banner' | 'logo' | 'blog' | 'payment';
    const resolved = resolveImageUrl(src, currentResolvedType, bookId);
    setImgSrc(resolved);
    setHasError(false);
  }, [src, fallbackType, bookId]);

  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (!hasError) {
      setHasError(true);
      if (fallbackType === 'book') {
        setImgSrc(createFallbackBookCoverSvg(bookMeta));
      } else if (fallbackType === 'banner') {
        setImgSrc('https://images.unsplash.com/photo-1457369804613-52c61a468e7d?q=80&w=1200');
      } else {
        setImgSrc('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80');
      }
    }
  };

  return (
    <img
      {...rest}
      src={imgSrc}
      alt={alt ?? t('image.defaultAlt')}
      onError={onError}
      referrerPolicy="no-referrer"
      className={className}
      loading={rest.loading || 'lazy'}
    />
  );
};
