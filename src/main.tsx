import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './i18n/index'; // inisialisasi bahasa sebelum App dirender
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';

// Tampil sesaat ketika file terjemahan bahasa lain (en/zh) sedang dimuat.
const TranslationLoader = () => (
  <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
    <span className="w-8 h-8 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin" />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<TranslationLoader />}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </Suspense>
  </StrictMode>,
);
