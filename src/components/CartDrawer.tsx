import React from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, ShieldCheck } from 'lucide-react';
import { CartItem } from '../types';
import { resolveImageUrl, handleImageError } from '../utils/imageUtils';
import { toTitleCase } from '../utils/formatters';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onUpdateQuantity: (bookId: string, delta: number) => void;
  onRemoveItem: (bookId: string) => void;
  onProceedCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onUpdateQuantity,
  onRemoveItem,
  onProceedCheckout
}) => {
  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.book.harga * item.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden text-left">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#0F172A]/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#DFBF64]/30">
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-[#DFBF64]" />
              <div>
                <h3 className="font-serif font-bold text-base text-white">Keranjang Belanja</h3>
                <p className="text-[11px] text-slate-400">
                  {items.length} ragam publikasi buku
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Item List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
                  <ShoppingBag className="w-8 h-8 stroke-1" />
                </div>
                <h4 className="font-serif font-bold text-slate-800 text-base">Keranjang Anda Masih Kosong</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Jelajahi koleksi buku referensi akademik kami dan tambahkan naskah yang Anda butuhkan.
                </p>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold rounded bg-[#0F172A] text-[#DFBF64] hover:bg-[#1E293B]"
                >
                  Mulai Belanja Buku
                </button>
              </div>
            ) : (
              items.map((item) => (
                <div 
                  key={item.book.id}
                  className="flex gap-3.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  {/* Mini Cover */}
                  <div className="w-16 h-20 flex-shrink-0 book-shadow rounded overflow-hidden bg-[#0F172A]">
                    <img 
                      src={resolveImageUrl(item.book.coverBuku, 'book', item.book.id)} 
                      alt={item.book.name} 
                      onError={(e) => handleImageError(e, {
                        title: item.book.name,
                        author: item.book.author,
                        category: item.book.category,
                        isbn: item.book.isbn
                      }, 'book')}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Meta */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <span className="text-[10px] uppercase font-bold text-[#C5A059]">
                          {item.book.category}
                        </span>
                        <button
                          onClick={() => onRemoveItem(item.book.id)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-0.5"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <h4 className="font-semibold text-xs text-slate-900 line-clamp-2 leading-snug">
                        {toTitleCase(item.book.title || item.book.name)}
                      </h4>
                    </div>

                    {/* Quantity & Price */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-1">
                      <div className="flex items-center border border-slate-300 rounded bg-white">
                        <button
                          onClick={() => onUpdateQuantity(item.book.id, -1)}
                          className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="px-2 text-xs font-bold font-mono text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.book.id, 1)}
                          className="px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold font-mono text-slate-900">
                          Rp {(item.book.harga * item.quantity).toLocaleString('id-ID')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Subtotal & Checkout Button */}
          {items.length > 0 && (
            <div className="p-6 bg-white border-t border-slate-200 space-y-4">
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Total Produk</span>
                  <span>{items.reduce((acc, i) => acc + i.quantity, 0)} buku</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono font-semibold text-slate-900">
                    Rp {subtotal.toLocaleString('id-ID')}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total Pembayaran</span>
                  <span className="font-mono text-[#9A7B38] text-base">
                    Rp {subtotal.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              <button
                id="btn-drawer-checkout"
                onClick={onProceedCheckout}
                className="w-full py-3.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#c5a059] text-[#0F172A] font-bold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Lanjut ke Pembayaran</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Transaksi dijamin aman dengan Enkripsi SSL 256-bit</span>
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
