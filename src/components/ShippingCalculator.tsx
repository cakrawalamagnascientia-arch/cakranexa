import React, { useState, useEffect } from 'react';
import { Truck, ShieldCheck, Clock, PackageCheck, AlertCircle, Gift } from 'lucide-react';
import { ShippingMethod } from '../types';
import {
  DEFAULT_SHIPPING_METHODS,
  getStoredShippingMethods,
  calculateShippingFee,
  getZoneMultiplier
} from '../services/shippingService';

export type CourierOption = ShippingMethod;
export const AVAILABLE_COURIERS: CourierOption[] = DEFAULT_SHIPPING_METHODS;

interface ShippingCalculatorProps {
  totalWeightGram: number;
  postalCode: string;
  selectedCourierId: string;
  onSelectCourier: (courier: CourierOption, calculatedCost: number) => void;
  subtotal?: number;
  shippingMethods?: ShippingMethod[];
}

export const ShippingCalculator: React.FC<ShippingCalculatorProps> = ({
  totalWeightGram,
  postalCode,
  selectedCourierId,
  onSelectCourier,
  subtotal = 0,
  shippingMethods
}) => {
  const [couriers, setCouriers] = useState<ShippingMethod[]>(() => {
    if (shippingMethods && shippingMethods.length > 0) {
      return shippingMethods.filter(m => m.isActive);
    }
    return getStoredShippingMethods().filter(m => m.isActive);
  });

  // Listen for external updates or prop changes
  useEffect(() => {
    if (shippingMethods && shippingMethods.length > 0) {
      setCouriers(shippingMethods.filter(m => m.isActive));
    } else {
      setCouriers(getStoredShippingMethods().filter(m => m.isActive));
    }
  }, [shippingMethods]);

  const weightKg = Math.max(1, Math.ceil(totalWeightGram / 1000));
  const zoneMultiplier = getZoneMultiplier(postalCode);

  // Auto-select first active courier if none selected or current is inactive
  useEffect(() => {
    if (couriers.length > 0) {
      const exists = couriers.find(c => c.id === selectedCourierId);
      if (!exists) {
        const first = couriers[0];
        const calc = calculateShippingFee(first, totalWeightGram, postalCode, subtotal);
        onSelectCourier(first, calc.fee);
      }
    }
  }, [couriers, selectedCourierId, totalWeightGram, postalCode, subtotal, onSelectCourier]);

  return (
    <div className="space-y-4">
      {/* Weight & Zone Indicator */}
      <div className="flex flex-wrap items-center justify-between text-xs p-3 rounded-lg bg-slate-100 border border-slate-200">
        <div className="flex items-center gap-2 text-slate-700">
          <PackageCheck className="w-4 h-4 text-[#D4AF37]" />
          <span>
            Total Berat Literatur: <strong className="font-mono">{totalWeightGram.toLocaleString('id-ID')} g</strong> ({weightKg} Kg hitungan kirim)
          </span>
        </div>
        <div className="text-slate-500 font-mono text-[11px]">
          {postalCode ? `Zona Kode Pos [${postalCode}] (x${zoneMultiplier.toFixed(2)})` : 'Masukkan kode pos untuk tarif presisi'}
        </div>
      </div>

      {/* Courier Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {couriers.map((option) => {
          const calc = calculateShippingFee(option, totalWeightGram, postalCode, subtotal);
          const isSelected = selectedCourierId === option.id;

          return (
            <div
              key={option.id}
              onClick={() => onSelectCourier(option, calc.fee)}
              className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all ${
                isSelected
                  ? 'border-[#D4AF37] bg-amber-50/40 shadow-xs ring-1 ring-[#D4AF37]'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">{option.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#0F172A] text-white">
                      {option.service}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Estimasi: {option.estimatedDays}</span>
                  </p>
                </div>
                <div className="text-right">
                  {calc.isFree ? (
                    <div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Gift className="w-3 h-3" />
                        BEBAS ONGKIR
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 line-through block mt-0.5">
                        Rp {calc.originalFee.toLocaleString('id-ID')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-mono font-bold text-[#0F172A]">
                      Rp {calc.fee.toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
              </div>

              {option.description && (
                <p className="text-[10px] text-slate-400 mt-1.5 line-clamp-1">
                  {option.description}
                </p>
              )}

              {/* Free shipping banner if available but not reached */}
              {!calc.isFree && (option.freeShippingThreshold ?? 0) > 0 && (
                <div className="mt-2 text-[10px] text-amber-700 bg-amber-50/60 px-2 py-0.5 rounded border border-amber-200/50 flex items-center justify-between">
                  <span>Gratis ongkir belanja &ge; Rp {option.freeShippingThreshold!.toLocaleString('id-ID')}</span>
                  <span className="font-semibold">
                    (Kurang Rp {Math.max(0, option.freeShippingThreshold! - subtotal).toLocaleString('id-ID')})
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        <span>Sudah mencakup proteksi asuransi pengiriman buku dan kemasan kardus tahan benturan resmi PT Cakrawala Magna Scientia.</span>
      </div>
    </div>
  );
};
