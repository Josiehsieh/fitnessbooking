import { useState } from 'react';
import { Share2, Mail, Check } from 'lucide-react';

export default function Footer() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'JosieUBOUND',
          text: '一起來看 JosieUBOUND 課程！',
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('請複製這個網址', url);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // User may cancel native share; fallback to copy when possible.
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        } catch {
          window.prompt('請複製這個網址', url);
        }
      } else {
        window.prompt('請複製這個網址', url);
      }
    }
  };

  const handleEmail = () => {
    window.location.href = 'mailto:smalljosie@gmail.com';
  };

  return (
    <footer className="w-full rounded-t-[3rem] mt-20 bg-surface-container-low py-16 px-8 md:px-12 flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
      <div className="space-y-4">
        <span className="text-xl font-bold text-primary font-headline">JosieUBOUND</span>
        <p className="text-sm leading-relaxed text-on-surface-variant/80">
          © 2024 JosieUBOUND. 您的律動聖殿。
        </p>
      </div>
      
      <div className="flex flex-wrap justify-center gap-8 text-sm text-on-surface-variant">
        <a
          href="https://www.instagram.com/josiehealthlab/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          聯絡我們
        </a>
        <a href="#" className="hover:text-primary transition-colors">隱私權政策</a>
        <a href="#" className="hover:text-primary transition-colors">服務條款</a>
        <a href="#" className="hover:text-primary transition-colors">支援服務</a>
      </div>
      
      <div className="flex gap-4">
        <button
          onClick={handleShare}
          className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-primary hover:scale-110 transition-all shadow-sm"
          title={copied ? '網址已複製' : '分享 / 複製網址'}
          aria-label={copied ? '網址已複製' : '分享 / 複製網址'}
        >
          {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
        </button>
        <button
          onClick={handleEmail}
          className="w-12 h-12 rounded-full bg-surface flex items-center justify-center text-primary hover:scale-110 transition-all shadow-sm"
          title="寄信到 smalljosie@gmail.com"
          aria-label="寄信到 smalljosie@gmail.com"
        >
          <Mail className="w-5 h-5" />
        </button>
      </div>
    </footer>
  );
}
