import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowRight, CalendarDays, Clock, Rocket, Loader2, LogOut } from 'lucide-react';
import { Screen } from '../App';
import { api, Booking, User } from '../api/client';

interface DashboardScreenProps {
  onNavigate: (screen: Screen) => void;
  user: User | null;
  onLogout: () => void;
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

export default function DashboardScreen({ onNavigate, user, onLogout }: DashboardScreenProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const credits = user?.credits ?? 0;
  const TOTAL_CREDITS = 10;

  useEffect(() => {
    if (!user) return;
    api.bookings
      .list()
      .then((res) => setBookings(res.bookings))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  const handleCancel = async (bookingId: string) => {
    if (!confirm('確定要取消這堂課嗎？')) return;
    setCancellingId(bookingId);
    try {
      const res = await api.bookings.cancel(bookingId);
      setBookings((prev) => prev.filter((b) => b.booking_id !== bookingId));
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
            <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-on-surface-variant mb-6">堂數使用情況</h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-bold font-headline text-primary">
                {String(credits).padStart(2, '0')}
              </span>
              <span className="text-2xl font-medium text-outline">/ {TOTAL_CREDITS}</span>
            </div>
            <p className="text-on-surface-variant text-sm mb-8 font-medium">可用堂數</p>

            <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min(100, (credits / TOTAL_CREDITS) * 100)}%` }}
              ></div>
            </div>

            <div className="mt-8 pt-8 border-t border-outline-variant/10 flex justify-between items-center">
              <div>
                <p className="text-2xl font-bold font-headline text-secondary">{credits}</p>
                <p className="text-xs text-on-surface-variant font-bold uppercase tracking-wider">剩餘堂數</p>
              </div>
              <div className="bg-secondary/10 p-4 rounded-full text-secondary-container">
                <Sparkles className="w-6 h-6 text-secondary" />
              </div>
            </div>
          </div>

          {/* Personal Message */}
          <div className="bg-secondary-container/40 p-8 md:p-10 rounded-3xl relative overflow-hidden group">
            <div className="relative z-10">
              <h4 className="text-xl font-bold font-headline text-on-secondary-container mb-3">
                {bookings.length > 0 ? `已預約 ${bookings.length} 堂課` : '還沒有預約課程'}
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

            {!loading && !error && bookings.length === 0 && (
              <div className="text-center py-16 bg-surface-container-low rounded-3xl">
                <p className="text-on-surface-variant font-medium">尚無預約課程</p>
                <button
                  onClick={() => onNavigate('schedule')}
                  className="mt-4 bg-primary text-on-primary px-6 py-2.5 rounded-full font-bold text-sm"
                >
                  立即預約
                </button>
              </div>
            )}

            <div className="space-y-4">
              {bookings.map((booking) => (
                <div
                  key={booking.booking_id}
                  className="bg-surface-container-lowest p-2 rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-300 border border-outline-variant/10"
                >
                  <div className="flex flex-col md:flex-row items-center gap-6 p-4 md:p-6">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0">
                      <img
                        src={getImage(booking.class_name)}
                        alt={booking.class_name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-grow text-center md:text-left">
                      <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-3">
                        <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          已確認
                        </span>
                      </div>
                      <h3 className="text-xl font-bold font-headline mb-2">{booking.class_name}</h3>
                      <p className="text-on-surface-variant text-sm flex items-center justify-center md:justify-start gap-2 font-medium">
                        <CalendarDays className="w-4 h-4" />
                        {formatDatetime(booking.class_datetime)}
                      </p>
                    </div>
                    <div className="shrink-0 w-full md:w-auto mt-4 md:mt-0">
                      <button
                        onClick={() => handleCancel(booking.booking_id)}
                        disabled={cancellingId === booking.booking_id}
                        className="w-full md:w-auto px-6 py-3 rounded-full border border-error/30 text-error font-headline font-bold text-sm hover:bg-error/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cancellingId === booking.booking_id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        取消課程
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

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
