import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Info, CreditCard, UserCheck, AlertCircle, Loader2 } from 'lucide-react';
import { Screen } from '../App';
import { api, ClassItem, User } from '../api/client';

interface ScheduleScreenProps {
  onNavigate: (screen: Screen) => void;
  onBookClass: (cls: ClassItem) => void;
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

export default function ScheduleScreen({ onNavigate, onBookClass, user }: ScheduleScreenProps) {
  const [schedules, setSchedules] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);

  useEffect(() => {
    api.classes.list()
      .then((res) => setSchedules(groupByDate(res.classes)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleBook = (cls: ClassItem) => {
    setBookingId(cls.class_id);
    onBookClass(cls);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-32 pb-20 px-6 max-w-7xl mx-auto"
    >
      <header className="mb-24 text-center">
        <h1 className="text-4xl md:text-[3.5rem] font-bold tracking-tighter text-on-surface mb-6 leading-tight">
          讓律動像家一樣<span className="text-primary italic">自在。</span>
        </h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
          加入我們的UBound空間，享受節奏感與律動的快樂。在課程中找回快樂及平衡。
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Calendar Section */}
        <section className="lg:col-span-4 bg-surface-container-low p-8 rounded-3xl sticky top-28">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-xl font-bold text-on-surface">2024年 9月</h2>
            <div className="flex gap-2">
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest text-primary hover:bg-primary-container transition-colors">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-lowest text-primary hover:bg-primary-container transition-colors">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-y-4 text-center mb-6">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <div key={day} className="text-[0.75rem] font-medium text-on-surface-variant/50 uppercase tracking-widest">
                {day}
              </div>
            ))}
            {[26, 27, 28, 29, 30, 31].map((day) => (
              <div key={`prev-${day}`} className="py-2 text-surface-variant">{day}</div>
            ))}
            {[1, 2, 3].map((day) => (
              <div key={day} className="py-2 font-medium">{day}</div>
            ))}
            <div className="py-2 font-medium relative">
              4
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-tertiary rounded-full"></span>
            </div>
            {[5, 6, 7, 8].map((day) => (
              <div key={day} className="py-2 font-medium">{day}</div>
            ))}
            <div className="py-2 bg-primary-container text-on-primary-container rounded-full font-bold">9</div>
            {[10, 11, 12, 13, 14, 15].map((day) => (
              <div key={day} className="py-2 font-medium">{day}</div>
            ))}
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
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBook(cls)}
                      disabled={spots.type === 'full' || bookingId === cls.class_id}
                      className={`w-full md:w-auto px-8 py-3.5 rounded-full font-bold transition-all duration-300 ${
                        spots.type === 'full'
                          ? 'bg-surface-container text-on-surface-variant/50 cursor-not-allowed'
                          : 'bg-surface-container-low text-primary hover:bg-primary hover:text-on-primary'
                      }`}
                    >
                      {spots.type === 'full' ? '已額滿' : '立即預約'}
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
