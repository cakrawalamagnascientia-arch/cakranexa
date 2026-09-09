import { Book, CartItem, Order, SeoSettings } from '../types';
import { getStoredSeoSettings } from './seoService';

// Extend window interface for Meta Pixel, gtag, and dataLayer
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: any;
    _fbq?: any;
  }
}

let activeMetaPixelId = '';
let activeGaId = '';
let activeGtmId = '';
let activeGAdsId = '';

/**
 * Initializes and dynamically injects Meta Pixel, GA4 / Google Ads, and GTM scripts into <head>.
 */
export const initTracking = (customSettings?: SeoSettings): void => {
  if (typeof window === 'undefined') return;

  const settings = customSettings || getStoredSeoSettings();
  const metaPixelId = (settings.metaPixelId || '').trim();
  const gaId = (settings.googleAnalyticsId || '').trim();
  const gtmId = (settings.gtmId || '').trim();
  const gAdsId = (settings.googleAdsConversionId || '').trim();

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];

  // 1. INJECT META PIXEL
  if (metaPixelId && metaPixelId !== activeMetaPixelId) {
    activeMetaPixelId = metaPixelId;

    // Remove existing meta pixel script if any
    const existingFb = document.getElementById('meta-pixel-script');
    if (existingFb) existingFb.remove();

    if (!window.fbq) {
      const fbq: any = function () {
        if (fbq.callMethod) {
          fbq.callMethod.apply(fbq, arguments);
        } else {
          fbq.queue.push(arguments);
        }
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      window.fbq = fbq;

      const script = document.createElement('script');
      script.id = 'meta-pixel-script';
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      document.head.appendChild(script);
    }

    try {
      window.fbq('init', metaPixelId);
      window.fbq('track', 'PageView');
      console.log(`%c[Marketing Tracking] Meta Pixel Initialized: ${metaPixelId}`, 'color: #1877F2; font-weight: bold;');
    } catch (e) {
      console.warn('Meta Pixel init failed:', e);
    }
  }

  // 2. INJECT GOOGLE TAG MANAGER (GTM)
  if (gtmId && gtmId !== activeGtmId) {
    activeGtmId = gtmId;

    const existingGtm = document.getElementById('gtm-script');
    if (existingGtm) existingGtm.remove();

    const script = document.createElement('script');
    script.id = 'gtm-script';
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    document.head.appendChild(script);

    console.log(`%c[Marketing Tracking] GTM Container Initialized: ${gtmId}`, 'color: #34A853; font-weight: bold;');
  }

  // 3. INJECT GOOGLE ANALYTICS 4 & GOOGLE ADS (gtag.js)
  const primaryGtagId = gaId || gAdsId;
  if (primaryGtagId && (gaId !== activeGaId || gAdsId !== activeGAdsId)) {
    activeGaId = gaId;
    activeGAdsId = gAdsId;

    if (!window.gtag) {
      function gtag(...args: any[]) {
        window.dataLayer?.push(arguments);
      }
      window.gtag = gtag as any;
      window.gtag('js', new Date());

      const existingGtag = document.getElementById('gtag-script');
      if (existingGtag) existingGtag.remove();

      const script = document.createElement('script');
      script.id = 'gtag-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${primaryGtagId}`;
      document.head.appendChild(script);
    }

    if (gaId) {
      window.gtag('config', gaId, { send_page_view: true });
      console.log(`%c[Marketing Tracking] GA4 Configured: ${gaId}`, 'color: #EA4335; font-weight: bold;');
    }
    if (gAdsId) {
      window.gtag('config', gAdsId);
      console.log(`%c[Marketing Tracking] Google Ads Configured: ${gAdsId}`, 'color: #FBBC05; font-weight: bold;');
    }
  }
};

/**
 * Standardized PageView tracking
 */
export const trackPageView = (url?: string, title?: string): void => {
  if (typeof window === 'undefined') return;
  const currentUrl = url || window.location.href;
  const currentTitle = title || document.title;

  // Meta Pixel
  if (window.fbq) {
    try {
      window.fbq('track', 'PageView');
    } catch {}
  }

  // Google Analytics
  if (window.gtag) {
    try {
      window.gtag('event', 'page_view', {
        page_location: currentUrl,
        page_title: currentTitle
      });
    } catch {}
  }

  // GTM dataLayer
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'page_view',
      page_location: currentUrl,
      page_title: currentTitle
    });
  }
};

/**
 * Standardized ViewContent / view_item tracking
 */
export const trackViewContent = (book: Book): void => {
  if (typeof window === 'undefined' || !book) return;

  const payload = {
    content_name: book.name,
    content_category: book.category,
    content_ids: [book.id || book.slug],
    content_type: 'product',
    value: book.harga,
    currency: 'IDR'
  };

  // 1. Meta Pixel
  if (window.fbq) {
    try {
      window.fbq('track', 'ViewContent', payload);
    } catch {}
  }

  // 2. Google Analytics 4
  if (window.gtag) {
    try {
      window.gtag('event', 'view_item', {
        currency: 'IDR',
        value: book.harga,
        items: [
          {
            item_id: book.id || book.slug,
            item_name: book.name,
            item_category: book.category,
            price: book.harga,
            quantity: 1
          }
        ]
      });
    } catch {}
  }

  // 3. GTM
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'view_item',
      ecommerce: {
        currency: 'IDR',
        value: book.harga,
        items: [
          {
            item_id: book.id || book.slug,
            item_name: book.name,
            item_category: book.category,
            price: book.harga,
            quantity: 1
          }
        ]
      }
    });
  }

  console.log('%c[Tracking Event] ViewContent / view_item:', 'color: #6366F1; font-weight: bold;', {
    name: book.name,
    price: book.harga,
    category: book.category
  });
};

