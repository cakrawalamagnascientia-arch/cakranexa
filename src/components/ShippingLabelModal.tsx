import { formatOrderDate } from '../utils/orderUtils';
import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  FileDown, 
  Truck, 
  X, 
  Check, 
  Copy, 
  Package, 
  ShieldCheck, 
  Scale, 
  Layers,
  AlertCircle,
  ExternalLink,
  MapPin,
  Phone,
  Building2,
  Calendar,
  CheckCircle2,
  CheckCircle,
  Barcode,
  Edit3,
  RefreshCw
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Order } from '../types';
import { generateCakraNexaTrackingNumber } from '../services/shippingService';

interface ShippingLabelModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTrackingNumber?: (orderId: string, trackingNumber: string) => void;
}

export const ShippingLabelModal: React.FC<ShippingLabelModalProps> = ({
  order,
  isOpen,
  onClose,
  onUpdateTrackingNumber
}) => {
  const [paperFormat, setPaperFormat] = useState<'a6' | 'a4'>('a6');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [customTracking, setCustomTracking] = useState('');
  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const labelContentRef = useRef<HTMLDivElement | null>(null);

  // Initialize tracking number from order or generate fallback
  useEffect(() => {
    if (order?.trackingNumber) {
      setCustomTracking(order.trackingNumber);
    } else if (order?.orderNumber) {
      setCustomTracking(generateCakraNexaTrackingNumber());
    } else {
      setCustomTracking(generateCakraNexaTrackingNumber());
    }
  }, [order]);

  const activeTrackingNumber = (customTracking.trim() || order?.trackingNumber || generateCakraNexaTrackingNumber()).trim();

  // Generate Barcode and QR Code Data URL
  useEffect(() => {
    if (!isOpen || !order) return;

    // 1. Render Barcode (Code 128) onto SVG
    if (barcodeSvgRef.current) {
      try {
        const barcodeVal = activeTrackingNumber.replace(/[^a-zA-Z0-9-]/g, '');
        JsBarcode(barcodeSvgRef.current, barcodeVal, {
          format: 'CODE128',
          lineColor: '#000000',
          width: paperFormat === 'a6' ? 1.8 : 2.2,
          height: paperFormat === 'a6' ? 46 : 54,
          displayValue: false,
          margin: 0,
          background: 'transparent'
        });
      } catch (err) {
        console.error('Failed to generate barcode', err);
      }
    }

    // 2. Render QR Code as high-res Data URL
    const qrContent = `https://cakranexa.com/lacak?resi=${encodeURIComponent(activeTrackingNumber)}&order=${encodeURIComponent(order.orderNumber)}`;
    QRCode.toDataURL(qrContent, {
      width: 240,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    }).then(url => {
      setQrDataUrl(url);
    }).catch(err => {
      console.error('Failed to generate QR code data URL', err);
    });

  }, [isOpen, order, activeTrackingNumber, paperFormat]);

  if (!isOpen || !order) return null;

  // Courier display helper
  const courierRaw = (order.customer?.courier || 'JNE').toUpperCase();
  const courierService = order.customer?.shippingService 
    ? order.customer.shippingService.toUpperCase() 
    : courierRaw.includes('REG') ? 'REGULER' : courierRaw.includes('YES') ? 'YES' : 'REGULER';
  const courierName = courierRaw.includes('JNE') 
    ? 'JNE EXPRESS' 
    : courierRaw.includes('J&T') 
    ? 'J&T EXPRESS' 
    : courierRaw.includes('SICEPAT')
    ? 'SICEPAT EKSPRES'
    : courierRaw.includes('POS')
    ? 'POS INDONESIA'
    : courierRaw.split(' ')[0];
  
  // Calculate total items and weight
  const totalQty = (order.items || []).reduce((acc, item) => acc + (item.quantity || 1), 0);
  const calculatedWeightGram = order.totalWeightGram || (totalQty * 450);
  const weightInKg = (calculatedWeightGram / 1000).toFixed(1);

  // Title Case Helper
  const toTitleCase = (str?: string) => {
    if (!str) return '-';
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // 1. DIRECT PRINT HANDLER (Instant Direct Print View for thermal printer or A4)
  const handleDirectPrint = () => {
    if (!labelContentRef.current) return;

    // Create a hidden print iframe to isolate styles and print cleanly
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const labelHtml = labelContentRef.current.innerHTML;

    // Page styling for thermal 100x150mm vs A4
    const pageStyle = paperFormat === 'a6' 
      ? `@page { size: 100mm 150mm; margin: 2mm; }` 
      : `@page { size: A4 portrait; margin: 10mm; }`;

    const cleanOrderId = (order.orderNumber || order.id || 'ORDER').replace(/#/g, '');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Resi_CakraNexa_${cleanOrderId}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
          <style>
            ${pageStyle}
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
            }
            .font-mono {
              font-family: 'JetBrains Mono', monospace;
            }
            .print-wrapper {
              width: ${paperFormat === 'a6' ? '96mm' : '180mm'};
              margin: 0 auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              border: 1px solid #000000;
              padding: 4px 6px;
            }
          </style>
        </head>
        <body>
          <div class="print-wrapper">
            ${labelHtml}
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.focus();
                window.print();
                setTimeout(function() {
                  if (window.frameElement && window.frameElement.parentNode) {
                    window.frameElement.parentNode.removeChild(window.frameElement);
                  }
                }, 1000);
              }, 250);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  // 2. DOWNLOAD PDF HANDLER (Generates Resi_CakraNexa_[OrderID].pdf)
  const handleDownloadPdf = async () => {
    if (!labelContentRef.current) return;
    setIsGeneratingPdf(true);

    try {
      const element = labelContentRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const cleanOrderId = (order.orderNumber || order.id || 'ORDER').replace(/#/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');

      if (paperFormat === 'a6') {
        // Standard Thermal 100mm x 150mm
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [100, 150]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, 100, 150);
        const filename = `Resi_CakraNexa_${cleanOrderId}.pdf`;
        pdf.save(filename);
      } else {
        // Standard A4 Document
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });
        // Center on A4 page (210 x 297 mm)
        pdf.addImage(imgData, 'PNG', 15, 15, 180, 267);
        const filename = `Resi_CakraNexa_${cleanOrderId}_A4.pdf`;
        pdf.save(filename);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Gagal membuat file PDF. Silakan gunakan opsi Cetak Langsung.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Copy tracking number
  const handleCopyTracking = () => {
    navigator.clipboard.writeText(activeTrackingNumber);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Auto-generate CakraNexa tracking number
  const handleGenerateAutoTracking = () => {
    const newTracking = generateCakraNexaTrackingNumber();
    setCustomTracking(newTracking);
    setIsEditingTracking(true);
  };

  // Save tracking number & auto update status to 'shipped' (Dikirim)
  const handleSaveTracking = () => {
    const finalTracking = activeTrackingNumber;
    if (onUpdateTrackingNumber && finalTracking) {
      onUpdateTrackingNumber(order.id, finalTracking);
      setSaveSuccessMsg(`Resi ${finalTracking} disimpan! Status pesanan otomatis diubah ke DIKIRIM.`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    }
    setIsEditingTracking(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[96vh]">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#DFBF64]/20 text-[#DFBF64] border border-[#DFBF64]/30 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Cetak Resi & Label Pengiriman Digital
                </h3>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {order.orderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Thermal Paper 100×150mm (A6) & Standar A4 Dispatcher Manifest
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* WAYBILL / TRACKING NUMBER MANAGEMENT PANEL */}
        <div className="px-4 sm:px-6 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            
            {/* Tracking display / edit input */}
            <div className="flex items-center flex-wrap gap-2 w-full md:w-auto">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-[#DFBF64]" />
                Nomor Resi / Waybill:
              </span>

              {isEditingTracking ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    type="text"
                    value={customTracking}
                    onChange={(e) => setCustomTracking(e.target.value)}
                    placeholder="Contoh: JP1234567890 atau CNX-..."
                    className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-900 border border-slate-700 focus:border-[#DFBF64] rounded-md text-white w-48 sm:w-56 focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAutoTracking}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[#DFBF64] border border-slate-700 text-xs font-medium cursor-pointer transition-colors"
                    title="Generate kode unik CakraNexa"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto CNX</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTracking}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
                    title="Simpan Resi & Ubah Status ke DIKIRIM"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Simpan & Set Dikirim</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTracking(false);
                      setCustomTracking(order.trackingNumber || '');
                    }}
                    className="p-1 rounded-md bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                    title="Batal"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-white tracking-wider">
                    {activeTrackingNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditingTracking(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer transition-colors"
                    title="Input Waybill Kurir Resmi (e.g. JNE JP1234567890)"
                  >
                    <Edit3 className="w-3 h-3 text-[#DFBF64]" />
                    <span>Edit Resi Kurir</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateAutoTracking}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition-colors"
                    title="Buat kode resi otomatis CakraNexa"
                  >
                    <Barcode className="w-3 h-3" />
                    <span>Auto-Gen CNX</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Status Pill */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-slate-400">Status Pesanan:</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                order.paymentStatus === 'shipped'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : order.paymentStatus === 'processing'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}>
                {order.paymentStatus === 'shipped' ? 'Dikirim (Shipped)' : order.paymentStatus === 'processing' ? 'Diproses' : order.paymentStatus.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Toast / save feedback */}
          {saveSuccessMsg && (
            <div className="mt-2 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/60">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* MODAL CONTROLS TOOLBAR */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {/* Format Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Ukuran Kertas:</span>
            <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setPaperFormat('a6')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  paperFormat === 'a6'
                    ? 'bg-[#DFBF64] text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                A6 Thermal (100×150 mm)
              </button>
              <button
                type="button"
                onClick={() => setPaperFormat('a4')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  paperFormat === 'a4'
                    ? 'bg-[#DFBF64] text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dokumen A4
              </button>
            </div>
          </div>

          {/* Action Buttons: 1. Instant Direct Print | 2. Download PDF */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleDirectPrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer"
              title="Buka dialog printer browser berformat thermal"
            >
              <Printer className="w-4 h-4 text-slate-800" />
              <span>Cetak Langsung</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#DFBF64] hover:bg-[#c9a84a] text-slate-950 text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
              title={`Download PDF file: Resi_CakraNexa_${(order.orderNumber || 'ORDER').replace(/#/g, '')}.pdf`}
            >
              <FileDown className="w-4 h-4" />
              <span>{isGeneratingPdf ? 'Memproses PDF...' : 'Download PDF Resi'}</span>
            </button>
          </div>
        </div>

        {/* MODAL MAIN CONTENT (PREVIEW CANVAS) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-950/40 flex justify-center">
          
          {/* THE THERMAL SHIPPING LABEL (HIGH CONTRAST B&W WITH CRISP ACCENTS) */}
          <div 
            ref={labelContentRef}
            id="shipping-label-container"
            className={`bg-white text-black transition-all shadow-xl select-none ${
              paperFormat === 'a6'
                ? 'w-full max-w-[390px] min-h-[585px] p-4 text-[11px]'
                : 'w-full max-w-[620px] p-6 text-xs'
            } border-2 border-black rounded-none`}
            style={{
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
            }}
          >
            {/* 1. HEADER SECTION: BRANDING & LOGO */}
            <div className="flex items-stretch justify-between border-b-2 border-black pb-2.5 gap-2">
              
              {/* Official Brand & Publisher */}
              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-extrabold text-base sm:text-lg tracking-tight text-black uppercase">
                    CakraNexa
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-black text-white uppercase tracking-wider">
                    PT CAKRAWALA MAGNA SCIENTIA
                  </span>
                </div>
                <div className="text-[9px] font-semibold text-neutral-800 leading-tight">
                  Penerbit Buku Akademik & Profesional (Anggota IKAPI)
                </div>
                <div className="text-[8.5px] text-neutral-700 mt-1 leading-snug">
                  Redaksi CakraNexa, Jakarta, Indonesia | Admin WA: +62 812-8899-2341
                </div>
              </div>

              {/* Courier & Service Box */}
              <div className="border-2 border-black px-2.5 py-1 text-center flex flex-col justify-center min-w-[110px] bg-neutral-50 shrink-0">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-neutral-600 block">
                  EKSPEDISI
                </span>
                <span className="font-extrabold text-sm sm:text-base text-black tracking-tight leading-none my-0.5">
                  {courierName}
                </span>
                <span className="text-[9px] font-bold bg-black text-white px-1.5 py-0.5 mt-0.5 block tracking-wider uppercase">
                  {courierService}
                </span>
              </div>
            </div>

            {/* 2. PROMINENT TRACKING CODE BOX & WAYBILL HEADER */}
            <div className="border-2 border-black bg-neutral-100 p-2 my-2">
              <div className="flex items-center justify-between border-b border-black/30 pb-1 mb-1">
                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600">
                    SURAT JALAN / WAYBILL
                  </span>
                </div>
                <span className="text-[8.5px] font-mono font-bold text-black bg-white px-1.5 py-0.5 border border-black/40">
                  NO. PESANAN: {order.orderNumber}
                </span>
              </div>

              {/* Large Bold Text for Nomor Resi & Courier Name */}
              <div className="text-center py-1 bg-white border border-black/30 my-1">
                <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600 block">
                  NOMOR RESI RESMI
                </span>
                <div className="text-sm sm:text-base md:text-lg font-black tracking-wider text-black uppercase leading-tight font-mono">
                  {courierName} {courierService} - RESI: {activeTrackingNumber}
                </div>
              </div>

              {/* Barcode & QR Code Section */}
              <div className="pt-1.5 flex items-center justify-between gap-3">
                {/* Dynamically rendered SVG Barcode based on Courier Tracking Number */}
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="w-full flex justify-center overflow-hidden">
                    <svg ref={barcodeSvgRef} className="max-w-full h-11" />
                  </div>
                  <div className="text-[11px] font-mono font-bold tracking-widest text-black mt-0.5">
                    {activeTrackingNumber}
                  </div>
                </div>

                {/* QR Code & Verification */}
                <div className="flex flex-col items-center justify-center pl-2 border-l border-neutral-400 shrink-0">
                  {qrDataUrl ? (
                    <img 
                      src={qrDataUrl} 
                      alt={`QR Code ${activeTrackingNumber}`} 
                      className="w-[58px] h-[58px] block object-contain" 
                    />
                  ) : (
                    <div className="w-[58px] h-[58px] bg-neutral-200 flex items-center justify-center text-[7px] font-mono text-neutral-500">
                      QR RESI
                    </div>
                  )}
                  <span className="text-[7.5px] font-mono font-bold text-neutral-700 uppercase mt-0.5">
                    Lacak Pengiriman
                  </span>
                </div>
              </div>
            </div>

            {/* 3. PAYMENT STATUS & SHIPPING SUMMARY STRIP */}
            <div className="py-1.5 px-2 border-b-2 border-black bg-neutral-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[8.5px] font-bold text-neutral-700 uppercase">Status Bayar:</span>
                {/* Payment Status Badge: "LUNAS / PAID" (Green outline) */}
                <span className="text-[9.5px] font-extrabold px-2.5 py-0.5 border-2 border-emerald-600 bg-emerald-50/50 text-emerald-800 uppercase tracking-wider rounded-xs">
                  LUNAS / PAID
                </span>
              </div>

              <div className="text-[9px] font-bold text-black font-mono text-right">
                Tgl: {formatOrderDate(order.createdAt)}
              </div>
            </div>

            {/* 4. RECIPIENT & SENDER DETAILS */}
            <div className="grid grid-cols-1 divide-y border-b-2 border-black">
              
              {/* RECIPIENT (PENERIMA) */}
              <div className="py-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-extrabold tracking-wider uppercase text-neutral-600 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-black" />
                    PENERIMA (DELIVER TO)
                  </span>
                  <span className="text-[9.5px] font-mono font-bold text-black bg-neutral-200 px-2 py-0.5 border border-neutral-400">
                    KODE POS: {order.customer?.postalCode || '-'}
                  </span>
                </div>

                <div className="text-sm sm:text-base font-extrabold text-black leading-tight">
                  {order.customer?.name || 'Pelanggan CakraNexa'}
                </div>

                <div className="text-xs font-bold font-mono text-black flex items-center gap-1">
                  <Phone className="w-3 h-3 text-black" />
                  {order.customer?.phone || '-'}
                </div>

                <div className="text-[10.5px] sm:text-[11px] leading-snug text-neutral-900 font-medium pt-0.5">
                  {order.customer?.address || 'Alamat tujuan pengiriman'}
                </div>

                <div className="text-[10px] font-semibold text-neutral-900">
                  Kec. {order.customer?.district || '-'}, Kota {order.customer?.city || '-'}, {order.customer?.province || '-'}
                </div>

                {/* Delivery Notes / Instructions */}
                {order.customer?.notes && (
                  <div className="mt-1 p-1 bg-amber-50 border border-amber-300 text-[9px] text-amber-900 rounded-none">
                    <span className="font-bold">Instruksi Kurir:</span> {order.customer.notes}
                  </div>
                )}
              </div>

              {/* SENDER (PENGIRIM) */}
              <div className="py-2 text-[9px] text-neutral-700 space-y-0.5">
                <div className="font-bold text-[8px] uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                  <Building2 className="w-2.5 h-2.5 text-black" />
                  PENGIRIM (SENDER):
                </div>
                <div className="font-bold text-black">
                  Redaksi CakraNexa - PT CAKRAWALA MAGNA SCIENTIA
                </div>
                <div>
                  Gedung Graha Scientia Lt. 4, Jl. Salemba Raya No. 18, Jakarta Pusat 10430
                </div>
                <div className="font-mono text-[8.5px]">
                  Kontak Dispatcher: +62 812-8899-2341
                </div>
              </div>
            </div>

            {/* 5. PACKING SLIP SUMMARY & ITEM MANIFEST */}
            <div className="pt-2 pb-1">
              <div className="flex items-center justify-between pb-1 text-[9px] font-bold">
                <span className="uppercase tracking-wider text-black flex items-center gap-1">
                  <Package className="w-3 h-3 text-black" />
                  MANIFEST BUKU & PACKING SLIP
                </span>
                <span className="font-mono text-neutral-800">
                  Berat: {weightInKg} Kg ({totalQty} Buku)
                </span>
              </div>

              {/* Items Table */}
              <table className="w-full text-left border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-neutral-100 border-b border-black">
                    <th className="p-1 border-r border-black w-6 text-center">No</th>
                    <th className="p-1 border-r border-black">Judul Buku Monografi</th>
                    <th className="p-1 border-r border-black text-center w-28">SKU / ISBN</th>
                    <th className="p-1 text-center w-10">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black">
                  {(order.items && order.items.length > 0) ? (
                    order.items.map((item, index) => (
                      <tr key={index} className="border-b border-black">
                        <td className="p-1 text-center border-r border-black font-mono">
                          {index + 1}
                        </td>
                        <td className="p-1 border-r border-black leading-tight font-medium">
                          {toTitleCase(item.book?.title || item.book?.name || 'Buku Monografi CakraNexa')}
                        </td>
                        <td className="p-1 text-center border-r border-black font-mono text-[8px]">
                          {item.book?.isbn || '978-623-8120-XX'}
                        </td>
                        <td className="p-1 text-center font-bold font-mono">
                          {item.quantity || 1}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-b border-black">
                      <td className="p-1 text-center border-r border-black font-mono">1</td>
                      <td className="p-1 border-r border-black font-medium">Buku Monografi Akademik CakraNexa</td>
                      <td className="p-1 text-center border-r border-black font-mono text-[8px]">978-623-8120-01</td>
                      <td className="p-1 text-center font-bold font-mono">1</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 6. FOOTER VERIFICATION & DISCLAIMER */}
            <div className="mt-2 pt-2 border-t-2 border-black flex items-center justify-between text-[8px] text-neutral-600">
              <div>
                <span className="font-bold text-black">CakraNexa Dispatch Center.</span> Cetak otomatis sistem resmi.
              </div>
              <div className="font-mono text-right font-bold text-black">
                ID-ORD: #{order.id?.slice(-8) || order.orderNumber}
              </div>
            </div>
          </div>

        </div>

        {/* MODAL FOOTER INFO */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-mono text-white">Nomor Resi: {activeTrackingNumber}</span>
            <button
              onClick={handleCopyTracking}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Salin Nomor Resi"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#DFBF64]" />
            <span>Optimal untuk thermal sticker printer 203 DPI / 300 DPI (Ukuran 100×150 mm)</span>
          </div>
        </div>

      </div>
    </div>
  );
};
