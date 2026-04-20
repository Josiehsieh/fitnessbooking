import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2, CheckCircle2, Minus, Plus, Tag, AlertCircle } from 'lucide-react';
import { Screen } from '../App';
import { api, ClassItem, User, BookingResult, Order, PaymentInfo } from '../api/client';

interface CheckoutScreenProps {
  onNavigate: (screen: Screen) => void;
  selectedClass: ClassItem | null;
  user: User | null;
  onBookingComplete: (result: BookingResult, credits: number) => void;
  onOrderCreated: (order: Order, paymentInfo: PaymentInfo) => void;
}

const PRICE_PER_CLASS = 150;
const BULK_MIN = 4;
const BULK_DISCOUNT = 20;
const COUPON_DISCOUNT = 20;

function calcPrice(qty: number, couponApplied: boolean, bulkDiscountEligible: boolean) {
  const subtotal = qty * PRICE_PER_CLASS;
  const bulkDiscount = qty >= BULK_MIN && bulkDiscountEligible ? BULK_DISCOUNT : 0;
  const couponDiscount = couponApplied ? COUPON_DISCOUNT : 0;
  const discount = bulkDiscount + couponDiscount;
  return { subtotal, bulkDiscount, couponDiscount, discount, total: Math.max(0, subtotal - discount) };
}

