import { Order } from '../types';
import { getStoredPaymentSettings } from './paymentService';
import i18n, { DEFAULT_LANGUAGE, isAppLanguage } from '../i18n/index';
import { formatCurrency } from '../i18n/format';

export interface DispatchLog {
  id: string;
  timestamp: string;
  type: 'whatsapp' | 'email' | 'in_app';
  recipient: string;
  status: 'sent' | 'delivered' | 'failed';
  subject?: string;
  body: string;
}

class NotificationService {
  private static instance: NotificationService;
  private logs: DispatchLog[] = [];

  private constructor() {}

  /** Kontak admin diambil dari Pengaturan Pembayaran (Admin > Pembayaran), bukan hardcoded. */
  private get adminWhatsApp(): string {
    return getStoredPaymentSettings().adminNotificationWhatsapp;
  }

  private get adminEmail(): string {
    return getStoredPaymentSettings().adminNotificationEmail;
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Format structured WhatsApp message payload for Admin
   */
  public formatAdminWhatsAppMessage(order: Order): string {
    const bookList = order.items
      .map((item, idx) => `${idx + 1}. *${item.book.name}*\n   Qty: ${item.quantity} eks | Rp ${(item.book.harga * item.quantity).toLocaleString('id-ID')}`)
      .join('\n');

    return (
      `*NOTIFIKASI PESANAN BARU - CAKRANEXA*\n` +
      `*PT CAKRAWALA MAGNA SCIENTIA*\n` +
      `-----------------------------------------\n` +
      `*Order ID:* ${order.orderNumber}\n` +
      `*Customer:* ${order.customer.name}\n` +
      `*WhatsApp:* ${order.customer.phone}\n` +
      `*Email:* ${order.customer.email}\n` +
      `-----------------------------------------\n` +
      `*DAFTAR BUKU:* \n${bookList}\n` +
      `-----------------------------------------\n` +
      `*Ekspedisi:* ${order.customer.courier}\n` +
      `*Alamat Tujuan:* ${order.customer.address}, ${order.customer.district || ''}, ${order.customer.city}, ${order.customer.province || ''} ${order.customer.postalCode}\n` +
      `*Subtotal:* Rp ${order.subtotal.toLocaleString('id-ID')}\n` +
      `*Ongkos Kirim:* Rp ${order.shippingCost.toLocaleString('id-ID')}\n` +
      `*TOTAL PEMBAYARAN:* Rp ${order.total.toLocaleString('id-ID')}\n` +
      `*Metode:* ${order.paymentMethod.toUpperCase().replace('_', ' ')}\n` +
      `*Status:* ${order.paymentStatus.toUpperCase()}\n` +
      `*Waktu:* ${order.createdAt}\n` +
      `-----------------------------------------\n` +
      `_Sistem Otomasi Dispatcher PT Cakrawala Magna Scientia_`
    );
  }

  /**
   * Format Customer WhatsApp confirmation message — dalam bahasa pelanggan saat checkout
   * (order.language); pesanan lama tanpa bahasa memakai Bahasa Indonesia.
   * Terjemahan en/zh dimuat dashboard admin saat dibuka (i18n.loadLanguages).
   */
  public formatCustomerWhatsAppMessage(order: Order): string {
    const lang = isAppLanguage(order.language) ? order.language : DEFAULT_LANGUAGE;
    const t = i18n.getFixedT(lang, 'checkout');
    const status = t(`status.${order.paymentStatus}`).toUpperCase();
    return (
      `${t('customerWhatsApp.greeting', { name: order.customer.name })}\n\n` +
      `${t('customerWhatsApp.thanks')}\n\n` +
      `${t('customerWhatsApp.detailsHeading')}\n` +
      `${t('customerWhatsApp.invoice', { number: order.orderNumber })}\n` +
      `${t('customerWhatsApp.total', { total: formatCurrency(order.total, lang) })}\n` +
      `${t('customerWhatsApp.status', { status })}\n` +
      `${t('customerWhatsApp.courier', { courier: order.customer.courier })}\n` +
      (order.trackingNumber ? `${t('customerWhatsApp.tracking', { tracking: order.trackingNumber })}\n` : '') +
      `\n${t('customerWhatsApp.preparing')}\n\n` +
      `${t('customerWhatsApp.closing')}\n${t('customerWhatsApp.team')}`
    );
  }

  /**
   * Generates direct wa.me link to dispatch directly
   */
  public getWhatsAppDispatchUrl(phone: string, message: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.slice(1) : cleanPhone;
    return `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(message)}`;
  }

  /**
   * CATATAN PENTING: dispatchWhatsAppToAdmin & dispatchEmailReceipt saat ini hanya MENCATAT LOG di browser
   * (tidak benar-benar mengirim WA/email). Pengiriman nyata memerlukan integrasi server-side
   * (mis. WhatsApp Business API / Fonnte / Wablas untuk WA, dan Resend / SMTP untuk email).
   * Tombol "Kirim Bukti ke WhatsApp Admin" di halaman sukses checkout membuka wa.me secara manual.
   */
  /**
   * Log notifikasi WhatsApp ke Admin (simulasi — lihat catatan di atas)
   */
  public async dispatchWhatsAppToAdmin(order: Order): Promise<{ success: boolean; message: string; log: DispatchLog }> {
    const message = this.formatAdminWhatsAppMessage(order);
    
    // Simulate webhook API latency
    await new Promise((resolve) => setTimeout(resolve, 300));

    const log: DispatchLog = {
      id: `wa-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('id-ID'),
      type: 'whatsapp',
      recipient: this.adminWhatsApp,
      status: 'sent',
      body: message
    };

    this.logs.unshift(log);
    return {
      success: true,
      message: `Notifikasi WhatsApp Admin (${this.adminWhatsApp}) dicatat dalam antrean (simulasi)`,
      log
    };
  }

  /**
   * Dispatch automated HTML email receipt to Admin & Customer (Dummy SMTP)
   */
  public async dispatchEmailReceipt(order: Order): Promise<{ success: boolean; message: string; log: DispatchLog }> {
    const subject = `[FAKTUR RESMI] Pesanan Baru ${order.orderNumber} - ${order.customer.name}`;
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; color: #1e293b; line-height: 1.6; padding: 20px;">
        <div style="background: #0f172a; color: #ffffff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #d4af37;">PT CAKRAWALA MAGNA SCIENTIA</h2>
          <p style="margin: 5px 0 0 0; font-size: 12px; color: #94a3b8;">CakraNexa Academic & Professional Book Publishing</p>
        </div>
        <p>Halo Admin Perpajakan & Sirkulasi,</p>
        <p>Transaksi baru telah berhasil dibuat melalui platform e-commerce:</p>
        <ul>
          <li><strong>No. Invoice:</strong> ${order.orderNumber}</li>
          <li><strong>Nama Pemesan:</strong> ${order.customer.name}</li>
          <li><strong>Total Tagihan:</strong> Rp ${order.total.toLocaleString('id-ID')}</li>
          <li><strong>Metode:</strong> ${order.paymentMethod.toUpperCase()}</li>
          <li><strong>Ekspedisi:</strong> ${order.customer.courier}</li>
          <li><strong>Alamat:</strong> ${order.customer.address}, ${order.customer.city} (${order.customer.postalCode})</li>
        </ul>
        <p>Email otomatis ini diterbitkan oleh SMTP Relay Server CakraNexa.</p>
      </body>
      </html>
    `;

    await new Promise((resolve) => setTimeout(resolve, 250));

    const log: DispatchLog = {
      id: `mail-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('id-ID'),
      type: 'email',
      recipient: this.adminEmail,
      subject,
      status: 'delivered',
      body: htmlBody
    };

    this.logs.unshift(log);
    return {
      success: true,
      message: `Email faktur ke ${this.adminEmail} dicatat dalam antrean (simulasi)`,
      log
    };
  }

  /**
   * Get historical notification logs
   */
  public getLogs(): DispatchLog[] {
    return this.logs;
  }
}

export const notificationService = NotificationService.getInstance();
