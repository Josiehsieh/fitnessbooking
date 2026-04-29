import { motion } from 'motion/react';
import { Copy, Check, ArrowLeft, AlertCircle, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Screen } from '../App';
import { Order, PaymentInfo } from '../api/client';

interface PaymentPendingScreenProps {
  onNavigate: (screen: Screen) => void;
  order: Order | null;
  paymentInfo: PaymentInfo | null;
}

export default function PaymentPendingScreen({ onNavigate, order, paymentInfo }: PaymentPendingScreenProps) {
  const [copied, setCopied] = useState<string>('');

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  if (!order || !paymentInfo) {
    return (
      <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto text-center">
        <p className="text-on-surface-variant">找不到訂單資訊</p>
        <button
          onClick={() => onNavigate('dashboard')}
          className="mt-6 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium"
        >
          回會員中心
        </button>
      </div>
    );
  }

  const missingBank = !paymentInfo.bank_account;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="pt-28 pb-20 px-6 max-w-3xl mx-auto"
    >
      <div className="mb-8 text-center">
        <span className="inline-block px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold tracking-widest uppercase mb-4">
          待付款
        </span>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter font-headline text-on-surface mb-2">
          訂單已建立，請完成匯款
        </h1>
        <p className="text-on-surface-variant">完成匯款後，請將截圖傳給 LINE 小助理以便快速確認</p>
      </div>

      {/* Order summary */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 shadow-sm border border-outline-variant/10 mb-6">
        <h2 className="text-lg font-semibold mb-6">訂單明細</h2>
        <div className="space-y-3 text-sm">
          <Row label="訂單編號" value={order.order_id} onCopy={() => copy(order.order_id, 'oid')} copied={copied === 'oid'} />
          <Row label="購買堂數" value={`${order.quantity} 堂`} />
          <Row label="小計" value={`NT$ ${order.subtotal.toLocaleString()}`} />
          {order.discount > 0 && (
            <Row label="折扣" value={`- NT$ ${order.discount.toLocaleString()}`} valueClass="text-primary" />
          )}
          {order.coupon_code && (
            <Row label="折扣碼" value={order.coupon_code} />
          )}
          <div className="border-t border-outline-variant/20 my-3" />
          <Row label="應付總額" value={`NT$ ${order.total.toLocaleString()}`} valueClass="text-2xl font-bold text-primary" />
        </div>
      </section>

      {/* Bank info */}
      <section className="bg-surface-container-lowest rounded-3xl p-8 shadow-sm border border-outline-variant/10 mb-6">
        <h2 className="text-lg font-semibold mb-2">匯款資訊</h2>
        {missingBank ? (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>管理員尚未設定匯款帳號，請聯繫 LINE 小助理 <strong>{paymentInfo.line_assistant_id || '@601gzrce'}</strong> 取得匯款資訊。</p>
          </div>
        ) : (
          <div className="space-y-3 text-sm mt-4">
            <Row label="銀行名稱（代號）" value={paymentInfo.bank_name} onCopy={() => copy(paymentInfo.bank_name, 'bn')} copied={copied === 'bn'} />
            <Row label="帳號" value={paymentInfo.bank_account} onCopy={() => copy(paymentInfo.bank_account, 'ba')} copied={copied === 'ba'} valueClass="font-mono" />
            <Row label="戶名" value={paymentInfo.bank_holder} />
            <Row label="金額" value={`NT$ ${order.total.toLocaleString()}`} valueClass="font-bold text-primary" onCopy={() => copy(String(order.total), 'amt')} copied={copied === 'amt'} />
          </div>
        )}
      </section>

      {/* Instructions */}
      <section className="bg-gradient-to-br from-primary/5 to-tertiary/5 rounded-3xl p-8 border border-primary/10 mb-8">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          繳費說明
        </h2>
        <ol className="space-y-3 text-sm text-on-surface list-decimal list-inside">
          <li>依上方帳號完成匯款 NT$ {order.total.toLocaleString()}</li>
          <li>將匯款截圖 <strong>連同訂單編號</strong> <code className="bg-surface-container px-2 py-0.5 rounded text-xs">{order.order_id}</code> 傳送給 LINE 小助理 <strong className="text-primary">{paymentInfo.line_assistant_id || '@601gzrce'}</strong></li>
          <li>管理員確認款項後，堂數會立即加到您的帳號</li>
          <li>堂數效期規則：購買 <strong className="text-primary">1–8 堂</strong> 為本月月底，<strong className="text-primary">超過 8 堂</strong> 為兩個月</li>
        </ol>
        {paymentInfo.payment_note && (
          <p className="mt-4 pt-4 border-t border-outline-variant/20 text-xs text-on-surface-variant">
            ⚠️ {paymentInfo.payment_note}
          </p>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => onNavigate('dashboard')}
          className="flex-1 py-3.5 rounded-full bg-primary text-on-primary font-semibold hover:opacity-90 transition-opacity"
        >
          我知道了，回會員中心
        </button>
        <button
          onClick={() => onNavigate('schedule')}
          className="flex-1 py-3.5 rounded-full bg-surface-container-high text-on-surface font-medium hover:bg-surface-container-highest transition-colors flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          瀏覽課程
        </button>
      </div>
    </motion.div>
  );
}

function Row({
  label,
  value,
  valueClass = '',
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  valueClass?: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2">
        <span className={valueClass || 'font-medium'}>{value}</span>
        {onCopy && (
          <button
            onClick={onCopy}
            className="p-1.5 rounded-lg hover:bg-surface-container transition-colors"
            title="複製"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-on-surface-variant" />}
          </button>
        )}
      </div>
    </div>
  );
}
