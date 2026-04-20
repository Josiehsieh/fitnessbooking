import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Mail, MessageCircle, Loader2, AlertTriangle, ExternalLink, Copy, Check } from 'lucide-react';
import { Screen } from '../App';
import { api, User } from '../api/client';

interface LoginScreenProps {
  onLogin: (user: User, token: string) => void;
  onNavigate: (screen: Screen) => void;
}

type InAppBrowser = 'line' | 'facebook' | 'instagram' | 'other' | null;

function detectInAppBrowser(): InAppBrowser {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent || '';
  if (/Line\//i.test(ua)) return 'line';
  if (/FBAN|FBAV/i.test(ua)) return 'facebook';
  if (/Instagram/i.test(ua)) return 'instagram';
  // Other known in-app browsers (WeChat, TikTok, etc.) - best-effort.
  if (/MicroMessenger|WeChat|BytedanceWebview|TikTok|KAKAOTALK/i.test(ua)) return 'other';
  return null;
}

export default function LoginScreen({ onLogin, onNavigate }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inAppBrowser = useMemo(detectInAppBrowser, []);
  const disableGoogleOAuth = Boolean(inAppBrowser);
  const disableLineOAuth = inAppBrowser !== null && inAppBrowser !== 'line';

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
          {inAppBrowser && <InAppBrowserNotice which={inAppBrowser} />}

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
              disabled={disableGoogleOAuth}
              title={disableGoogleOAuth ? '請先在外部瀏覽器開啟此頁面' : ''}
              className="flex items-center justify-center gap-3 py-3.5 px-4 rounded-full bg-surface-container-low hover:bg-surface-container transition-colors font-medium text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="w-5 h-5" />
              使用 Google 帳號登入
            </button>
            <button
              onClick={() => { window.location.href = '/api/auth/line'; }}
              disabled={disableLineOAuth}
              title={disableLineOAuth ? '請先在外部瀏覽器開啟此頁面' : ''}
              className="flex items-center justify-center gap-3 py-3.5 px-4 rounded-full bg-surface-container-low hover:bg-surface-container transition-colors font-medium text-on-surface disabled:opacity-50 disabled:cursor-not-allowed"
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

function InAppBrowserNotice({ which }: { which: Exclude<InAppBrowser, null> }) {
  const [copied, setCopied] = useState(false);

  // Build the "open in external browser" URL. LINE's browser honours the
  // ?openExternalBrowser=1 query param and will pop the link out into Safari
  // / Chrome. Other in-app browsers don't have a standard equivalent, so we
  // fall back to letting the user copy the link manually.
  const fullUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';

  const lineExternalUrl = (() => {
    if (!fullUrl) return '';
    const sep = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${sep}openExternalBrowser=1`;
  })();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail inside some in-app browsers; fall back to prompt.
      window.prompt('請複製下方連結，並在外部瀏覽器（Safari / Chrome）貼上開啟：', fullUrl);
    }
  };

  const labels: Record<Exclude<InAppBrowser, null>, string> = {
    line: 'LINE 內建瀏覽器',
    facebook: 'Facebook 內建瀏覽器',
    instagram: 'Instagram 內建瀏覽器',
    other: '應用程式內建瀏覽器',
  };

  return (
    <div className="mb-8 rounded-2xl border border-amber-300/60 bg-amber-50 p-5 text-sm">
      <div className="flex gap-3 items-start mb-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-bold text-amber-900 mb-1">
            偵測到您使用 {labels[which]}
          </p>
          <p className="text-amber-800/90 leading-relaxed">
            Google 出於安全考量禁止在應用程式內建瀏覽器中完成登入。請改用外部瀏覽器（Safari / Chrome）開啟此頁面，再進行註冊或登入。
          </p>
        </div>
      </div>

      {which === 'line' && lineExternalUrl ? (
        <a
          href={lineExternalUrl}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          在外部瀏覽器開啟
        </a>
      ) : (
        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-semibold transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              已複製，請貼到瀏覽器
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              複製網址
            </>
          )}
        </button>
      )}

      {which === 'line' && (
        <p className="mt-3 text-xs text-amber-800/80 leading-relaxed">
          點擊上方按鈕會自動用 Safari / Chrome 開啟本站。若未自動跳出，請點右下角的「⋯」→「在其他瀏覽器開啟」。
        </p>
      )}
    </div>
  );
}
