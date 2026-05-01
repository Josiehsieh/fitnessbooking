import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, CalendarDays, Rocket, Loader2, LogOut, Receipt, Clock, AlertCircle, CheckCircle2, XCircle, User as UserIcon, Lock, Save, ChevronDown, ChevronUp, Bell, Mail, MessageSquare, RefreshCw, History } from 'lucide-react';
import { Screen } from '../App';
import { api, Booking, User, Order, NotificationPrefs, clearGetCache } from '../api/client';

interface DashboardScreenProps {
  onNavigate: (screen: Screen) => void;
  user: User | null;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
}

const CLASS_IMAGES: Record<string, string> = {
  default: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?auto=format&fit=crop&q=80&w=200',
  yoga: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?auto=format&fit=crop&q=80&w=200',
  pilates: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=200',
};

function getImage(name: string) {
  if (name.includes('瑜珈') || name.includes('Yoga')) return CLASS_IMAGES.yoga;
  if (name.includes('皮拉提斯') || name.includes('Pilates')) return CLASS_IMAGES.pilates;
  return CLASS_IMAGES.default;
}

function formatDatetime(dt: string) {
  if (!dt) return '--';
  const [date, time] = dt.split(' ');
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日 · ${time}`;
}

function parseClassDatetime(dt: string): Date | null {
  if (!dt) return null;
  const iso = dt.replace(' ', 'T');
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function canCancel(dt: string): boolean {
  const d = parseClassDatetime(dt);
  if (!d) return true;
  const hoursUntil = (d.getTime() - Date.now()) / 3_600_000;
  return hoursUntil >= 6;
}

function isPastClass(dt: string): boolean {
  const d = parseClassDatetime(dt);
  if (!d) return false;
  return d.getTime() < Date.now();
}

function formatExpireNotice(expire?: string): { text: string; urgent: boolean } | null {
  if (!expire) return null;
  const d = new Date(expire);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `已於 ${expire} 過期`, urgent: true };
  if (days === 0) return { text: `今日到期（${expire}）`, urgent: true };
  if (days <= 7) return { text: `還有 ${days} 天到期（${expire}）`, urgent: true };
  return { text: `有效期至 ${expire}`, urgent: false };
}

export default function DashboardScreen({ onNavigate, user, onLogout, onUserUpdated }: DashboardScreenProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lastRefreshRef = useRef(0);

  const credits = user?.credits ?? 0;
  const creditBatches = user?.credit_lots;
  const expireNotice =
    !creditBatches?.length ? formatExpireNotice(user?.credits_expire_at) : null;
  const hasPendingOrder = orders.some((o) => o.status === 'pending');

  // Upcoming = class hasn't started yet; History = class_datetime is in the past.
  // Both lists are sorted chronologically (soonest first / most recent first).
  const upcomingBookings = bookings
    .filter((b) => !isPastClass(b.class_datetime))
    .sort((a, b) => a.class_datetime.localeCompare(b.class_datetime));
  const pastBookings = bookings
    .filter((b) => isPastClass(b.class_datetime))
    .sort((a, b) => b.class_datetime.localeCompare(a.class_datetime));

  // Refetch bookings + orders + fresh user (credits may have been topped up by admin).
  const refresh = useCallback(
    async (opts?: { force?: boolean; silent?: boolean }) => {
      if (!user) return;
      const now = Date.now();
      // Throttle automatic refreshes to at most once every 5s unless forced.
      if (!opts?.force && now - lastRefreshRef.current < 5000) return;
      lastRefreshRef.current = now;
      if (opts?.force) clearGetCache('/api/');
      if (!opts?.silent) setRefreshing(true);
      try {
        const [me, b, o] = await Promise.all([
          api.auth.getMe(),
          api.bookings.list(),
          api.orders.listMine(),
        ]);
        setBookings(b.bookings);
        setOrders(o.orders);
        // Propagate the fresh user so credits / expire date update across the app.
        if (me?.user) onUserUpdated(me.user);
      } catch (err: unknown) {
        if (!opts?.silent) setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRefreshing(false);
        setLoading(false);
      }
    },
    [user, onUserUpdated],
  );

  useEffect(() => {
    refresh({ force: true, silent: true });
  }, [refresh]);

  useEffect(() => {
    const onFocus = () => refresh({ force: true, silent: true });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh({ force: true, silent: true });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  // Poll every 30s while there is a pending order awaiting admin confirmation.
  // Matches the backend sheet cache TTL so most polls hit cache cheaply.
  useEffect(() => {
    if (!hasPendingOrder) return;
    const id = window.setInterval(() => {
      refresh({ force: true, silent: true });
    }, 30000);
    return () => window.clearInterval(id);
  }, [hasPendingOrder, refresh]);

  const handleCancel = async (bookingId: string) => {
    if (!confirm('確定要取消這堂課嗎？取消後堂數會退還。')) return;
    setCancellingId(bookingId);
    try {
      const res = await api.bookings.cancel(bookingId);
      setBookings((prev) => prev.filter((b) => b.booking_id !== bookingId));
      const me = await api.auth.getMe();
      if (me?.user) onUserUpdated(me.user);
      alert(`課程已取消，堂數已退還。目前剩餘：${res.credits} 堂`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '取消失敗');
    } finally {
      setCancellingId(null);
    }
  };

  if (!user) {
    return (
      <div className="pt-32 pb-20 text-center">
        <p className="text-on-surface-variant text-lg">請先登入以查看儀表板</p>
        <button onClick={() => onNavigate('login')} className="mt-6 bg-primary text-on-primary px-8 py-3 rounded-full font-bold">
          登入
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-32 pb-20 max-w-7xl mx-auto px-6 md:px-8"
    >
      <header className="mb-16 flex justify-between items-start">
        <div>
          <h1 className="text-4xl md:text-[3.5rem] font-bold font-headline text-on-surface leading-tight tracking-tight mb-4">
            您的運動空間
          </h1>
          <p className="text-on-surface-variant text-lg max-w-2xl leading-relaxed">
            歡迎回來，{user.name}。以下是您的律動概況。
          </p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-error transition-colors mt-2"
        >
          <LogOut className="w-4 h-4" />
          登出
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          {/* Usage Card */}
          <div className="bg-surface-container-lowest p-8 md:p-10 rounded-3xl shadow-sm border border-outline-variant/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant">可預約堂數</h3>
              <button
                onClick={() => refresh({ force: true })}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary transition-colors disabled:opacity-50"
                title="重新整理堂數"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? '更新中' : '重新整理'}
              </button>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-6xl font-bold font-headline text-primary">{credits}</span>
              <span className="text-2xl font-medium text-outline">堂</span>
            </div>
            {hasPendingOrder && (
              <p className="mt-3 text-xs text-on-surface-variant flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                有訂單等待管理員確認，收款後堂數會自動更新
              </p>
            )}

            {creditBatches && creditBatches.length > 0 && (
              <div className="mt-6 px-4 py-3 rounded-2xl bg-surface-container text-on-surface-variant border border-outline-variant/10">
                <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  依購買批次（堂數與效期分開計算）
                </p>
                <ul className="text-sm space-y-1.5 font-medium">
                  {creditBatches.map((lot, i) => (
                    <li key={`${lot.order_id || 'lot'}-${i}`}>
                      <span className="text-primary font-bold">{lot.remaining}</span> 堂
                      {lot.expire_at ? (
                        <span className="text-on-surface-variant"> · 效期至 {lot.expire_at}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!creditBatches?.length && expireNotice && (
              <div className={`mt-6 flex items-center gap-2 px-4 py-3 rounded-2xl ${
                expireNotice.urgent
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-surface-container text-on-surface-variant'
              }`}>
                <Clock className="w-4 h-4 shrink-0" />
                <p className="text-sm font-medium">{expireNotice.text}</p>
              </div>
            )}

            <div className="mt-8 pt-8 border-t border-outline-variant/10 flex gap-3">
              <button
                onClick={() => onNavigate(credits > 0 ? 'schedule' : 'checkout')}
                className="flex-1 py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity"
              >
                {credits > 0 ? '預約課程' : '購買堂數'}
              </button>
              <button
                onClick={() => onNavigate('checkout')}
                className="px-4 py-3 rounded-full bg-surface-container text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors flex items-center gap-1"
                title="加購堂數"
              >
                <Sparkles className="w-4 h-4" />
                加購
              </button>
            </div>
          </div>

          {/* Orders status */}
          {orders.length > 0 && (
            <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-sm border border-outline-variant/10">
              <div className="flex items-center gap-2 mb-5">
                <Receipt className="w-4 h-4 text-on-surface-variant" />
                <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant">我的訂單</h3>
              </div>
              <div className="space-y-3">
                {orders.slice(0, 5).map((o) => (
                  <OrderRow key={o.order_id} order={o} />
                ))}
              </div>
            </div>
          )}

          {/* Profile card */}
          <ProfileCard user={user} onUserUpdated={onUserUpdated} />
          <NotificationsCard />

          {/* Personal Message */}
          <div className="bg-secondary-container/40 p-8 md:p-10 rounded-3xl relative overflow-hidden group">
            <div className="relative z-10">
              <h4 className="text-xl font-bold font-headline text-on-secondary-container mb-3">
                {upcomingBookings.length > 0 ? `已預約 ${upcomingBookings.length} 堂課` : '還沒有預約課程'}
              </h4>
              <p className="text-on-secondary-container/80 text-sm leading-relaxed mb-8 font-medium">
                「力量並非源自體力，而是源自不屈不撓的意志。」
              </p>
              <button
                onClick={() => onNavigate('schedule')}
                className="text-sm font-bold font-headline text-on-secondary-container flex items-center gap-2 group-hover:gap-4 transition-all"
              >
                查看課程
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <svg width="160" height="160" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          <section>
            <div className="flex justify-between items-end mb-6 px-2">
              <h2 className="text-2xl font-bold font-headline">我已預約的課程</h2>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}

            {error && (
              <div className="text-center py-16 text-error bg-error/5 rounded-3xl">
                <p className="font-bold">載入失敗：{error}</p>
              </div>
            )}

            {!loading && !error && upcomingBookings.length === 0 && (
              <div className="text-center py-16 bg-surface-container-low rounded-3xl">
                <p className="text-on-surface-variant font-medium">尚無即將到來的課程</p>
                <button
                  onClick={() => onNavigate('schedule')}
                  className="mt-4 bg-primary text-on-primary px-6 py-2.5 rounded-full font-bold text-sm"
                >
                  立即預約
                </button>
              </div>
            )}

            <div className="space-y-4">
              {upcomingBookings.map((booking) => (
                <BookingCard
                  key={booking.booking_id}
                  booking={booking}
                  past={false}
                  cancelling={cancellingId === booking.booking_id}
                  onCancel={() => handleCancel(booking.booking_id)}
                />
              ))}
            </div>
          </section>

          {/* History */}
          {pastBookings.length > 0 && (
            <section>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full flex justify-between items-center mb-4 px-2 group"
              >
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-on-surface-variant" />
                  <h2 className="text-xl font-bold font-headline text-on-surface-variant group-hover:text-on-surface transition-colors">
                    歷史紀錄
                  </h2>
                  <span className="text-xs font-medium text-outline bg-surface-container px-2 py-0.5 rounded-full">
                    {pastBookings.length}
                  </span>
                </div>
                {historyOpen ? (
                  <ChevronUp className="w-4 h-4 text-on-surface-variant" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                )}
              </button>

              {historyOpen && (
                <div className="space-y-3">
                  {pastBookings.map((booking) => (
                    <BookingCard key={booking.booking_id} booking={booking} past />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* CTA */}
          <div className="bg-gradient-to-r from-primary-container/30 to-tertiary-container/30 p-1 rounded-[2.5rem] mt-4">
            <div className="bg-surface-container-lowest/90 backdrop-blur-md p-8 md:p-10 rounded-[2.4rem] flex flex-col md:flex-row items-center gap-8">
              <div className="shrink-0 text-primary bg-primary/10 p-4 rounded-full">
                <Rocket className="w-10 h-10" />
              </div>
              <div className="flex-grow text-center md:text-left">
                <h3 className="text-2xl font-bold font-headline mb-3">準備好開始下一次旅程了嗎？</h3>
                <p className="text-on-surface-variant font-medium">
                  {credits > 0
                    ? `您還有 ${credits} 堂可以預約，快來探索新課程吧！`
                    : '堂數已用完，購買套票繼續您的律動旅程。'}
                </p>
              </div>
              <div className="shrink-0 w-full md:w-auto mt-4 md:mt-0">
                <button
                  onClick={() => onNavigate(credits > 0 ? 'schedule' : 'checkout')}
                  className="w-full md:w-auto bg-primary text-on-primary px-10 py-4 rounded-full font-headline font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all"
                >
                  {credits > 0 ? '探索課程' : '購買套票'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

interface BookingCardProps {
  booking: Booking;
  past: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
}

function BookingCard({ booking, past, cancelling, onCancel }: BookingCardProps) {
  const cancellable = !past && canCancel(booking.class_datetime);

  if (past) {
    return (
      <div className="bg-surface-container-low/60 rounded-2xl border border-outline-variant/10 opacity-80 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-4 p-4">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 grayscale">
            <img
              src={getImage(booking.class_name)}
              alt={booking.class_name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-grow min-w-0">
            <h4 className="text-base font-bold font-headline text-on-surface-variant truncate">
              {booking.class_name}
            </h4>
            <p className="text-xs text-outline flex items-center gap-1.5 mt-1 font-medium">
              <CalendarDays className="w-3.5 h-3.5" />
              {formatDatetime(booking.class_datetime)}
            </p>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full">
            已完成
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest p-2 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-outline-variant/10">
      <div className="flex flex-col md:flex-row items-center gap-6 p-4 md:p-6">
        <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0">
          <img src={getImage(booking.class_name)} alt={booking.class_name} className="w-full h-full object-cover" />
        </div>
        <div className="flex-grow text-center md:text-left">
          <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
            <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
              已確認
            </span>
            {!cancellable && (
              <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                6 小時內
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold font-headline mb-2">{booking.class_name}</h3>
          <p className="text-on-surface-variant text-sm flex items-center justify-center md:justify-start gap-2 font-medium">
            <CalendarDays className="w-4 h-4" />
            {formatDatetime(booking.class_datetime)}
          </p>
        </div>
        <div className="shrink-0 w-full md:w-auto mt-4 md:mt-0">
          <button
            onClick={onCancel}
            disabled={cancelling || !cancellable}
            title={!cancellable ? '課程開始前 6 小時內無法取消' : ''}
            className="w-full md:w-auto px-6 py-3 rounded-full border border-error/30 text-error font-headline font-bold text-sm hover:bg-error/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            取消課程
          </button>
        </div>
      </div>
    </div>
  );
}


function ProfileCard({ user, onUserUpdated }: { user: User; onUserUpdated: (u: User) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const hasPassword = user.has_password ?? true;
  const nameChanged = name.trim() && name.trim() !== user.name;
  const wantsPasswordChange = Boolean(newPassword || confirmPassword || (hasPassword && currentPassword));
  const canSave = nameChanged || wantsPasswordChange;

  const resetPasswordFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSave = async () => {
    setMessage(null);

    if (wantsPasswordChange) {
      if (newPassword.length < 6) {
        setMessage({ text: '新密碼至少 6 個字元', type: 'error' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setMessage({ text: '兩次密碼輸入不一致', type: 'error' });
        return;
      }
      if (hasPassword && !currentPassword) {
        setMessage({ text: '請輸入目前密碼', type: 'error' });
        return;
      }
    }

    const payload: { name?: string; current_password?: string; new_password?: string } = {};
    if (nameChanged) payload.name = name.trim();
    if (wantsPasswordChange) {
      payload.new_password = newPassword;
      if (hasPassword) payload.current_password = currentPassword;
    }

    setSaving(true);
    try {
      const res = await api.auth.updateMe(payload);
      onUserUpdated(res.user);
      setMessage({ text: res.message || '已更新', type: 'success' });
      resetPasswordFields();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : '更新失敗，請再試一次',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-sm border border-outline-variant/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <UserIcon className="w-4 h-4 text-on-surface-variant" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant">個人資料</h3>
            <p className="text-sm text-on-surface mt-1">{user.email}</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
      </button>

      {open && (
        <div className="mt-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant mb-2 uppercase tracking-wider">顯示名稱</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 outline-none text-sm"
              placeholder="您的名稱"
            />
          </div>

          {/* Password */}
          <div className="pt-5 border-t border-outline-variant/15">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="w-3.5 h-3.5 text-on-surface-variant" />
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {hasPassword ? '變更密碼' : '設定密碼'}
              </label>
            </div>
            {hasPassword && (
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="目前密碼"
                className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 outline-none text-sm mb-2"
              />
            )}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密碼（至少 6 個字元）"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 outline-none text-sm mb-2"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次輸入新密碼"
              className="w-full px-4 py-2.5 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 outline-none text-sm"
            />
            {!hasPassword && (
              <p className="text-[11px] text-on-surface-variant mt-2">
                您目前透過第三方登入，設定密碼後也可用 Email 登入
              </p>
            )}
          </div>

          {/* Message */}
          {message && (
            <div
              className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-error/10 text-error border border-error/20'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <p>{message.text}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full py-3 rounded-full bg-primary text-on-primary text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            儲存變更
          </button>
        </div>
      )}
    </div>
  );
}

function NotificationsCard() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<'email' | 'line' | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!open || prefs) return;
    setLoading(true);
    api.auth
      .getNotifications()
      .then(setPrefs)
      .catch((e) => setMessage({ text: e instanceof Error ? e.message : '讀取失敗', type: 'error' }))
      .finally(() => setLoading(false));
  }, [open, prefs]);

  const toggle = async (key: 'notify_email' | 'notify_line') => {
    if (!prefs) return;
    const next = !prefs[key];
    setSaving(key === 'notify_email' ? 'email' : 'line');
    setMessage(null);
    try {
      const res = await api.auth.updateNotifications({ [key]: next });
      setPrefs({ ...prefs, notify_email: res.notify_email, notify_line: res.notify_line });
      setMessage({ text: '通知設定已更新', type: 'success' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : '更新失敗', type: 'error' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-surface-container-lowest p-8 rounded-3xl shadow-sm border border-outline-variant/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <Bell className="w-4 h-4 text-on-surface-variant" />
          <div>
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant">通知設定</h3>
            <p className="text-sm text-on-surface mt-1">預約 / 訂單 / 堂數變動通知</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-on-surface-variant" /> : <ChevronDown className="w-4 h-4 text-on-surface-variant" />}
      </button>

      {open && (
        <div className="mt-6 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" />
              讀取中…
            </div>
          )}

          {prefs && (
            <>
              <ToggleRow
                icon={<Mail className="w-4 h-4" />}
                title="Email 通知"
                desc={
                  prefs.has_real_email
                    ? '重要通知會寄到您的信箱'
                    : '您目前透過 LINE 登入，尚未綁定 Email（無法寄送）'
                }
                enabled={prefs.notify_email}
                disabled={!prefs.has_real_email || !prefs.server_channels.email}
                warning={
                  !prefs.server_channels.email ? '（後台尚未設定 SMTP）' : undefined
                }
                loading={saving === 'email'}
                onToggle={() => toggle('notify_email')}
              />

              <ToggleRow
                icon={<MessageSquare className="w-4 h-4" />}
                title="LINE 推播"
                desc={
                  prefs.line_linked
                    ? '已綁定 LINE，可接收推播'
                    : '請改用 LINE 登入，並加入本站官方帳號為好友'
                }
                enabled={prefs.notify_line}
                disabled={!prefs.line_linked || !prefs.server_channels.line}
                warning={
                  !prefs.server_channels.line ? '（後台尚未設定 LINE Messaging API）' : undefined
                }
                loading={saving === 'line'}
                onToggle={() => toggle('notify_line')}
              />
            </>
          )}

          {message && (
            <div
              className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-error/10 text-error border border-error/20'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <p>{message.text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  enabled,
  disabled,
  warning,
  loading,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  enabled: boolean;
  disabled?: boolean;
  warning?: string;
  loading?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-surface-container-low">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-on-surface">{title}</div>
          <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
            {desc}
            {warning && <span className="text-amber-700"> {warning}</span>}
          </p>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled || loading}
        className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${
          enabled ? 'bg-primary' : 'bg-outline-variant/40'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-label="toggle"
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? 'translate-x-5' : ''
          }`}
        />
        {loading && (
          <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-white" />
        )}
      </button>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  const statusConfig = {
    pending: { icon: <Clock className="w-3.5 h-3.5" />, label: '待付款', cls: 'bg-amber-100 text-amber-800' },
    paid: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: '已付款', cls: 'bg-green-100 text-green-800' },
    cancelled: { icon: <XCircle className="w-3.5 h-3.5" />, label: '已取消', cls: 'bg-gray-100 text-gray-600' },
  } as const;
  const cfg = statusConfig[order.status] || statusConfig.pending;
  return (
    <div className="flex justify-between items-start gap-3 p-3 rounded-2xl bg-surface-container/50 hover:bg-surface-container transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.cls}`}>
            {cfg.icon}
            {cfg.label}
          </span>
          <span className="text-xs text-on-surface-variant">{order.quantity} 堂</span>
        </div>
        <p className="text-xs text-on-surface-variant font-mono truncate">#{order.order_id}</p>
        {order.status === 'pending' && (
          <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            請完成匯款並傳截圖給小助理
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-primary">NT${order.total.toLocaleString()}</p>
      </div>
    </div>
  );
}
