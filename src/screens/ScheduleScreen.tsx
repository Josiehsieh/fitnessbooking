import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Info, CreditCard, UserCheck, AlertCircle, Loader2, CheckCircle2, X } from 'lucide-react';
import { Screen } from '../App';
import { api, ClassItem, User } from '../api/client';

interface ScheduleScreenProps {
  onNavigate: (screen: Screen) => void;
  onBookClass: (cls: ClassItem) => void;
  onCreditsChanged: (credits: number) => void;
  user: User | null;
}

type DaySchedule = {
  date: string;
  day_label: string;
  classes: ClassItem[];
};

function groupByDate(classes: ClassItem[]): DaySchedule[] {
  const map: Record<string, DaySchedule> = {};
  for (const cls of classes) {
    if (!map[cls.date]) {
      map[cls.date] = { date: cls.date, day_label: cls.day_label, classes: [] };
    }
    map[cls.date].classes.push(cls);
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function spotsInfo(cls: ClassItem): { label: string; type: 'full' | 'urgent' | 'normal' } {
  const remaining = cls.total_spots - cls.booked_spots;
  if (remaining <= 0) return { label: '已額滿', type: 'full' };
  if (remaining <= 2) return { label: `僅剩 ${remaining} 個名額！`, type: 'urgent' };
  return { label: `剩餘 ${remaining} 個名額`, type: 'normal' };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function buildCalendarGrid(year: number, month: number): Array<{
  day: number;
  iso: string;
  inMonth: boolean;
}> {
  // month is 0-indexed (0 = January). Grid starts from Monday.
  const first = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  // JS: Sunday=0 .. Saturday=6 → convert to Monday=0 .. Sunday=6
  const firstWeekday = (first.getDay() + 6) % 7;

  const cells: Array<{ day: number; iso: string; inMonth: boolean }> = [];

  // Leading days from previous month
  const prevLastDay = new Date(year, month, 0).getDate();
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevLastDay - i;
    const d = new Date(year, month - 1, day);
    cells.push({ day, iso: toISODate(d), inMonth: false });
  }
  // Current month
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, iso: toISODate(date), inMonth: true });
  }
  // Trailing days to fill last week
  while (cells.length % 7 !== 0) {
    const d = cells.length - firstWeekday - lastDay + 1;
    const date = new Date(year, month + 1, d);
    cells.push({ day: d, iso: toISODate(date), inMonth: false });
  }
  return cells;
}

