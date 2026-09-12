import React from 'react';
import { Calendar, User, ArrowRight, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BlogArticleItem } from '../types';
import { DEFAULT_SITE_CONTENT } from '../services/siteContentService';
import { useAppLanguage, useLocalized } from '../i18n/hooks';
import { formatIndonesianDateText } from '../i18n/format';

interface BlogViewProps {
  /** Artikel dari CMS (dapat diedit & diterjemahkan admin); bawaan dipakai bila kosong. */
  articles?: BlogArticleItem[];
}

export const BlogView: React.FC<BlogViewProps> = ({ articles: cmsArticles }) => {
  const { t } = useTranslation('blog');
  const lang = useAppLanguage();
  const localized = useLocalized();
  const articles = [...(cmsArticles && cmsArticles.length > 0 ? cmsArticles : DEFAULT_SITE_CONTENT.blogArticles)]
    .sort((a, b) => a.order - b.order);

  return (
    <div id="blog-view" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 text-left space-y-10">

      {/* Header */}
      <div className="bg-[#0F172A] text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden border border-[#DFBF64]/30 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-4">
          <span className="text-xs uppercase tracking-widest text-[#DFBF64] font-semibold flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            {t('header.eyebrow')}
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            {t('header.title')}
          </h1>
          <p className="text-slate-300 text-sm sm:text-base font-light leading-relaxed">
            {t('header.subtitle')}
          </p>
        </div>
      </div>

      {/* Articles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {articles.map((art) => {
          const title = localized(art, 'title');
          return (
            <article
              key={art.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="h-44 overflow-hidden relative">
                  <img
                    src={art.coverImage}
                    alt={title}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                  />
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded bg-[#0F172A]/90 backdrop-blur-xs text-[#DFBF64] text-[10px] font-bold uppercase tracking-wider">
                    {localized(art, 'category')}
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatIndonesianDateText(art.publishDate, lang)}
                    </span>
                    <span>•</span>
                    <span>{localized(art, 'readTime')}</span>
                  </div>

                  <h3 className="font-serif font-bold text-base text-slate-900 leading-snug hover:text-[#C5A059] transition-colors cursor-pointer">
                    {title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {localized(art, 'excerpt')}
                  </p>
                </div>
              </div>

              <div className="p-5 pt-0">
                <button
                  onClick={() => alert(t('article.openAlert', { title }))}
                  className="w-full py-2.5 px-3 rounded-lg border border-slate-200 hover:border-[#0F172A] hover:bg-[#0F172A] hover:text-[#DFBF64] text-slate-800 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <span>{t('article.readMore')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </article>
          );
        })}
      </div>

    </div>
  );
};
