import { Share2, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full rounded-t-[3rem] mt-20 bg-surface-container-low py-16 px-8 md:px-12 flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
      <div className="space-y-4">
        <span className="text-xl font-bold text-primary font-headline">JosieUBOUND</span>
        <p className="text-sm leading-relaxed text-on-surface-variant/80">
          © 2024 JosieUBOUND. 您的律動聖殿。
        </p>
      </div>
      
      <div className="flex flex-wrap justify-center gap-8 text-sm text-on-surface-variant">
        <a href="#" className="hover:text-primary transition-colors">聯絡我們</a>
        <a href="#" className="hover:text-primary transition-colors">隱私權政策</a>
        <a href="#" className="hover:text-primary transition-colors">服務條款</a>
        <a href="#" className="hover:text-primary transition-colors">支援服務</a>
      </div>
      
      <div className="flex gap-4">
        <button className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-primary hover:scale-110 transition-all shadow-sm">
          <Share2 className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-primary hover:scale-110 transition-all shadow-sm">
          <Mail className="w-5 h-5" />
        </button>
      </div>
    </footer>
  );
}
