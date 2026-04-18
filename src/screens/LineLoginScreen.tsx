import { motion } from 'motion/react';
import { MessageCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface LineLoginScreenProps {
  onLogin: () => void;   // kept for API compatibility, not used in OAuth flow
  onCancel: () => void;
}

export default function LineLoginScreen({ onCancel }: LineLoginScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleLineLogin = () => {
    setLoading(true);
    // Redirect to Flask backend → which redirects to LINE Login consent screen
    window.location.href = '/api/auth/line';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      className="flex-grow flex items-center justify-center px-6 pt-32 pb-12 min-h-screen bg-[#f5f5f5]"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden">

        {/* LINE Header */}
        <div className="bg-[#06C755] px-6 py-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-20">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white rounded-full blur-2xl"></div>
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <MessageCircle className="w-10 h-10 text-[#06C755]" />
            </div>
            <h1 className="text-white font-bold text-xl tracking-wide">LINE 登入授權</h1>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="text-center mb-8">
            <h2 className="text-gray-800 font-bold text-lg mb-2">JosieUBOUND</h2>
            <p className="text-gray-500 text-sm">要求存取您的 LINE 帳號資訊</p>
          </div>

          {/* Permissions list */}
          <div className="bg-gray-50 rounded-2xl p-5 mb-8 border border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">將存取以下資訊</p>
            <ul className="space-y-4">
              {['個人檔案圖片', '顯示名稱', '狀態消息'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-gray-700 font-medium">
                  <CheckCircle2 className="w-5 h-5 text-[#06C755] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleLineLogin}
              disabled={loading}
              className="w-full py-4 rounded-full bg-[#06C755] text-white font-bold text-lg hover:bg-[#05b34c] transition-colors shadow-lg shadow-[#06C755]/20 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : null}
              {loading ? '正在前往 LINE...' : '許可並登入'}
            </button>

            <button
              onClick={onCancel}
              className="w-full py-4 rounded-full bg-gray-100 text-gray-600 font-bold text-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
            點擊「許可並登入」即表示您同意應用程式的服務條款與隱私權政策。
          </p>
        </div>
      </div>
    </motion.div>
  );
}
