import { useState, useEffect } from 'react';

interface NavbarProps {
  currentScreen: string;
  onNavigate: (screen: any) => void;
  isLoggedIn: boolean;
}

export default function Navbar({ currentScreen, onNavigate, isLoggedIn }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-surface/80 backdrop-blur-xl shadow-sm' : 'bg-transparent'}`}>
      <div className="flex justify-between items-center max-w-7xl mx-auto px-6 md:px-8 h-20">
        <button onClick={() => onNavigate('schedule')} className="text-2xl font-bold tracking-tighter text-primary font-headline">
          JosieUBOUND
        </button>
        
        <div className="hidden md:flex items-center gap-8 font-headline text-sm font-medium tracking-wide">
          <button 
            onClick={() => onNavigate('ubound-info')}
            className={`${currentScreen === 'ubound-info' ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'} transition-all`}
          >
            課程介紹
          </button>
          <button 
            onClick={() => onNavigate('schedule')}
            className={`${currentScreen === 'schedule' ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'} transition-all`}
          >
            預約課程
          </button>
          <button 
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'login')}
            className={`${currentScreen === 'dashboard' ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'} transition-all`}
          >
            我的課表
          </button>
          <button 
            onClick={() => onNavigate('checkout')}
            className={`${currentScreen === 'checkout' ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'} transition-all`}
          >
            價格方案
          </button>
          <button 
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'login')}
            className={`${currentScreen === 'login' ? 'text-primary border-b-2 border-primary pb-1' : 'text-on-surface-variant hover:text-primary'} transition-all`}
          >
            個人檔案
          </button>
        </div>

        <div className="flex items-center gap-4">
          {!isLoggedIn && currentScreen !== 'login' && (
            <button 
              onClick={() => onNavigate('login')}
              className="hidden md:block text-primary font-headline font-medium hover:opacity-80 transition-opacity"
            >
              登入
            </button>
          )}
          <button 
            onClick={() => onNavigate('schedule')}
            className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 md:px-8 py-2.5 md:py-3 rounded-full font-headline font-semibold text-sm hover:scale-105 transition-all shadow-lg shadow-primary/20"
          >
            {isLoggedIn ? '預約課程' : '立即加入'}
          </button>
        </div>
      </div>
    </nav>
  );
}
