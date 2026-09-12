import { useEffect } from 'react';
import { Book, ActivePage, SubSection, SeoSettings } from '../types';
import { generatePageMetadata, generateJsonLdSchema, applyDocumentMetadata, getStoredSeoSettings } from '../services/seoService';
import { useAppLanguage } from '../i18n/hooks';

interface UseSeoMetadataOptions {
  activePage: ActivePage;
  selectedBook?: Book | null;
  subSection?: SubSection;
  seoSettings?: SeoSettings;
}

/**
 * Custom React Hook to dynamically inject Next.js-grade metadata,
 * Open Graph, Twitter Cards, hreflang, and JSON-LD schema into the document head
 * whenever the user navigates, selects a book, or switches language.
 */
export const useSeoMetadata = ({
  activePage,
  selectedBook,
  subSection,
  seoSettings
}: UseSeoMetadataOptions) => {
  const language = useAppLanguage();

  useEffect(() => {
    const currentSettings = seoSettings || getStoredSeoSettings();
    const metadata = generatePageMetadata(activePage, {
      book: selectedBook,
      subSection,
      settings: currentSettings,
      language
    });

    const schema = generateJsonLdSchema(activePage, selectedBook, currentSettings, language);

    applyDocumentMetadata(metadata, schema, currentSettings);
  }, [activePage, selectedBook, subSection, seoSettings, language]);
};