/**
 * Standardized AddToCart / add_to_cart tracking
 */
export const trackAddToCart = (book: Book, quantity: number = 1): void => {
  if (typeof window === 'undefined' || !book) return;

  const totalItemVal = (book.harga || 0) * quantity;

  // 1. Meta Pixel
  if (window.fbq) {
    try {
      window.fbq('track', 'AddToCart', {
        content_name: book.name,
        content_category: book.category,
        content_ids: [book.id || book.slug],
        content_type: 'product',
        value: totalItemVal,
        currency: 'IDR'
      });
    } catch {}
  }

  // 2. Google Analytics 4
  if (window.gtag) {
    try {
      window.gtag('event', 'add_to_cart', {
        currency: 'IDR',
        value: totalItemVal,
        items: [
          {
            item_id: book.id || book.slug,
            item_name: book.name,
            item_category: book.category,
            price: book.harga,
            quantity: quantity
          }
        ]
      });
    } catch {}
  }

  // 3. GTM
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'add_to_cart',
      ecommerce: {
        currency: 'IDR',
        value: totalItemVal,
        items: [
          {
            item_id: book.id || book.slug,
            item_name: book.name,
            item_category: book.category,
            price: book.harga,
            quantity: quantity
          }
        ]
      }
    });
  }

  console.log('%c[Tracking Event] AddToCart / add_to_cart:', 'color: #10B981; font-weight: bold;', {
    book: book.name,
    quantity,
    totalVal: totalItemVal
  });
};

/**
 * Standardized InitiateCheckout / begin_checkout tracking
 */
export const trackInitiateCheckout = (items: CartItem[], totalValue: number): void => {
  if (typeof window === 'undefined' || !items || items.length === 0) return;

  const contentIds = items.map((i) => i.book.id || i.book.slug);
  const numItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0);

  // 1. Meta Pixel
  if (window.fbq) {
    try {
      window.fbq('track', 'InitiateCheckout', {
        content_ids: contentIds,
        content_type: 'product',
        num_items: numItems,
        value: totalValue,
        currency: 'IDR'
      });
    } catch {}
  }

  // 2. Google Analytics 4
  if (window.gtag) {
    try {
      window.gtag('event', 'begin_checkout', {
        currency: 'IDR',
        value: totalValue,
        items: items.map((i) => ({
          item_id: i.book.id || i.book.slug,
          item_name: i.book.name,
          item_category: i.book.category,
          price: i.book.harga,
          quantity: i.quantity
        }))
      });
    } catch {}
  }

  // 3. GTM
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'begin_checkout',
      ecommerce: {
        currency: 'IDR',
        value: totalValue,
        items: items.map((i) => ({
          item_id: i.book.id || i.book.slug,
          item_name: i.book.name,
          item_category: i.book.category,
          price: i.book.harga,
          quantity: i.quantity
        }))
      }
    });
  }

  console.log('%c[Tracking Event] InitiateCheckout / begin_checkout:', 'color: #F59E0B; font-weight: bold;', {
    totalValue,
    itemCount: items.length
  });
};

/**
 * Standardized Purchase / purchase tracking (Meta Pixel, GA4, GTM & Google Ads Conversion)
 */
export const trackPurchase = (order: Order, customSettings?: SeoSettings): void => {
  if (typeof window === 'undefined' || !order) return;

  const settings = customSettings || getStoredSeoSettings();
  const contentIds = (order.items || []).map((i) => i.book.id || i.book.slug);
  const totalQty = (order.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);

  // 1. Meta Pixel Purchase
  if (window.fbq) {
    try {
      window.fbq('track', 'Purchase', {
        content_ids: contentIds,
        content_type: 'product',
        value: order.total,
        currency: 'IDR',
        num_items: totalQty
      });
    } catch {}
  }

  // 2. Google Analytics 4 Purchase
  if (window.gtag) {
    try {
      window.gtag('event', 'purchase', {
        transaction_id: order.orderNumber || order.id,
        value: order.total,
        currency: 'IDR',
        shipping: order.shippingCost || 0,
        items: (order.items || []).map((i) => ({
          item_id: i.book.id || i.book.slug,
          item_name: i.book.name,
          item_category: i.book.category,
          price: i.book.harga,
          quantity: i.quantity
        }))
      });
    } catch {}
  }

  // 3. Google Ads Conversion Event
  const gAdsId = (settings.googleAdsConversionId || '').trim();
  const gAdsLabel = (settings.googleAdsConversionLabel || '').trim();
  if (window.gtag && gAdsId && gAdsLabel) {
    try {
      window.gtag('event', 'conversion', {
        send_to: `${gAdsId}/${gAdsLabel}`,
        value: order.total,
        currency: 'IDR',
        transaction_id: order.orderNumber || order.id
      });
      console.log(`%c[Google Ads Conversion] Fired: ${gAdsId}/${gAdsLabel}`, 'color: #10B981; font-weight: bold;');
    } catch (e) {
      console.warn('Google Ads Conversion tracking error:', e);
    }
  }

  // 4. GTM dataLayer
  if (window.dataLayer) {
    window.dataLayer.push({
      event: 'purchase',
      ecommerce: {
        transaction_id: order.orderNumber || order.id,
        value: order.total,
        currency: 'IDR',
        shipping: order.shippingCost || 0,
        items: (order.items || []).map((i) => ({
          item_id: i.book.id || i.book.slug,
          item_name: i.book.name,
          item_category: i.book.category,
          price: i.book.harga,
          quantity: i.quantity
        }))
      }
    });
  }

  console.log('%c[Tracking Event] Purchase Completed:', 'color: #059669; font-weight: bold; font-size: 13px;', {
    orderNumber: order.orderNumber,
    total: order.total,
    itemsCount: order.items?.length
  });
};
