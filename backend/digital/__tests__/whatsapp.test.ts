import { describe, expect, it } from 'vitest';
import {
  createCloudSender,
  createFonnteSender,
  createWhatsAppSender,
  formatWhatsAppNumber,
  membershipWhatsApp,
  normalizeWhatsAppNumber,
  WHATSAPP_KINDS
} from '../membership/whatsapp';
import { loadDigitalConfig } from '../config';
import type { MembershipEmailData } from '../membership/email';

const data = (extra: Partial<MembershipEmailData> = {}): MembershipEmailData => ({
  language: 'id',
  name: 'Anggota Uji',
  siteUrl: 'https://cakranexa.test',
  planName: 'Professional & Academic Society',
  amount: 99000,
  date: '2026-10-14T03:00:00.000Z',
  days: 3,
  graceDays: 5,
  retentionMonths: 12,
  regularPrice: 990000,
  ...extra
});

const captureFetch = (response: unknown, status = 200) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

describe('nomor WhatsApp', () => {
  it('menormalkan nomor seluler Indonesia ke 628…', () => {
    for (const input of ['+62 852 8614 6806', '0852-8614-6806', '6285286146806', '85286146806', '(0852) 8614 6806']) {
      expect(normalizeWhatsAppNumber(input)).toBe('6285286146806');
    }
    for (const input of ['', '12345', '021 555 1234', '+1 555 123 4567', '0852abc', null, undefined]) {
      expect(normalizeWhatsAppNumber(input)).toBeNull();
    }
    expect(formatWhatsAppNumber('6285286146806')).toBe('+62 852 8614 6806');
  });

  it('config: nomor pengirim bawaan +62 852 8614 6806, gateway mati tanpa token', () => {
    const cfg = loadDigitalConfig({ NODE_ENV: 'test' });
    expect(cfg.whatsapp).toMatchObject({ provider: 'off', senderNumber: '6285286146806', templatePrefix: 'cnx_' });
    expect(createWhatsAppSender(cfg.whatsapp)).toBeNull();
    const fonnteWithoutToken = loadDigitalConfig({ NODE_ENV: 'test', WHATSAPP_PROVIDER: 'fonnte' });
    expect(createWhatsAppSender(fonnteWithoutToken.whatsapp)).toBeNull();
    const fonnte = loadDigitalConfig({ NODE_ENV: 'test', WHATSAPP_PROVIDER: 'Fonnte', FONNTE_TOKEN: 'tok' });
    expect(createWhatsAppSender(fonnte.whatsapp)?.provider).toBe('fonnte');
    expect(loadDigitalConfig({ NODE_ENV: 'test', WHATSAPP_SENDER_NUMBER: '0812 3456 7890' }).whatsapp.senderNumber).toBe('6281234567890');
  });
});

describe('pesan pengingat', () => {
  it('teks id: nominal, tanggal WIB, tautan akun, dan cara berhenti', () => {
    const msg = membershipWhatsApp('reminder', data());
    expect(msg.text).toContain('Rp 99.000');
    expect(msg.text).toContain('14 Oktober 2026');
    expect(msg.text).toContain('3 hari lagi');
    expect(msg.text).toContain('https://cakranexa.test/account/membership');
    expect(msg.text).toContain('berhenti menerima pengingat WhatsApp');
    expect(msg.template).toEqual({
      name: 'cnx_reminder',
      params: ['Anggota Uji', 'Professional & Academic Society', 'Rp 99.000', '14 Oktober 2026', '3 hari lagi', 'https://cakranexa.test/account/membership']
    });
    expect(membershipWhatsApp('reminder', data({ days: 0 })).text).toContain('hari ini');
    expect(membershipWhatsApp('locked', data()).text).toContain('12 bulan');
    expect(membershipWhatsApp('invoice', data({ autodebit: true })).template.name).toBe('cnx_invoice_autodebit');
  });

  it('teks en (zh memakai en) dengan tautan berbahasa; parameter template tanpa baris baru', () => {
    const msg = membershipWhatsApp('grace', data({ language: 'zh' }));
    expect(msg.text).toContain('https://cakranexa.test/zh/account/membership');
    expect(msg.text).toMatch(/^Hello Anggota Uji/);
    for (const kind of WHATSAPP_KINDS) {
      for (const language of ['id', 'en']) {
        const m = membershipWhatsApp(kind, data({ language }));
        expect(m.text.length).toBeLessThan(700);
        expect(m.template.params.every((p) => !/[\n\t]/.test(p) && p.length > 0)).toBe(true);
        expect(m.template.name).toMatch(/^cnx_[a-z_]+$/);
      }
    }
  });
});

describe('gateway', () => {
  it('Fonnte: POST /send dengan token perangkat, target 628…, countryCode 62', async () => {
    const { calls, fetchImpl } = captureFetch({ status: true, detail: 'success! message in queue' });
    await createFonnteSender('token-uji', fetchImpl).send('6281234567890', membershipWhatsApp('invoice', data()), 'id');
    expect(calls[0].url).toBe('https://api.fonnte.com/send');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('token-uji');
    const body = new URLSearchParams(String(calls[0].init.body));
    expect(body.get('target')).toBe('6281234567890');
    expect(body.get('countryCode')).toBe('62');
    expect(body.get('message')).toContain('Rp 99.000');
  });

  it('Fonnte: status:false menjadi error; status perangkat membaca nomor tersambung', async () => {
    const failing = captureFetch({ status: false, reason: 'invalid token' });
    await expect(createFonnteSender('x', failing.fetchImpl).send('6281234567890', membershipWhatsApp('grace', data()), 'id')).rejects.toThrow(/invalid token/);
    const device = captureFetch({ status: true, device: '6285286146806', device_status: 'connect' });
    expect(await createFonnteSender('x', device.fetchImpl).status()).toEqual({ ok: true, detail: 'connect', connectedNumber: '6285286146806' });
    expect(device.calls[0].url).toBe('https://api.fonnte.com/device');
  });

  it('Cloud API: pesan template berbahasa dengan parameter body berurutan', async () => {
    const { calls, fetchImpl } = captureFetch({ messages: [{ id: 'wamid.x' }] });
    const sender = createCloudSender({ token: 'meta-token', phoneNumberId: '1234567890', apiVersion: 'v21.0' }, fetchImpl);
    await sender.send('6281234567890', membershipWhatsApp('paymentFailed', data()), 'id');
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer meta-token');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      messaging_product: 'whatsapp',
      to: '6281234567890',
      type: 'template',
      template: {
        name: 'cnx_payment_failed',
        language: { code: 'id' },
        components: [{ type: 'body', parameters: ['Anggota Uji', 'Professional & Academic Society', 'Rp 99.000', 'https://cakranexa.test/account/membership'].map((text) => ({ type: 'text', text })) }]
      }
    });
    const failing = captureFetch({ error: { message: 'Template name does not exist' } }, 400);
    await expect(createCloudSender({ token: 't', phoneNumberId: '1', apiVersion: 'v21.0' }, failing.fetchImpl)
      .send('6281234567890', membershipWhatsApp('grace', data()), 'id')).rejects.toThrow(/Template name does not exist/);
  });
});
