/**
 * formatters.ts — Global text, title, and currency formatters for CakraNexa
 * Enforces automatic Title Case capitalization and acronym preservation.
 */

// Minor words (conjunctions, prepositions, and articles in Indonesian and English)
// These remain lowercase unless they are the first word of the title or follow a break.
const MINOR_WORDS = new Set([
  // Indonesian conjunctions and prepositions
  'dan',
  'di',
  'ke',
  'dari',
  'yang',
  'untuk',
  'pada',
  'atau',
  'dalam',
  'terhadap',
  'atas',
  'oleh',
  'tentang',
  'dengan',
  'sebagai',
  'serta',
  'bagi',
  'kepada',
  'antara',
  'hingga',
  'sampai',
  'maupun',
  'secara',
  'adalah',
  'yaitu',
  'yakni',
  // English conjunctions and prepositions
  'with',
  'and',
  'of',
  'for',
  'in',
  'on',
  'at',
  'to',
  'by',
  'an',
  'a',
  'the',
  'as',
  'into',
  'onto',
  'from',
  'via',
  'vs',
  'versus'
]);

// Acronyms and technical abbreviations that MUST always be preserved in uppercase
const UPPERCASE_ACRONYMS = new Set([
  'ISBN',
  'SINTA',
  'USKP',
  'PPN',
  'AI',
  'DIKTI',
  'PMSE',
  'KUP',
  'OECD',
  'ASEAN',
  'UU',
  'UNESCO',
  'NFT',
  'PT',
  'PTKP',
  'PBB',
  'BPHTB',
  'KPK',
  'MA',
  'MK',
  'DJP',
  'WPOP',
  'WP',
  'BEPS',
  'MLI',
  'CFC',
  'SP2DK',
  'BKP',
  'JKP',
  'NPWP',
  'NIK',
  'IFRS',
  'PSAK',
  'SPAP',
  'IAPI',
  'IAI',
  'IKPI',
  'APEC',
  'WTO',
  'IMF',
  'IT',
  'UI',
  'UX',
  'SEO',
  'CMS',
  'B5',
  'A4',
  'ERP',
  'SOP',
  'KBLI',
  'NIB',
  'OSS',
  'UMKM',
  'LLDIKTI',
  'BAN-PT',
  'OJK',
  'BI',
  'BPK',
  'DPR',
  'MPR',
  'RI',
  'NKRI',
  'KUHP',
  'KUHAP',
  'KUHPER',
  'PP',
  'PERPRES',
  'KEPPRES',
  'PMK',
  'PERDIRJEN',
  'SE',
  'ND'
]);

// Special mixed-case acronyms
const SPECIAL_MIXED_CASES: Record<string, string> = {
  'pph': 'PPh',
  'ppnbm': 'PPnBM',
  'pmse': 'PMSE',
  'e-commerce': 'e-Commerce',
  'fintech': 'FinTech',
  'edutech': 'EduTech',
  'chatgpt': 'ChatGPT'
};

// Roman numerals (I, II, III, IV, etc.)
const ROMAN_NUMERAL_REGEX = /^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/i;

/**
 * Formats a single word token
 */
function formatSingleWord(word: string, forceCapitalize: boolean): string {
  if (!word) return '';

  const lowerWord = word.toLowerCase();
  const upperWord = word.toUpperCase();

  // 1. Check special mixed cases (e.g. 'PPh', 'PPnBM')
  if (SPECIAL_MIXED_CASES[lowerWord]) {
    return SPECIAL_MIXED_CASES[lowerWord];
  }

  // 2. Check known acronyms (e.g. 'PPN', 'ISBN', 'SINTA', 'USKP', 'AI', 'DIKTI')
  if (UPPERCASE_ACRONYMS.has(upperWord)) {
    return upperWord;
  }

  // 3. Check Roman numerals (e.g. 'I', 'II', 'III', 'IV', 'V', 'VI')
  if (ROMAN_NUMERAL_REGEX.test(word) && word.length <= 5) {
    return upperWord;
  }

  // 4. Check if already an acronym-like short token (2-4 uppercase characters not in minor words)
  if (word.length >= 2 && word.length <= 4 && word === upperWord && !MINOR_WORDS.has(lowerWord)) {
    return upperWord;
  }

  // 5. Minor words: keep lowercase unless forceCapitalize is true
  if (!forceCapitalize && MINOR_WORDS.has(lowerWord)) {
    return lowerWord;
  }

  // 6. Standard Title Case capitalization: First char uppercase, rest lowercase
  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

/**
 * Normalizes and formats a text or book title into standardized Title Case.
 * 
 * Rules:
 * - Capitalizes the first letter of each word.
 * - Keeps minor conjunctions & prepositions in lowercase ('dan', 'di', 'ke', 'dari', 'yang', 'untuk', 'pada', 'atau', 'dalam', 'terhadap', 'with', 'and', 'of', 'for', 'in', 'on', etc.) UNLESS it is the very first word of the title or follows a colon/break.
 * - Preserves acronyms in uppercase (e.g., 'ISBN', 'SINTA', 'USKP', 'PPN', 'AI', 'DIKTI', 'PMSE', 'KUP', 'OECD', 'UNESCO').
 * - Preserves mixed-case tax acronyms (e.g., 'PPh', 'PPnBM').
 * - Preserves Roman numerals (e.g., 'I', 'II', 'III', 'IV', 'V').
 * - Preserves bracketed tokens, punctuation, and hyphenated compound words.
 */
export function toTitleCase(text: string | undefined | null): string {
  if (!text) return '';
  
  const trimmed = text.trim();
  if (!trimmed) return '';

  // Split into tokens preserving whitespace
  const words = trimmed.split(/(\s+)/);
  let isFirstWord = true;

  return words
    .map((word) => {
      // If pure whitespace, preserve
      if (/^\s+$/.test(word)) {
        return word;
      }

      const forceCapitalize = isFirstWord;
      isFirstWord = false;

      // Extract leading and trailing punctuation (e.g. "(PPN)", "'Buku'", "AI:", "[SINTA]")
      const match = word.match(/^([^\w\u00C0-\u024F]*)([\w\u00C0-\u024F\-\/]+)([^\w\u00C0-\u024F]*)$/);
      if (!match) {
        return word;
      }

      const [, leadingPunct, coreWord, trailingPunct] = match;

      // Handle hyphenated words (e.g., "Undang-Undang", "Non-Fungible", "e-Commerce")
      if (coreWord.includes('-')) {
        const hyphenParts = coreWord.split('-');
        const formattedHyphen = hyphenParts
          .map((part, index) => {
            return formatSingleWord(part, forceCapitalize && index === 0);
          })
          .join('-');

        const lowerHyphen = coreWord.toLowerCase();
        const specialHyphen = SPECIAL_MIXED_CASES[lowerHyphen];
        const finalCore = specialHyphen || formattedHyphen;

        if (trailingPunct.includes(':') || trailingPunct.includes('—') || trailingPunct.includes('.')) {
          isFirstWord = true;
        }

        return `${leadingPunct}${finalCore}${trailingPunct}`;
      }

      const formattedCore = formatSingleWord(coreWord, forceCapitalize);

      // If trailing punctuation has a colon, period, or em dash, the next word is capitalized
      if (trailingPunct.includes(':') || trailingPunct.includes('—') || trailingPunct.includes('.')) {
        isFirstWord = true;
      }

      return `${leadingPunct}${formattedCore}${trailingPunct}`;
    })
    .join('');
}

/**
 * Formats standard Indonesian Rupiah currency.
 */
export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}
