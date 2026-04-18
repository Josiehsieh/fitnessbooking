import { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, MessageCircle, Loader2 } from 'lucide-react';
import { Screen } from '../App';
import { api, User } from '../api/client';

interface LoginScreenProps {
  onLogin: (user: User, token: string) => void;
  onNavigate: (screen: Screen) => void;
}

export default function LoginScreen({ onLogin, onNavigate }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let res;
      if (mode === 'login') {
        res = await api.auth.login(email, password);
      } else {
        res = await api.auth.register(email, password, name);
      }
      onLogin(res.user, res.token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '發生錯誤，請再試一次');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-grow flex items-center justify-center px-6 pt-32 pb-12 min-h-screen"
    >
      <div className="w-full max-w-md relative">
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-primary-container rounded-full blur-3xl opacity-40"></div>
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-secondary-container rounded-full blur-3xl opacity-30"></div>

        <div className="relative bg-surface-container-lowest rounded-3xl p-8 md:p-10 shadow-[0_40px_80px_-15px_rgba(46,46,50,0.08)]">
          <div className="text-center mb-10">
            <h1 className="font-headline text-4xl font-bold text-on-surface tracking-tight mb-3">
              {mode === 'login' ? '歡迎回來' : '立即加入'}
            </h1>
            <p className="text-on-surface-variant">
              {mode === 'login' ? '進入您的數位律動空間' : '建立您的 JosieUBOUND 帳號'}
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            {mode === 'register' && (
              <div className="space-y-2">
                <label className="block text-xs font-medium tracking-widest text-on-surface-variant uppercase ml-4">
                  姓名
                </label>
                <input
                  type="text"
                  placeholder="您的姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-6 py-4 rounded-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant outline-none text-on-surface"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium tracking-widest text-on-surface-variant uppercase ml-4">
                電子郵件地址
              </label>
              <input
                type="email"
                placeholder="hello@josieubound.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-6 py-4 rounded-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant outline-none text-on-surface"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium tracking-widest text-on-surface-variant uppercase ml-4">
                密碼
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-6 py-4 rounded-full bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 focus:bg-surface-container-lowest transition-all placeholder:text-outline-variant outline-none text-on-surface"
              />
              {mode === 'login' && (
                <div className="flex justify-end pr-4 pt-1">
                  <a href="#" className="text-sm font-medium text-primary hover:text-primary-dim transition-colors">
                    忘記密碼？
                  </a>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-error text-center bg-error/5 rounded-2xl py-3 px-4">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-full bg-gradient-to-br from-primary to-primary-dim text-on-primary font-headline font-semibold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-primary/20 mt-4 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {mode === 'login' ? '登入' : '建立帳號'}
            </button>
          </form>

          <div className="relative my-10">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-container-high"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest">
              <span className="bg-surface-container-lowest px-4 text-on-surface-variant font-medium">
                或使用以下方式繼續
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button
              onClick={() => { window.location.href = '/api/auth/google'; }}
              className="flex items-center justify-center gap-3 py-3.5 px-4 rounded-full bg-surface-container-low hover:bg-surface-container transition-colors font-medium text-on-surface"
            >
              <Mail className="w-5 h-5" />
              使用 Google 帳號登入
            </button>
            <button
              onClick={() => { window.location.href = '/api/auth/line'; }}
              className="flex items-center justify-center gap-3 py-3.5 px-4 rounded-full bg-surface-container-low hover:bg-surface-container transition-colors font-medium text-on-surface"
            >
              <MessageCircle className="w-5 h-5" />
              使用 LINE 帳號登入
            </button>
          </div>

          <p className="mt-10 text-center text-on-surface-variant text-sm">
            {mode === 'login' ? (
              <>
                還不是會員嗎？{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-primary font-semibold hover:underline decoration-primary-container"
                >
                  立即加入
                </button>
              </>
            ) : (
              <>
                已有帳號？{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-primary font-semibold hover:underline decoration-primary-container"
                >
                  登入
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
