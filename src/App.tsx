import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
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

  const isLoggedIn = user !== null;

  // ── Handle OAuth redirect callback (Google / LINE) ───────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const oauthUserB64 = params.get('oauth_user');
    const oauthError = params.get('oauth_error');

    if (oauthToken && oauthUserB64) {
      try {
        const parsed = JSON.parse(atob(decodeURIComponent(oauthUserB64)));
        setUser(parsed);
        saveToken(oauthToken);
        window.history.replaceState({}, '', '/');
        setCurrentScreen('dashboard');
      } catch {
        // Malformed base64 – ignore
      }
    } else if (oauthError) {
      window.history.replaceState({}, '', '/');
      // Could surface this in a toast; for now just return to login
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