export default function CheckoutScreen({
  onNavigate,
  selectedClass,
  user,
  onBookingComplete,
  onOrderCreated,
}: CheckoutScreenProps) {
  const [quantity, setQuantity] = useState(1);
  const [couponInput, setCouponInput] = useState('');
  const [couponApplied, setCouponApplied] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bulkDiscountEligible, setBulkDiscountEligible] = useState(true);

  const hasCredits = (user?.credits ?? 0) >= 1;
  const canBookWithCredits = Boolean(selectedClass) && hasCredits;
  const pricing = calcPrice(quantity, Boolean(couponApplied), bulkDiscountEligible);

  useEffect(() => {
    let alive = true;
    if (!user) return;
    (async () => {
      try {
        const res = await api.orders.listMine();
        if (!alive) return;
        const used = res.orders.some(
          (o) => o.status !== 'cancelled' && Number(o.quantity || 0) >= BULK_MIN
        );
        setBulkDiscountEligible(!used);
      } catch {
        // Keep optimistic default to avoid blocking checkout UI.
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const changeQty = (delta: number) => {
    setQuantity((q) => Math.max(1, Math.min(50, q + delta)));
  };

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    // Phase 1: simple client-side hint. Backend is the source of truth.
    if (code === 'NEW20') {
      setCouponApplied(code);
      setError('');
    } else {
      setError('折扣碼無效');
    }
  };

  const removeCoupon = () => {
    setCouponApplied('');
    setCouponInput('');
  };

  // 有堂數 + 選了課 → 直接預約（扣 1 堂）
  const handleBookWithCredits = async () => {
    if (!user || !selectedClass) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.bookings.create(selectedClass.class_id);
      onBookingComplete(res.booking, res.credits_remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : '預約失敗，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  // 購買堂數 → 建立 pending 訂單 → 導到付款頁
  const handleCreateOrder = async () => {
    if (!user) { onNavigate('login'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.orders.create(quantity, couponApplied || undefined);
      onOrderCreated(res.order, res.payment_info);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立訂單失敗，請再試一次');
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
              {canBookWithCredits
                ? '您的堂數充足，直接完成預約即可'
                : '購買堂數，完成匯款後即可預約課程（堂數有效期至本月月底）'}
            </p>
          </div>

          {/* Selected class info */}
          {selectedClass && (
            <section className="space-y-4">
              <h2 className="text-xl font-bold text-primary flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6" />
                選擇的課程
              </h2>
              <div className="bg-surface-container-lowest rounded-3xl p-6 md:p-8 border border-outline-variant/10 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h3 className="text-2xl font-bold text-on-surface mb-1">{selectedClass.name}</h3>
                    <p className="text-on-surface-variant text-sm font-medium">
                      {selectedClass.day_label} · {selectedClass.time} · {selectedClass.duration} 分鐘
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-primary">1 堂</span>
                </div>
              </div>
            </section>
          )}

          {/* Has credits → just show summary */}
          {canBookWithCredits && (
            <div className="bg-secondary-container/30 rounded-2xl p-5 flex items-center gap-4">
              <CheckCircle2 className="w-6 h-6 text-secondary shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-on-surface">
                  您有 {user?.credits} 堂可用
                  {user?.credits_expire_at && (
                    <span className="text-sm font-normal text-on-surface-variant ml-2">
                      （有效期至 {user.credits_expire_at}）
                    </span>
                  )}
                </p>
                <p className="text-sm text-on-surface-variant">
                  系統將扣除 1 堂後完成預約，無需額外付款
                </p>
              </div>
            </div>
          )}

          {/* Buy credits flow – shown whenever the user is NOT just booking with existing credits */}
          {!canBookWithCredits && (
            <section className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-on-surface mb-1">選擇購買堂數</h2>
                <p className="text-sm text-on-surface-variant font-medium">
                  每堂 NT${PRICE_PER_CLASS}・購買 {BULK_MIN} 堂以上可折 NT${BULK_DISCOUNT}（每帳號限一次）
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

                {quantity >= BULK_MIN && bulkDiscountEligible ? (
                  <div className="mt-6 flex items-center gap-3 bg-secondary-container/40 rounded-2xl px-5 py-3">
                    <Tag className="w-4 h-4 text-secondary shrink-0" />
                    <p className="text-sm font-bold text-on-secondary-container">
                      已達 {BULK_MIN} 堂折扣！省下 NT${BULK_DISCOUNT}
                    </p>
                  </div>
                ) : quantity >= BULK_MIN && !bulkDiscountEligible ? (
                  <div className="mt-6 flex items-center gap-3 bg-surface-container rounded-2xl px-5 py-3">
                    <AlertCircle className="w-4 h-4 text-on-surface-variant shrink-0" />
                    <p className="text-sm text-on-surface-variant font-medium">
                      此帳號已使用過 {BULK_MIN} 堂折扣，這次不再折抵
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

              {/* Coupon code */}
              <div className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/10">
                <h3 className="text-sm font-bold text-on-surface mb-3">折扣碼</h3>
                {couponApplied ? (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2 text-green-700">
                      <Tag className="w-4 h-4" />
                      <span className="font-bold">{couponApplied}</span>
                      <span className="text-sm">已套用 -NT${COUPON_DISCOUNT}</span>
                    </div>
                    <button
                      onClick={removeCoupon}
                      className="text-xs text-green-700 hover:text-green-800 underline"
                    >
                      移除
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value)}
                      placeholder="輸入折扣碼（例：NEW20）"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container-low border-none outline-none focus:ring-2 focus:ring-primary/20 text-sm"
                    />
                    <button
                      onClick={applyCoupon}
                      disabled={!couponInput.trim()}
                      className="px-5 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
                    >
                      套用
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* ── Right Column: Order Summary ── */}
        <aside className="lg:col-span-5">
          <div className="bg-surface-container-low rounded-3xl p-8 md:p-10 sticky top-32 space-y-8 border border-outline-variant/5">
            <h3 className="text-2xl font-bold">訂單摘要</h3>

            <div className="space-y-4 font-medium">
              {canBookWithCredits ? (
                <>
                  <div className="flex justify-between items-center text-on-surface">
                    <span>{selectedClass.name}</span>
                    <span>1 堂</span>
                  </div>
                  <div className="flex justify-between items-center text-secondary">
                    <span>使用已有堂數扣抵</span>
                    <span className="font-bold">-1 堂</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-on-surface">
                    <span>{quantity} 堂 × NT${PRICE_PER_CLASS}</span>
                    <span>NT${pricing.subtotal}</span>
                  </div>
                  {pricing.bulkDiscount > 0 && (
                    <div className="flex justify-between items-center text-secondary">
                      <span className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        {BULK_MIN} 堂以上折扣
                      </span>
                      <span className="font-bold">-NT${pricing.bulkDiscount}</span>
                    </div>
                  )}
                  {pricing.couponDiscount > 0 && (
                    <div className="flex justify-between items-center text-secondary">
                      <span className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        折扣碼 {couponApplied}
                      </span>
                      <span className="font-bold">-NT${pricing.couponDiscount}</span>
                    </div>
                  )}
                </>
              )}

              <div className="h-px bg-outline-variant/20"></div>

              <div className="flex justify-between items-center text-xl font-bold">
                <span>應付金額</span>
                <span className="text-primary text-2xl">
                  {canBookWithCredits ? 'NT$0' : `NT$${pricing.total}`}
                </span>
              </div>

              {canBookWithCredits && (
                <p className="text-xs text-on-surface-variant text-right">（以堂數扣抵，無需付款）</p>
              )}
            </div>

            {error && (
              <div className="flex gap-2 items-start text-sm text-error bg-error/5 rounded-2xl py-3 px-4">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {canBookWithCredits ? (
              <button
                onClick={handleBookWithCredits}
                disabled={loading}
                className="w-full bg-gradient-to-br from-primary to-primary-dim text-on-primary py-5 rounded-full font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                確認預約（扣 1 堂）
              </button>
            ) : (
              <button
                onClick={handleCreateOrder}
                disabled={loading}
                className="w-full bg-gradient-to-br from-primary to-primary-dim text-on-primary py-5 rounded-full font-bold text-lg shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                送出訂單・NT${pricing.total}
              </button>
            )}

            <p className="text-xs text-on-surface-variant text-center leading-relaxed">
              {canBookWithCredits
                ? '⏰ 取消政策：課程開始前 6 小時可自行取消並退回堂數'
                : '💳 送出訂單後將顯示匯款資訊，管理員確認入帳後自動加入堂數'}
            </p>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
