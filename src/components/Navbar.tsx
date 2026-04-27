import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  currentScreen: string;
  onNavigate: (screen: any) => void;
  isLoggedIn: boolean;
}

export default function Navbar({ currentScreen, onNavigate, isLoggedIn }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsAdmin(false);
      return;
    }
    api.admin
      .check()
      .then((r) => setIsAdmin(r.is_admin))
      .catch(() => setIsAdmin(false));
  }, [isLoggedIn]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [currentScreen]);

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
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className={`${currentScreen === 'admin' ? 'text-primary border-b-2 border-primary pb-1' : 'text-amber-600 hover:text-amber-700'} transition-all font-semibold`}
            >
              管理後台
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className="bg-amber-500 text-white px-4 md:px-5 py-2 md:py-2.5 rounded-full font-headline font-semibold text-xs md:text-sm hover:bg-amber-600 transition-all shadow-md"
            >
              管理後台
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden text-on-surface-variant p-2 rounded-lg hover:bg-surface-container transition-colors"
            aria-label={mobileMenuOpen ? '關閉選單' : '開啟選單'}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {!isLoggedIn && currentScreen !== 'login' && (
            <button 
              onClick={() => onNavigate('login')}
              className="hidden md:block text-primary font-headline font-medium hover:opacity-80 transition-opacity"
            >
              登入
            </button>
          )}
          <button 
            onClick={() => onNavigate(isLoggedIn ? 'schedule' : 'login')}
            className="bg-gradient-to-br from-primary to-primary-dim text-on-primary px-6 md:px-8 py-2.5 md:py-3 rounded-full font-headline font-semibold text-sm hover:scale-105 transition-all shadow-lg shadow-primary/20"
          >
            {isLoggedIn ? '預約課程' : '立即加入'}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="md:hidden bg-surface/95 backdrop-blur-xl border-t border-outline/20 px-6 py-4 space-y-2">
          <button
            onClick={() => onNavigate('ubound-info')}
            className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
              currentScreen === 'ubound-info' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            課程介紹
          </button>
          <button
            onClick={() => onNavigate('schedule')}
            className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
              currentScreen === 'schedule' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            預約課程
          </button>
          <button
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'login')}
            className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
              currentScreen === 'dashboard' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            我的課表
          </button>
          <button
            onClick={() => onNavigate('checkout')}
            className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
              currentScreen === 'checkout' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            價格方案
          </button>
          <button
            onClick={() => onNavigate(isLoggedIn ? 'dashboard' : 'login')}
            className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
              currentScreen === 'login' ? 'text-primary bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            個人檔案
          </button>
          {isAdmin && (
            <button
              onClick={() => onNavigate('admin')}
              className={`block w-full text-left px-3 py-2 rounded-lg font-headline text-sm ${
                currentScreen === 'admin' ? 'text-amber-700 bg-amber-100' : 'text-amber-600 hover:bg-amber-50'
              }`}
            >
              管理後台
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
