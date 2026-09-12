import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Truck, ShieldCheck, Clock, PackageCheck, AlertCircle, Gift } from 'lucide-react';
import { ShippingMethod } from '../types';
import {
  DEFAULT_SHIPPING_METHODS,
  getStoredShippingMethods,
  calculateShippingFee,
  getZoneMultiplier
} from '../services/shippingService';
import { useFormatters } from '../i18n/hooks';
import { useShippingMethodText } from '../i18n/orderLabels';

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
  const { t } = useTranslation('checkout');
  const { currency, number } = useFormatters();
  const shippingMethodText = useShippingMethodText();
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
            <Trans
              t={t}
              i18nKey="shipping.totalWeight"
              values={{ weight: number(totalWeightGram), kg: weightKg }}
              components={{ strong: <strong className="font-mono" /> }}
            />
          </span>
        </div>
        <div className="text-slate-500 font-mono text-[11px]">
          {postalCode
            ? t('shipping.zone', { postalCode, multiplier: zoneMultiplier.toFixed(2) })
            : t('shipping.enterPostalCode')}
        </div>
      </div>

      {/* Courier Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {couriers.map((option) => {
          const calc = calculateShippingFee(option, totalWeightGram, postalCode, subtotal);
          const isSelected = selectedCourierId === option.id;
          const text = shippingMethodText(option);

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
                      {text.service}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{t('shipping.estimate', { days: text.estimatedDays })}</span>
                  </p>
                </div>
                <div className="text-right">
                  {calc.isFree ? (
                    <div>
                      <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Gift className="w-3 h-3" />
                        {t('shipping.freeShippingBadge')}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 line-through block mt-0.5">
                        {currency(calc.originalFee)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-mono font-bold text-[#0F172A]">
                      {currency(calc.fee)}
                    </span>
                  )}
                </div>
              </div>

              {text.description && (
                <p className="text-[10px] text-slate-400 mt-1.5 line-clamp-1">
                  {text.description}
                </p>
              )}

              {/* Free shipping banner if available but not reached */}
              {!calc.isFree && (option.freeShippingThreshold ?? 0) > 0 && (
                <div className="mt-2 text-[10px] text-amber-700 bg-amber-50/60 px-2 py-0.5 rounded border border-amber-200/50 flex items-center justify-between">
                  <span>{t('shipping.freeShippingThreshold', { amount: currency(option.freeShippingThreshold!) })}</span>
                  <span className="font-semibold">
                    {t('shipping.remaining', { amount: currency(Math.max(0, option.freeShippingThreshold! - subtotal)) })}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        <span>{t('shipping.insuranceNote')}</span>
      </div>
    </div>
  );
};
