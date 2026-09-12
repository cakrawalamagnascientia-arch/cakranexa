import 'i18next';
import type common from './locales/id/common.json';
import type home from './locales/id/home.json';
import type catalog from './locales/id/catalog.json';
import type book from './locales/id/book.json';
import type author from './locales/id/author.json';
import type blog from './locales/id/blog.json';
import type cart from './locales/id/cart.json';
import type checkout from './locales/id/checkout.json';
import type auth from './locales/id/auth.json';
import type admin from './locales/id/admin.json';
import type errors from './locales/id/errors.json';
import type seo from './locales/id/seo.json';
import type publishing from './locales/id/publishing.json';
import type training from './locales/id/training.json';
import type about from './locales/id/about.json';
import type career from './locales/id/career.json';
import type journal from './locales/id/journal.json';
import type contact from './locales/id/contact.json';

// Kunci terjemahan diketik dari file Bahasa Indonesia: kunci yang salah ketik gagal saat compile.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      home: typeof home;
      catalog: typeof catalog;
      book: typeof book;
      author: typeof author;
      blog: typeof blog;
      cart: typeof cart;
      checkout: typeof checkout;
      auth: typeof auth;
      admin: typeof admin;
      errors: typeof errors;
      seo: typeof seo;
      publishing: typeof publishing;
      training: typeof training;
      about: typeof about;
      career: typeof career;
      journal: typeof journal;
      contact: typeof contact;
    };
  }
}
