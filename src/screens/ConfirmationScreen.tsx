import { motion } from 'motion/react';
import { CheckCircle2, Calendar, Clock, MapPin, Info, Camera, Share } from 'lucide-react';
import { Screen } from '../App';
import { BookingResult } from '../api/client';

interface ConfirmationScreenProps {
  onNavigate: (screen: Screen) => void;
  bookingResult: BookingResult | null;
}

function formatDateTime(datetime: string) {
  if (!datetime) return { date: '--', time: '--' };
  const [date, time] = datetime.split(' ');
  const [year, month, day] = date.split('-');
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return {
    date: `${Number(month)}月${Number(day)}日（${days[d.getDay()]}）`,
    time: time ?? '--',
  };
}

export default function ConfirmationScreen({ onNavigate, bookingResult }: ConfirmationScreenProps) {
  const dt = bookingResult ? formatDateTime(bookingResult.class_datetime) : { date: '--', time: '--' };
  const endMinutes = bookingResult
    ? (() => {
        const [h, m] = (bookingResult.time ?? '00:00').split(':').map(Number);
        const totalMin = h * 60 + m + (Number(bookingResult.duration) || 60);
        return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
      })()
    : '--';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center pt-32 pb-24 px-6 md:px-12"
    >
      <div className="max-w-2xl w-full">
        <div className="flex flex-col items-center text-center mb-12">
          <div className="w-20 h-20 bg-secondary-container text-secondary rounded-full flex items-center justify-center mb-6 shadow-sm">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="font-headline text-4xl md:text-5xl text-primary font-bold tracking-tighter mb-4 leading-tight">
            預約已確認
          </h1>
          <p className="text-lg text-on-surface-variant max-w-md mx-auto font-medium">
            您的位置已預留。我們迫不及待想與您一起律動！
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-surface-container-lowest p-8 rounded-3xl flex flex-col gap-2 border border-outline-variant/10 shadow-sm">
            <span className="font-bold text-xs text-primary uppercase tracking-widest mb-1">課程資訊</span>
            <h2 className="font-headline text-xl text-on-surface font-bold">
              {bookingResult?.class_name ?? 'Morning Flow & Bound'}
            </h2>
            <div className="flex items-center gap-2 mt-3 text-on-surface-variant font-medium">
              <Calendar className="w-4 h-4" />
              <p className="text-sm">{dt.date}</p>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant font-medium mt-1">
              <Clock className="w-4 h-4" />
              <p className="text-sm">
                {bookingResult?.time ?? '--'} - {endMinutes}
              </p>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-8 rounded-3xl flex flex-col gap-2 border border-outline-variant/10 shadow-sm">
            <span className="font-bold text-xs text-primary uppercase tracking-widest mb-1">教室地點</span>
            <h2 className="font-headline text-xl text-on-surface font-bold">律動工作室</h2>
            <div className="flex items-center gap-2 mt-3 text-on-surface-variant font-medium">
              <MapPin className="w-4 h-4" />
              <p className="text-sm">寧靜路 42 號 2 樓</p>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant font-medium mt-1">
              <Info className="w-4 h-4" />
              <p className="text-sm">請提前 10 分鐘抵達</p>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-low rounded-[2.5rem] p-1.5 mb-12 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-tertiary/10 opacity-50"></div>
          <div className="relative bg-surface-container-lowest rounded-[2.2rem] border-2 border-dashed border-primary/20 p-8 md:p-10 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
              <div>
                <h3 className="font-headline text-2xl text-on-surface font-bold">付款提醒</h3>
                <p className="text-sm text-on-surface-variant mt-2 font-medium">請完成轉帳以確認預約。</p>
              </div>
              <div className="bg-primary-container/40 px-5 py-2.5 rounded-full border border-primary/10">
                <span className="font-bold text-sm text-primary-dim">
                  應付金額：${bookingResult ? Number(bookingResult.class_name ? 0 : 0) : 28}.00
                </span>
              </div>
            </div>

            <div className="space-y-4 mb-10">
              <div className="flex justify-between items-center py-4 border-b border-outline-variant/10">
                <span className="text-sm text-on-surface-variant font-medium">銀行名稱</span>
                <span className="font-bold text-on-surface">Sanctuary Trust Bank</span>
              </div>
              <div className="flex justify-between items-center py-4 border-b border-outline-variant/10">
                <span className="text-sm text-on-surface-variant font-medium">帳號</span>
                <span className="font-bold text-on-surface tracking-wide">882-9401-204</span>
              </div>
              <div className="flex justify-between items-center py-4">
                <span className="text-sm text-on-surface-variant font-medium">備註</span>
                <span className="font-bold text-on-surface tracking-wide">
                  {bookingResult ? `BK-${bookingResult.id.toUpperCase()}` : 'JOSIE-FLOW-2410'}
                </span>
              </div>
            </div>

            <div className="bg-tertiary-container/20 border border-tertiary-container/30 rounded-2xl p-6 flex gap-4 items-start">
              <Camera className="text-tertiary w-6 h-6 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-bold text-on-tertiary-container">需執行的動作：截圖並通知</p>
                <p className="text-sm text-on-tertiary-container/80 leading-relaxed font-medium">
                  請將此區域截圖，並透過 App 內的客服聊天室或 WhatsApp 傳送給{' '}
                  <strong>JosieUB 助理</strong>，以確認您的出席。
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <button
            onClick={() => onNavigate('dashboard')}
            className="w-full md:w-auto px-12 py-4 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-full font-headline font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 shadow-xl shadow-primary/20"
          >
            返回儀表板
          </button>
          <button className="text-on-surface-variant font-bold text-sm tracking-widest hover:text-primary transition-colors flex items-center gap-2">
            <Share className="w-4 h-4" />
            分享預約
          </button>
        </div>
      </div>
    </motion.div>
  );
}
