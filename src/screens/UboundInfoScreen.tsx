import { motion } from 'motion/react';
import { Heart, Shield, Activity, Flame, Smile, ArrowRight, Upload } from 'lucide-react';

interface UboundInfoScreenProps {
  onNavigate: (screen: string) => void;
}

export default function UboundInfoScreen({ onNavigate }: UboundInfoScreenProps) {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pt-32 pb-20 px-6 max-w-7xl mx-auto"
    >
      <header className="mb-16 text-center">
        <span className="text-primary font-bold tracking-widest uppercase text-sm mb-4 block">Course Introduction</span>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-on-surface mb-6 leading-tight font-headline">
          彈跳床運動課程：<br className="md:hidden" />
          <span className="text-primary">解鎖健康與快樂的秘訣！</span>
        </h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed font-medium">
          UBOUND 是一項結合高強度有氧與低衝擊的彈跳床運動，讓您在充滿樂趣的音樂節奏中，達到全身性的鍛鍊與釋放。
        </p>
      </header>

      {/* Uploaded PNG Image Section */}
      <section className="mb-24 max-w-4xl mx-auto">
        <div className="bg-surface-container-lowest rounded-[2.5rem] p-2 md:p-4 shadow-xl shadow-primary/5 border border-outline-variant/10 relative overflow-hidden group">
          {/* Fallback/Instruction if image is missing */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-container-low text-on-surface-variant -z-10">
            <Upload className="w-12 h-12 mb-4 opacity-50" />
            <p className="font-medium">請將您的圖片上傳至 public 資料夾並命名為 ubound-info.png</p>
          </div>
          
          {/* The actual image tag for the uploaded PNG */}
          <img 
            src="/ubound-info.png" 
            alt="UBOUND 課程介紹" 
            className="w-full h-auto rounded-[2rem] relative z-10 bg-surface-container-lowest min-h-[300px] object-contain"
            onError={(e) => {
              // Hide broken image icon if file not found yet, revealing the fallback behind it
              (e.target as HTMLImageElement).style.opacity = '0';
            }}
            onLoad={(e) => {
              (e.target as HTMLImageElement).style.opacity = '1';
            }}
          />
        </div>
      </section>

      {/* Detailed Benefits Section */}
      <section className="mb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold font-headline text-on-surface mb-4">為什麼選擇 UBOUND？</h2>
          <p className="text-on-surface-variant font-medium">十大核心益處，全方位提升您的身心健康</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Benefit 1 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-error/10 text-error rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Heart className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">提升心肺耐力</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              持續的彈跳能有效提升心跳率，讓心臟與肺部功能更強健，增強整體心肺耐力。
            </p>
          </div>

          {/* Benefit 2 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-tertiary/10 text-tertiary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Activity className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">促進淋巴排毒</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              規律地上下彈跳能溫和地刺激淋巴循環，幫助身體更好地排出毒素，維持整體健康。
            </p>
          </div>

          {/* Benefit 3 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-secondary/10 text-secondary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Shield className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">極低關節衝擊</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              相比於硬地跑步，彈跳床能吸收大部分衝擊力，骨骼承受壓力顯著降低，特別保護膝蓋和腳踝。
            </p>
          </div>

          {/* Benefit 4 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">強化核心肌群</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              每一次彈跳都是對核心肌群的挑戰。腹部、背部和骨盆底的肌肉都能在不穩定中得到深層鍛鍊。
            </p>
          </div>

          {/* Benefit 5 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-orange-500/10 text-orange-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Flame className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">高效燃脂塑形</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              高效有氧運動，能在短時間內大量燃燒卡路里。幫助控制體重、塑造緊實體形。
            </p>
          </div>

          {/* Benefit 6 */}
          <div className="bg-surface-container-lowest p-8 rounded-3xl border border-outline-variant/10 hover:shadow-lg hover:shadow-primary/5 transition-all group">
            <div className="w-14 h-14 bg-pink-500/10 text-pink-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Smile className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold font-headline mb-3 text-on-surface">釋放壓力超快樂</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed font-medium">
              運動充滿樂趣，彈跳的過程能促進腦內啡分泌，讓心情愉悅，有效釋放生活與工作壓力。
            </p>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-gradient-to-br from-primary-container/50 to-tertiary-container/50 rounded-[3rem] p-8 md:p-16 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 opacity-30">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary rounded-full mix-blend-multiply filter blur-3xl"></div>
          <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-tertiary rounded-full mix-blend-multiply filter blur-3xl"></div>
        </div>
        
        <h2 className="text-3xl md:text-4xl font-bold font-headline text-on-surface mb-6">準備好體驗飛翔的感覺了嗎？</h2>
        <p className="text-lg text-on-surface-variant mb-10 max-w-2xl mx-auto font-medium">
          無論您是運動新手還是健身老手，UBOUND 的強度都能自由調節。加入我們，一起跳出健康與自信！
        </p>
        <button 
          onClick={() => onNavigate('schedule')}
          className="bg-primary text-on-primary px-10 py-4 rounded-full font-headline font-bold text-lg shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all inline-flex items-center gap-3"
        >
          立即預約體驗
          <ArrowRight className="w-5 h-5" />
        </button>
      </section>
    </motion.div>
  );
}
