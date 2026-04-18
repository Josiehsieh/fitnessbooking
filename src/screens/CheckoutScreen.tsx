import { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, Mail, MessageCircle, Lock, Loader2, CheckCircle2, Minus, Plus, Tag } from 'lucide-react';
import { Screen } from '../App';
import { api, ClassItem, User, BookingResult } from '../api/client';

interface CheckoutScreenProps {
  onNavigate: (screen: Screen) => void;
  selectedClass: ClassItem | null;
  user: User | null;
  onBookingComplete: (result: BookingResult, credits: number) => void;
  onUpdateCredits: (credits: number) => void;
}

const PRICE_PER_CLASS = 150;
const BULK_MIN = 4;
const BULK_DISCOUNT = 20;

function calcPrice(qty: number) {
  const subtotal = qty * PRICE_PER_CLASS;
  const discount = qty >= BULK_MIN ? BULK_DISCOUNT : 0;
  return { subtotal, discount, total: subtotal - discount };
}

export default function CheckoutScreen({
  onNavigate,
  selectedClass,
  user,
  onBookingComplete,
  onUpdateCredits,
}: CheckoutScreenProps) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasCredits = (user?.credits ?? 0) >= 1;
  const pricing = calcPrice(quantity);

  const changeQty = (delta: number) => {
    setQuantity((q) => Math.max(1, Math.min(50, q + delta)));
  };

  // Case A: User has credits → just book the class (no purchase needed)
  // Case B: User has no credits → buy credits then book
  // Case C: No selected class → purchase only mode

  const handleConfirm = async () => {
    if (!user) { onNavigate('login'); return; }
    if (!selectedClass) { setError('未選擇課程，請返回課程列表'); return; }

    setLoading(true);
    setError('');
    try {
      if (!hasCredits) {
        const pkgRes = await api.packages.purchase(quantity);
        onUpdateCredits(pkgRes.credits);
      }
      const bookRes = await api.bookings.create(selectedClass.class_id);
      onBookingComplete(bookRes.booking, bookRes.credits_remaining);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '發生錯誤，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseOnly = async () => {
    if (!user) { onNavigate('login'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.packages.purchase(quantity);
      onUpdateCredits(res.credits);
      alert(`✅ 成功購買 ${quantity} 堂！目前剩餘：${res.credits} 堂\n實付：NT$${res.pricing.total}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '購買失敗，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-32 pb-20 px-6 max-w-7xl mx-auto"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

        {/* ── Left Column ── */}
        <div className="lg:col-span-7 space-y-12">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-on-surface mb-4">
              完成您的訂單
            </h1>
            <p className="text-on-surface-variant text-lg font-medium">
              在空間中保留您的位置。請確認下方的律動細節。
            </p>
          </div>

          {/* Selected class info */}
          {selectedClass && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-primary flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6" />
                預約的課程
              </h2>
              <div className="bg-surface-container-lowest rounded-3xl p-6 md:p-8 border border-outline-variant/10 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-on-surface mb-1">{selectedClass.name}</h3>
                    <p className="text-on-surface-variant text-sm font-medium">
                      {selectedClass.day_label} · {selectedClass.time} · {selectedClass.duration} 分鐘
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-primary">NT${PRICE_PER_CLASS}</span>
                </div>
              </div>
            </section>
          )}

          {/* Credits status */}
          {selectedClass && hasCredits && (
            <div className="bg-secondary-container/30 rounded-2xl p-5 flex items-center gap-4">
              <CheckCircle2 className="w-6 h-6 text-secondary shrink-0" />
              <div>
                <p className="font-bold text-on-surface">您有 {user?.credits} 堂可用</p>
                <p className="text-sm text-on-surface-variant">系統將扣除 1 堂後完成預約，無需額外付款</p>
              </div>
            </div>
          )}

          {/* Quantity selector (shown when buying credits) */}
          {(!hasCredits || !selectedClass) && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-on-surface mb-1">選擇購買堂數</h2>
                <p className="text-sm text-on-surface-variant font-medium">
                  每堂 NT${PRICE_PER_CLASS}・購買 {BULK_MIN} 堂以上自動折扣 NT${BULK_DISCOUNT}
                </p>
              </div>

              {/* Stepper */}
              <div className="bg-surface-container-lowest rounded-3xl p-8 border border-outline-variant/10 shadow-sm">
                <div className="flex items-center justify-between gap-6">
                  <button
                    onClick={() => changeQty(-1)}
                    disabled={quantity <= 1}
                    className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-5 h-5" />
                  </button>

                  <div className="text-center flex-1">
                    <span className="text-6xl font-bold font-headline text-primary">{quantity}</span>
                    <p className="text-on-surface-variant text-sm mt-1 font-medium">堂課程</p>
                  </div>

                  <button
                    onClick={() => changeQty(1)}
                    disabled={quantity >= 50}
                    className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary hover:bg-primary-container transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick presets */}
                <div className="flex gap-2 mt-8 flex-wrap">
                  {[1, 4, 8, 10, 20].map((n) => (
                    <button
                      key={n}
                      onClick={() => setQuantity(n)}
                      className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                        quantity === n
                          ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                          : 'bg-surface-container text-on-surface-variant hover:bg-primary-container hover:text-primary'
                      }`}
                    >
                      {n} 堂
                    </button>
                  ))}
                </div>

                {/* Discount notice */}
                {quantity >= BULK_MIN ? (
                  <div className="mt-6 flex items-center gap-3 bg-secondary-container/40 rounded-2xl px-5 py-3">
                    <Tag className="w-4 h-4 text-secondary shrink-0" />
                    <p className="text-sm font-bold text-on-secondary-container">
                      已達 {BULK_MIN} 堂折扣！省下 NT${BULK_DISCOUNT} 🎉
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 flex items-center gap-3 bg-surface-container rounded-2xl px-5 py-3">
                    <Tag className="w-4 h-4 text-on-surface-variant shrink-0" />
                    <p className="text-sm text-on-surface-variant font-medium">
                      再買 <strong className="text-primary">{BULK_MIN - quantity} 堂</strong>，即可省下 NT${BULK_DISCOUNT}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notification preference */}
          <section className="space-y-6">
            <h2 className="text-xl font-bold text-primary flex items-center gap-3">
              <Bell className="w-6 h-6" />
              通知方式
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="relative flex items-center p-6 bg-surface-container-lowest border border-primary/20 rounded-2xl cursor-pointer shadow-sm">
                <input type="radio" name="notify" className="hidden" defaultChecked />
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-container/30 flex items-center justify-center text-primary">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-bold text-on-surface">電子郵件</span>
                    <span className="text-sm text-on-surface-variant font-medium">{user?.email ?? 'hello@example.com'}</span>
                  </div>
                </div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 border-2 border-primary rounded-full flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-primary rounded-full"></div>
                </div>
              </label>

              <label className="relative flex items-center p-6 bg-surface-container-low border border-transparent rounded-2xl cursor-pointer hover:bg-surface-container-lowest">
                <input type="radio" name="notify" className="hidden" />
                <div className="flex items-center gap-4 text-on-surface-variant">
                  <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="block font-bold text-on-surface">LINE 官方帳號</span>
                    <span className="text-sm font-medium">@josieubound</span>
                  </div>
                </div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 border-2 border-outline-variant rounded-full"></div>
              </label>
            </div>
          </section>
        </div>

        {/* ── Right Column: Order Summary ── */}
        <aside className="lg:col-span-5">
          <div className="bg-surface-container-low rounded-3xl p-8 md:p-10 sticky top-32 space-y-8 border border-outline-variant/5">
            <h3 className="text-2xl font-bold">訂單摘要</h3>

            <div className="space-y-4 font-medium">
              {/* Line items */}
              {selectedClass && hasCredits ? (
                <>
                  <div className="flex justify-between items-center text-on-surface">
                    <span>{selectedClass.name}</span>
                    <span>NT${PRICE_PER_CLASS}</span>
                  </div>
                  <div className="flex justify-between items-center text-secondary">
                    <span>使用已有堂數扣抵</span>
                    <span className="font-bold">-NT${PRICE_PER_CLASS}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-on-surface">
                    <span>{quantity} 堂 × NT${PRICE_PER_CLASS}</span>
                    <span>NT${pricing.subtotal}</span>
                  </div>
                  {pricing.discount > 0 && (
                    <div className="flex justify-between items-center text-secondary">
                      <span className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        4 堂以上折扣
                      </span>
                      <span className="font-bold">-NT${pricing.discount}</span>
                    </div>
                  )}
                </>
              )}

              <div className="h-px bg-outline-variant/20"></div>

              <div className="flex justify-between items-center text-xl font-bold">
                <span>總計</span>
                <span className="text-primary text-2xl">
                  {selectedClass && hasCredits ? 'NT$0' : `NT$${pricing.total}`}
                </span>
              </div>

              {selectedClass && hasCredits && (
                <p className="text-xs text-on-surface-variant text-right">（課堂費用以堂數扣抵）</p>
              )}
            </div>

            {error && (
              <p className="text-sm text-error bg-error/5 rounded-2xl py-3 px-4 text-center">{error}</p>
            )}

            {selectedClass ? (
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="w-full bg-gradient-to-br from-primary to-primary-dim text-on-primary py-5 rounded-full font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {hasCredits ? '確認預約（扣 1 堂）' : `付款 NT$${pricing.total} 並預約`}
              </button>
            ) : (
              <button
                onClick={handlePurchaseOnly}
                disabled={loading}
                className="w-full bg-gradient-to-br from-primary to-primary-dim text-on-primary py-5 rounded-full font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                購買 {quantity} 堂・NT${pricing.total}
              </button>
            )}

            <div className="flex items-center justify-center gap-4 text-on-surface-variant text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                安全支付
              </div>
              <div className="w-1 h-1 rounded-full bg-outline-variant"></div>
              <span>隨時取消</span>
            </div>

            <div className="rounded-2xl overflow-hidden h-40 relative">
              <img
                src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&q=80&w=800"
                alt="Studio"
                className="w-full h-full object-cover opacity-80 mix-blend-multiply"
              />
              <div className="absolute inset-0 bg-primary/10 mix-blend-overlay"></div>
            </div>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
