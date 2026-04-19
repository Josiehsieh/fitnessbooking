import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import LoginScreen from './screens/LoginScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import DashboardScreen from './screens/DashboardScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import UboundInfoScreen from './screens/UboundInfoScreen';
import LineLoginScreen from './screens/LineLoginScreen';
import GoogleLoginScreen from './screens/GoogleLoginScreen';
import AdminScreen from './screens/AdminScreen';
import PaymentPendingScreen from './screens/PaymentPendingScreen';
import { User, ClassItem, BookingResult, Order, PaymentInfo, saveToken, clearToken } from './api/client';

export type Screen =
  | 'login'
  | 'schedule'
  | 'dashboard'
  | 'checkout'
  | 'confirmation'
  | 'payment-pending'
  | 'ubound-info'
  | 'line-login'
  | 'google-login'
  | 'admin';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('schedule');
  const [user, setUser] = useState<User | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [oauthErrorMsg, setOauthErrorMsg] = useState<string>('');

  const isLoggedIn = user !== null;

  // ── Handle OAuth redirect callback (Google / LINE) ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const oauthUserB64 = params.get('oauth_user');
    const oauthError = params.get('oauth_error');

    if (oauthToken && oauthUserB64) {
      try {
        const b64 = decodeURIComponent(oauthUserB64);
        // atob() returns a binary string (one byte per char in Latin-1).
        // The payload is UTF-8 encoded JSON, so we must decode it as UTF-8
        // otherwise Chinese / emoji in the display name become mojibake.
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const jsonStr = new TextDecoder('utf-8').decode(bytes);
        const parsed = JSON.parse(jsonStr);
        setUser(parsed);
        saveToken(oauthToken);
        window.history.replaceState({}, '', '/');
        setCurrentScreen('dashboard');
      } catch (e) {
        window.history.replaceState({}, '', '/');
        setOauthErrorMsg(
          `登入資料解析失敗：${e instanceof Error ? e.message : String(e)}`,
        );
        setCurrentScreen('login');
      }
    } else if (oauthError) {
      window.history.replaceState({}, '', '/');
      setOauthErrorMsg(oauthError);
      setCurrentScreen('login');
    }
  }, []);

  const handleNavigate = (screen: Screen) => {
    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogin = (loggedInUser: User, token: string) => {
    setUser(loggedInUser);
    saveToken(token);
    handleNavigate('dashboard');
  };

  const handleLogout = () => {
    setUser(null);
    clearToken();
    handleNavigate('schedule');
  };

  const handleBookClass = (cls: ClassItem) => {
    setSelectedClass(cls);
    if (!isLoggedIn) {
      handleNavigate('login');
    } else {
      handleNavigate('checkout');
    }
  };

  const handleBookingComplete = (result: BookingResult, updatedCredits: number) => {
    setBookingResult(result);
    if (user) setUser({ ...user, credits: updatedCredits });
    handleNavigate('confirmation');
  };

  const handleOrderCreated = (order: Order, info: PaymentInfo) => {
    setPendingOrder(order);
    setPaymentInfo(info);
    handleNavigate('payment-pending');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {oauthErrorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-error text-on-error shadow-xl rounded-2xl px-5 py-4 flex items-start gap-3 max-w-lg w-[92%]"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-bold mb-0.5">登入失敗</p>
            <p className="opacity-90 break-words">{oauthErrorMsg}</p>
          </div>
          <button
            onClick={() => setOauthErrorMsg('')}
            className="opacity-70 hover:opacity-100"
            aria-label="關閉"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {currentScreen !== 'line-login' && currentScreen !== 'google-login' && (
        <Navbar
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          isLoggedIn={isLoggedIn}
        />
      )}

      <main className="flex-grow flex flex-col">
        <AnimatePresence mode="wait">
          {currentScreen === 'login' && (
            <LoginScreen key="login" onLogin={handleLogin} onNavigate={handleNavigate} />
          )}
          {currentScreen === 'line-login' && (
            <LineLoginScreen key="line-login" onLogin={() => handleNavigate('dashboard')} onCancel={() => handleNavigate('login')} />
          )}
          {currentScreen === 'google-login' && (
            <GoogleLoginScreen key="google-login" onLogin={() => handleNavigate('dashboard')} onCancel={() => handleNavigate('login')} />
          )}
          {currentScreen === 'schedule' && (
            <ScheduleScreen
              key="schedule"
              onNavigate={handleNavigate}
              onBookClass={handleBookClass}
              onCreditsChanged={(credits) => {
                if (user) setUser({ ...user, credits });
              }}
              user={user}
            />
          )}
          {currentScreen === 'dashboard' && (
            <DashboardScreen
              key="dashboard"
              onNavigate={handleNavigate}
              user={user}
              onLogout={handleLogout}
              onUserUpdated={(u) => setUser(u)}
            />
          )}
          {currentScreen === 'checkout' && (
            <CheckoutScreen
              key="checkout"
              onNavigate={handleNavigate}
              selectedClass={selectedClass}
              user={user}
              onBookingComplete={handleBookingComplete}
              onOrderCreated={handleOrderCreated}
            />
          )}
          {currentScreen === 'payment-pending' && (
            <PaymentPendingScreen
              key="payment-pending"
              onNavigate={handleNavigate}
              order={pendingOrder}
              paymentInfo={paymentInfo}
            />
          )}
          {currentScreen === 'confirmation' && (
            <ConfirmationScreen
              key="confirmation"
              onNavigate={handleNavigate}
              bookingResult={bookingResult}
            />
          )}
          {currentScreen === 'ubound-info' && (
            <UboundInfoScreen key="ubound-info" onNavigate={handleNavigate} />
          )}
          {currentScreen === 'admin' && (
            <AdminScreen key="admin" onNavigate={handleNavigate} />
          )}
        </AnimatePresence>
      </main>

      {currentScreen !== 'login' &&
        currentScreen !== 'line-login' &&
        currentScreen !== 'google-login' && <Footer />}
    </div>
  );
}
