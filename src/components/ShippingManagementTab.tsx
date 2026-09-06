import React, { useState } from 'react';
import {
  Truck,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  Package,
  Clock,
  ShieldCheck,
  Percent,
  Search,
  Check,
  X,
  ArrowUpDown,
  Gift
} from 'lucide-react';
import { ShippingMethod } from '../types';
import {
  getStoredShippingMethods,
  saveStoredShippingMethods,
  resetDefaultShippingMethods,
  calculateShippingFee
} from '../services/shippingService';

interface ShippingManagementTabProps {
  onShippingMethodsUpdated?: (methods: ShippingMethod[]) => void;
}

export const ShippingManagementTab: React.FC<ShippingManagementTabProps> = ({
  onShippingMethodsUpdated
}) => {
  const [methods, setMethods] = useState<ShippingMethod[]>(() => getStoredShippingMethods());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<ShippingMethod | null>(null);
  const [deleteShippingConfirm, setDeleteShippingConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [formValidationError, setFormValidationError] = useState<string | null>(null);

  // Form inputs
  const [formCourierCode, setFormCourierCode] = useState('JNE');
  const [formName, setFormName] = useState('');
  const [formService, setFormService] = useState('');
  const [formEstimatedDays, setFormEstimatedDays] = useState('2 - 3 Hari');
  const [formBaseRate, setFormBaseRate] = useState<number>(14000);
  const [formMinCost, setFormMinCost] = useState<number>(14000);
  const [formFreeShippingThreshold, setFormFreeShippingThreshold] = useState<number>(300000);
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDescription, setFormDescription] = useState('');

  // Toast Notification
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Sync and save changes
  const persistMethods = (newMethods: ShippingMethod[]) => {
    setMethods(newMethods);
    saveStoredShippingMethods(newMethods);
    if (onShippingMethodsUpdated) {
      onShippingMethodsUpdated(newMethods);
    }
  };

  // Toggle single courier active/inactive
  const handleToggleActive = (id: string) => {
    const updated = methods.map(m =>
      m.id === id ? { ...m, isActive: !m.isActive, updatedAt: new Date().toISOString() } : m
    );
    persistMethods(updated);
    const toggled = updated.find(m => m.id === id);
    showToast(`Status ekspedisi "${toggled?.name} - ${toggled?.service}" diubah ke ${toggled?.isActive ? 'Aktif' : 'Nonaktif'}.`);
  };

  // Delete courier trigger
  const handleDelete = (id: string, name: string) => {
    setDeleteShippingConfirm({ id, name });
  };

  // Confirm delete courier
  const handleConfirmDelete = () => {
    if (!deleteShippingConfirm) return;
    const { id, name } = deleteShippingConfirm;
    const updated = methods.filter(m => m.id !== id);
    persistMethods(updated);
    setDeleteShippingConfirm(null);
    showToast(`Ekspedisi "${name}" berhasil dihapus.`);
  };

  // Open modal for Create
  const handleOpenCreate = () => {
    setEditingMethod(null);
    setFormValidationError(null);
    setFormCourierCode('JNE');
    setFormName('JNE Express');
    setFormService('REG (Reguler)');
    setFormEstimatedDays('2 - 3 Hari');
    setFormBaseRate(14000);
    setFormMinCost(14000);
    setFormFreeShippingThreshold(300000);
    setFormIsActive(true);
    setFormDescription('Layanan pengiriman reguler terpercaya');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEdit = (method: ShippingMethod) => {
    setEditingMethod(method);
    setFormValidationError(null);
    setFormCourierCode(method.courierCode);
    setFormName(method.name);
    setFormService(method.service);
    setFormEstimatedDays(method.estimatedDays);
    setFormBaseRate(method.baseRatePerKg);
    setFormMinCost(method.minCost);
    setFormFreeShippingThreshold(method.freeShippingThreshold ?? 0);
    setFormIsActive(method.isActive);
    setFormDescription(method.description || '');
    setIsModalOpen(true);
  };

  // Submit Modal Form
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formService.trim()) {
      setFormValidationError('Nama kurir dan layanan wajib diisi.');
      return;
    }

    if (editingMethod) {
      // Edit existing
      const updated = methods.map(m =>
        m.id === editingMethod.id
          ? {
              ...m,
              courierCode: formCourierCode,
              name: formName.trim(),
              service: formService.trim(),
              estimatedDays: formEstimatedDays.trim(),
              baseRatePerKg: Number(formBaseRate),
              minCost: Number(formMinCost),
              freeShippingThreshold: Number(formFreeShippingThreshold) || 0,
              isActive: formIsActive,
              description: formDescription.trim(),
              updatedAt: new Date().toISOString()
            }
          : m
      );
      persistMethods(updated);
      showToast(`Ekspedisi "${formName} - ${formService}" berhasil diperbarui.`);
    } else {
      // Create new
      const newMethod: ShippingMethod = {
        id: `${formCourierCode.toLowerCase()}-${Date.now().toString().slice(-4)}`,
        courierCode: formCourierCode,
        name: formName.trim(),
        service: formService.trim(),
        estimatedDays: formEstimatedDays.trim(),
        baseRatePerKg: Number(formBaseRate),
        minCost: Number(formMinCost),
        freeShippingThreshold: Number(formFreeShippingThreshold) || 0,
        isActive: formIsActive,
        description: formDescription.trim(),
        createdAt: new Date().toISOString()
      };
      persistMethods([newMethod, ...methods]);
      showToast(`Ekspedisi "${formName} - ${formService}" berhasil ditambahkan.`);
    }

    setIsModalOpen(false);
  };

  // Reset to default seed
  const handleConfirmResetDefaults = () => {
    const def = resetDefaultShippingMethods();
    persistMethods(def);
    setIsResetConfirmOpen(false);
    showToast('Seluruh data kurir & tarif dikembalikan ke setelan default.');
  };

  // Filtered List
  const filteredMethods = methods.filter(m => {
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && m.isActive) ||
      (filterStatus === 'inactive' && !m.isActive);

    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesStatus;

    const matchesSearch =
      m.name.toLowerCase().includes(q) ||
      m.courierCode.toLowerCase().includes(q) ||
      m.service.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q);

    return matchesStatus && matchesSearch;
  });

  // Calculate quick stats
  const totalCouriers = methods.length;
  const activeCouriers = methods.filter(m => m.isActive).length;
  const freeShippingEnabled = methods.filter(m => m.isActive && (m.freeShippingThreshold ?? 0) > 0).length;
  const avgBaseRate = methods.length > 0 ? Math.round(methods.reduce((s, m) => s + m.baseRatePerKg, 0) / methods.length) : 0;

  // Format IDR helper
  const formatIDR = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="shipping-management-module">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2.5 text-xs font-semibold animate-slideUp">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* HEADER BAR */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Logistics & Courier Management
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full border border-slate-200">
              Live Checkout Sync
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
            Pengaturan Ekspedisi & Tarif Ongkir
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur kurir aktif, ongkos kirim per kilogram, estimasi tiba, serta ambang batas gratis ongkos kirim (Free Shipping) otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="Kembalikan tarif ke default"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Bawaan</span>
          </button>

          <button
            id="btn-add-shipping-method"
            onClick={handleOpenCreate}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Ekspedisi</span>
          </button>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Total Layanan Ekspedisi</span>
            <Truck className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {totalCouriers}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Tercatat di sistem database</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Ekspedisi Aktif (Live)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600 font-mono">
            {activeCouriers} <span className="text-sm font-semibold text-slate-500">/ {totalCouriers}</span>
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Muncul di checkout pembeli</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Layanan Free Shipping</span>
            <Gift className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 font-mono">
            {freeShippingEnabled} <span className="text-sm font-semibold text-slate-500">Kurir</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 block">Otomatis Rp 0 jika syarat terpenuhi</span>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
            <span>Rata-rata Tarif / Kg</span>
            <Percent className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono truncate">
            {formatIDR(avgBaseRate)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Base multiplier Jabodetabek</span>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-semibold w-full sm:w-auto">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'all' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({methods.length})
          </button>
          <button
            onClick={() => setFilterStatus('active')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'active' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Aktif ({activeCouriers})
          </button>
          <button
            onClick={() => setFilterStatus('inactive')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              filterStatus === 'inactive' ? 'bg-slate-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nonaktif ({totalCouriers - activeCouriers})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari kurir, kode, atau layanan..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-800"
          />
        </div>
      </div>

      {/* COURIER MANAGEMENT TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/75">
                <th className="py-3 px-4 w-20">Status</th>
                <th className="py-3 px-4">Kurir & Kode</th>
                <th className="py-3 px-4">Layanan</th>
                <th className="py-3 px-4">Estimasi Waktu</th>
                <th className="py-3 px-4 text-right">Tarif / Kg</th>
                <th className="py-3 px-4 text-right">Min. Ongkir</th>
                <th className="py-3 px-4">Ambang Free Shipping</th>
                <th className="py-3 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {filteredMethods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Tidak ditemukan data ekspedisi yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredMethods.map(item => {
                  const hasFreeShipping = (item.freeShippingThreshold ?? 0) > 0;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/75 transition-colors ${
                        !item.isActive ? 'opacity-60 bg-slate-50/30' : ''
                      }`}
                    >
                      {/* Active Toggle Switch */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(item.id)}
                          className={`w-10 h-5.5 rounded-full transition-colors relative p-0.5 cursor-pointer flex items-center ${
                            item.isActive ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                          title={item.isActive ? 'Klik untuk nonaktifkan' : 'Klik untuk aktifkan'}
                        >
                          <span
                            className={`w-4.5 h-4.5 rounded-full bg-white shadow-xs transition-transform transform ${
                              item.isActive ? 'translate-x-4.5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Courier & Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[10px] bg-slate-900 text-[#DFBF64] px-2 py-0.5 rounded">
                            {item.courierCode}
                          </span>
                          <span className="font-bold text-slate-900">{item.name}</span>
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1 max-w-[220px]">
                            {item.description}
                          </div>
                        )}
                      </td>

                      {/* Service */}
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {item.service}
                      </td>

                      {/* Estimated Days */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {item.estimatedDays}
                        </span>
                      </td>

                      {/* Base Rate / Kg */}
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {formatIDR(item.baseRatePerKg)}
                      </td>

                      {/* Min Cost */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                        {formatIDR(item.minCost)}
                      </td>

                      {/* Free Shipping Threshold */}
                      <td className="py-3.5 px-4">
                        {hasFreeShipping ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Gift className="w-3 h-3 text-emerald-600" />
                            Gratis &ge; {formatIDR(item.freeShippingThreshold!)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Tidak Berlaku</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Ekspedisi"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            className="p-1.5 rounded-lg border border-slate-200 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Hapus Ekspedisi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SIMULATOR & AUTOMATION PREVIEW BOX */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-md space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-[#DFBF64]">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-bold uppercase tracking-wider text-xs">
              Mekanisme Kalkulasi Otomatis di Halaman Checkout
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">Formula: BaseRate × WeightKg × ZoneMultiplier</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-slate-300 text-[11px] leading-relaxed">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="font-bold text-white block mb-1">1. Berat Buku Otomatis</span>
            Sistem menghitung akumulasi berat eksemplar di keranjang belanja pembeli (rata-rata 480 gr per buku monografi).
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="font-bold text-white block mb-1">2. Multiplier Zonasi Wilayah</span>
            Prefix kode pos membedakan tarif Jabodetabek (1.0x), Jawa (1.15x - 1.35x), Sumatera/Bali (1.6x - 1.7x), hingga Indonesia Timur.
          </div>
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="font-bold text-emerald-400 block mb-1">3. Auto Free Shipping</span>
            Jika subtotal buku melebihi ambang batas (contoh: &ge; Rp 300.000), ongkir otomatis Rp 0 dan pembeli mendapat tag Bebas Ongkir.
          </div>
        </div>
      </div>

      {/* MODAL: ADD / EDIT SHIPPING METHOD */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {editingMethod ? 'Edit Pengaturan Ekspedisi' : 'Tambah Ekspedisi Pengiriman Baru'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-md hover:bg-slate-100"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formValidationError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formValidationError}</span>
              </div>
            )}

            <form onSubmit={handleSaveModal} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Kode Kurir:</label>
                  <select
                    value={formCourierCode}
                    onChange={e => setFormCourierCode(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 bg-white"
                  >
                    <option value="JNE">JNE</option>
                    <option value="J&T">J&T</option>
                    <option value="POS">POS Indonesia</option>
                    <option value="SICEPAT">SiCepat</option>
                    <option value="TIKI">TIKI</option>
                    <option value="ANTERAJA">AnterAja</option>
                    <option value="LAINNYA">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Perusahaan Kurir:</label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: JNE Express"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Nama Layanan:</label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: REG (Reguler)"
                    value={formService}
                    onChange={e => setFormService(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Estimasi Hari Tiba:</label>
                  <input
                    type="text"
                    required
                    placeholder="Misal: 2 - 3 Hari"
                    value={formEstimatedDays}
                    onChange={e => setFormEstimatedDays(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tarif Dasar / Kg (Rp):</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={formBaseRate}
                    onChange={e => setFormBaseRate(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Tarif Minimum (Rp):</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    required
                    value={formMinCost}
                    onChange={e => setFormMinCost(Number(e.target.value))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Ambang Batas Gratis Ongkir / Free Shipping (Rp):
                </label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="Misal: 300000 (Isi 0 jika tidak ada gratis ongkir)"
                  value={formFreeShippingThreshold}
                  onChange={e => setFormFreeShippingThreshold(Number(e.target.value))}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800 font-mono"
                />
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  Pesanan dengan total belanja buku di atas nilai ini akan mendapatkan ongkir Rp 0.
                </span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Keterangan Layanan:</label>
                <textarea
                  rows={2}
                  placeholder="Catatan keunggulan layanan untuk pembeli..."
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-800"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="checkbox-is-active"
                  checked={formIsActive}
                  onChange={e => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                />
                <label htmlFor="checkbox-is-active" className="font-semibold text-slate-800 cursor-pointer">
                  Aktifkan kurir ini langsung di halaman checkout publik
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-200">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-slate-900 text-[#DFBF64] font-bold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {editingMethod ? 'Simpan Perubahan' : 'Tambahkan Ekspedisi'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE COURIER CONFIRMATION MODAL */}
      {deleteShippingConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                Hapus Ekspedisi "{deleteShippingConfirm.name}"?
              </h4>
              <p className="text-xs text-slate-500">
                ID Layanan: {deleteShippingConfirm.id}
              </p>
            </div>
            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Tindakan ini akan menghapus opsi pengiriman ini dari kalkulator ongkir dan checkout publik pembeli secara seketika.
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteShippingConfirm(null)}
                className="py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="py-2.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Ya, Hapus Ekspedisi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET SHIPPING CONFIRMATION MODAL */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-slate-900">
                Reset Ekspedisi ke Bawaan?
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Seluruh konfigurasi tarif ongkir, estimasi tiba, dan kurir aktif akan dikembalikan ke setelan standar CakraNexa Publishing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="py-2.5 px-3 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmResetDefaults}
                className="py-2.5 px-3 rounded-lg bg-slate-900 text-[#DFBF64] hover:bg-slate-800 text-xs font-bold cursor-pointer transition-colors shadow-xs"
              >
                Ya, Reset Bawaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
