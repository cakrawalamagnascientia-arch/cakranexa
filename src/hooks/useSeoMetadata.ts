import { useEffect } from 'react';
import { Book, ActivePage, SubSection, SeoSettings } from '../types';
import { generatePageMetadata, generateJsonLdSchema, applyDocumentMetadata, getStoredSeoSettings } from '../services/seoService';

interface UseSeoMetadataOptions {
  activePage: ActivePage;
  selectedBook?: Book | null;
  subSection?: SubSection;
  seoSettings?: SeoSettings;
}

/**
 * Custom React Hook to dynamically inject Next.js-grade metadata,
 * Open Graph, Twitter Cards, and JSON-LD schema into the document head
 * whenever the user navigates or selects a book.
 */
export const useSeoMetadata = ({
  activePage,
  selectedBook,
  subSection,
  seoSettings
}: UseSeoMetadataOptions) => {
  useEffect(() => {
    const currentSettings = seoSettings || getStoredSeoSettings();
    const metadata = generatePageMetadata(activePage, {
      book: selectedBook,
      subSection,
      settings: currentSettings
    });

    const schema = generateJsonLdSchema(activePage, selectedBook, currentSettings);

    applyDocumentMetadata(metadata, schema, currentSettings);
  }, [activePage, selectedBook, subSection, seoSettings]);
};