export default function ScheduleScreen({
  onNavigate,
  onBookClass,
  onCreditsChanged,
  user,
}: ScheduleScreenProps) {
  const [schedules, setSchedules] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{ name: string; time: string; day: string } | null>(null);
  const [bookError, setBookError] = useState('');

  const now = new Date();
  const todayISO = toISODate(now);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  useEffect(() => {
    api.classes.list()
      .then((res) => {
        // 只顯示「今天」到「今天+42 天」之間的課程（未來六週）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const maxDate = new Date(today);
        maxDate.setDate(maxDate.getDate() + 42);
        const fromISO = toISODate(today);
        const toISO = toISODate(maxDate);
        const windowed = res.classes.filter(
          (c) => c.date >= fromISO && c.date <= toISO,
        );
        setSchedules(groupByDate(windowed));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!successToast) return;
    const t = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(t);
  }, [successToast]);

  const handleBook = async (cls: ClassItem) => {
    setBookError('');

    if (!user) {
      onBookClass(cls);
      return;
    }

    if ((user.credits ?? 0) < 1) {
      onBookClass(cls);
      return;
    }

    setBookingId(cls.class_id);
    try {
      const res = await api.bookings.create(cls.class_id);

      setSchedules((prev) =>
        prev.map((day) => ({
          ...day,
          classes: day.classes.map((c) =>
            c.class_id === cls.class_id
              ? { ...c, booked_spots: c.booked_spots + 1 }
              : c,
          ),
        })),
      );

      setSuccessToast({ name: cls.name, time: cls.time, day: cls.day_label });
      onCreditsChanged(res.credits_remaining);
    } catch (err) {
      setBookError(err instanceof Error ? err.message : '預約失敗，請再試一次');
    } finally {
      setBookingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-24 md:pt-32 pb-20 px-4 md:px-6 max-w-7xl mx-auto"
    >
      {/* Success toast */}
      <AnimatePresence>
        {successToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-secondary-container/95 backdrop-blur-md border border-secondary/30 shadow-xl rounded-2xl px-6 py-4 flex items-start gap-3 max-w-md w-[90%]"
          >
            <CheckCircle2 className="w-6 h-6 text-secondary shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-on-secondary-container">預約成功！</p>
              <p className="text-sm text-on-secondary-container/80 mt-0.5">
                {successToast.day} · {successToast.time} · {successToast.name}
              </p>
              <p className="text-xs text-on-secondary-container/70 mt-1">
                已扣除 1 堂，剩餘 {user?.credits ?? 0} 堂。可於「我的課表」查看預約
              </p>
            </div>
            <button
              onClick={() => setSuccessToast(null)}
              className="text-on-secondary-container/60 hover:text-on-secondary-container"
              aria-label="關閉"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Booking error banner */}
      {bookError && (
        <div className="mb-6 flex items-start gap-3 bg-error/10 border border-error/20 rounded-2xl px-5 py-3">
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-on-surface">
            <p className="font-semibold">{bookError}</p>
          </div>
          <button
            onClick={() => setBookError('')}
            className="text-on-surface-variant hover:text-on-surface"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <header className="mb-12 md:mb-24 text-center">
        <h1 className="text-3xl md:text-[3.5rem] font-bold tracking-tighter text-on-surface mb-4 md:mb-6 leading-tight">
          讓律動像家一樣<span className="text-primary italic">自在。</span>
        </h1>
        <p className="text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          加入我們的UBound空間，享受節奏感與律動的快樂。在課程中找回快樂及平衡。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Calendar Section
            Note: sticky is only applied on lg+ screens. On mobile the
            calendar would otherwise stay pinned to the top and hide the
            class list below it, preventing users from booking. */}
        <section className="lg:col-span-4 bg-surface-container-low p-5 md:p-8 rounded-3xl lg:sticky lg:top-28">
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <h2 className="text-lg md:text-xl font-bold text-on-surface">
              {calYear}年 {calMonth + 1}月
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const d = new Date(calYear, calMonth - 1, 1);
                  setCalYear(d.getFullYear());
                  setCalMonth(d.getMonth());
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest text-primary hover:bg-primary-container transition-colors"
                aria-label="上個月"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  const d = new Date(calYear, calMonth + 1, 1);
                  setCalYear(d.getFullYear());
                  setCalMonth(d.getMonth());
                }}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest text-primary hover:bg-primary-container transition-colors"
                aria-label="下個月"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-4 text-center mb-6">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <div
                key={day}
                className="text-[0.75rem] font-medium text-on-surface-variant/50 uppercase tracking-widest"
              >
                {day}
              </div>
            ))}
            {buildCalendarGrid(calYear, calMonth).map((cell) => {
              const hasClasses = schedules.some((s) => s.date === cell.iso);
              const isToday = cell.iso === todayISO;
              if (!cell.inMonth) {
                return (
                  <div
                    key={cell.iso}
                    className="py-2 text-surface-variant/50"
                  >
                    {cell.day}
                  </div>
                );
              }
              if (isToday) {
                return (
                  <div
                    key={cell.iso}
                    className="py-2 bg-primary-container text-on-primary-container rounded-full font-bold relative"
                  >
                    {cell.day}
                    {hasClasses && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-on-primary-container rounded-full"></span>
                    )}
                  </div>
                );
              }
              return (
                <div key={cell.iso} className="py-2 font-medium relative">
                  {cell.day}
                  {hasClasses && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-tertiary rounded-full"></span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 p-5 bg-tertiary/10 rounded-2xl border border-tertiary/10">
            <div className="flex gap-3 items-start">
              <Info className="text-tertiary w-5 h-5 shrink-0 mt-0.5" />
              <p className="text-sm text-on-tertiary-container leading-relaxed">
                <span className="font-bold">取消政策：</span>請注意，預約取消必須在課程開始前 6 小時完成。
              </p>
            </div>
          </div>

          {user && (
            <div className="mt-6 p-5 bg-primary/10 rounded-2xl">
              <p className="text-sm font-bold text-primary">剩餘堂數：{user.credits} 堂</p>
              {user.credits === 0 && (
                <button
                  onClick={() => onNavigate('checkout')}
                  className="mt-3 w-full py-2 rounded-full bg-primary text-on-primary text-sm font-bold"
                >
                  購買套票
                </button>
              )}
            </div>
          )}
        </section>

        {/* Class Listings Section */}
        <section className="lg:col-span-8 space-y-12">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {error && (
            <div className="text-center py-16 text-error bg-error/5 rounded-3xl">
              <p className="font-bold mb-2">載入課程失敗</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && schedules.length === 0 && (
            <div className="text-center py-24 bg-surface-container-low rounded-3xl">
              <p className="text-lg font-semibold text-on-surface mb-2">尚無可預約課程</p>
              <p className="text-sm text-on-surface-variant">
                未來六週內目前還沒有開放預約的課程，請稍後再查看
              </p>
            </div>
          )}

          {!loading && !error && schedules.length > 0 && (
            <p className="text-xs text-on-surface-variant/80 px-2 -mb-4">
              顯示今日起 <span className="font-semibold text-on-surface">未來六週</span> 內的課程（共 {schedules.reduce((n, d) => n + d.classes.length, 0)} 堂）
            </p>
          )}

          {!loading && !error && schedules.map((daySchedule, index) => (
            <div key={daySchedule.date} className="space-y-6">
              <div className="flex justify-between items-end mb-6 px-2">
                <div>
                  {index === 0 && (
                    <span className="text-xs text-primary uppercase font-bold tracking-widest mb-1 block">
                      可預約課程
                    </span>
                  )}
                  <h3 className="text-2xl font-bold">{daySchedule.day_label}</h3>
                </div>
                <span className="text-sm text-on-surface-variant font-medium">
                  找到 {daySchedule.classes.length} 堂課程
                </span>
              </div>

              {daySchedule.classes.map((cls) => {
                const spots = spotsInfo(cls);
                return (
                  <div
                    key={cls.class_id}
                    className="group bg-surface-container-lowest p-6 md:p-8 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 md:gap-8 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 border border-outline-variant/10"
                  >
                    <div className="flex gap-6 md:gap-8 items-center w-full md:w-auto">
                      <div className="text-center min-w-[80px]">
                        <span className="block text-2xl font-bold text-primary">{cls.time}</span>
                        <span className="text-xs uppercase font-bold text-on-surface-variant tracking-tighter">
                          {cls.duration} 分鐘
                        </span>
                      </div>
                      <div className="h-12 w-[1px] bg-outline-variant/20 hidden md:block"></div>
                      <div>
                        <h4 className="text-xl font-bold text-on-surface mb-2 font-headline">{cls.name}</h4>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-4 h-4" /> ${Number(cls.price).toFixed(2)}
                          </span>
                          {user ? (
                            <span
                              className={`flex items-center gap-1.5 font-medium ${
                                spots.type === 'urgent'
                                  ? 'text-tertiary font-bold'
                                  : spots.type === 'full'
                                  ? 'text-error'
                                  : 'text-secondary'
                              }`}
                            >
                              {spots.type === 'urgent' ? (
                                <AlertCircle className="w-4 h-4" />
                              ) : (
                                <UserCheck className="w-4 h-4" />
                              )}
                              {spots.label}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 font-medium text-on-surface-variant">
                              <Info className="w-4 h-4" />
                              登入後可查看剩餘名額
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBook(cls)}
                      disabled={spots.type === 'full' || bookingId === cls.class_id}
                      className={`w-full md:w-auto px-8 py-3.5 rounded-full font-bold transition-all duration-300 flex items-center justify-center gap-2 ${
                        spots.type === 'full'
                          ? 'bg-surface-container text-on-surface-variant/50 cursor-not-allowed'
                          : 'bg-surface-container-low text-primary hover:bg-primary hover:text-on-primary'
                      }`}
                    >
                      {bookingId === cls.class_id && <Loader2 className="w-4 h-4 animate-spin" />}
                      {spots.type === 'full'
                        ? '已額滿'
                        : bookingId === cls.class_id
                        ? '預約中...'
                        : '立即預約'}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      </div>
    </motion.div>
  );
}
