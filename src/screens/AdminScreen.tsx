import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ClipboardList,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  TrendingUp,
  DollarSign,
  UserCheck,
  CheckCircle2,
  XCircle,
  Receipt,
  Settings,
  Clock,
  Save,
  Filter,
  X,
  Mail,
  MessageSquare,
  Send,
  Bell,
} from 'lucide-react';
import { Screen } from '../App';
import { api, Order } from '../api/client';

interface AdminScreenProps {
  onNavigate: (screen: Screen) => void;
}

type Tab = 'dashboard' | 'orders' | 'users' | 'classes' | 'bookings' | 'settings';

export default function AdminScreen({ onNavigate }: AdminScreenProps) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api.admin
      .check()
      .then((r) => setIsAdmin(r.is_admin))
      .catch(() => setIsAdmin(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <XCircle className="w-12 h-12 text-error" />
        <h2 className="text-2xl font-semibold">您沒有管理員權限</h2>
        <p className="text-on-surface-variant text-center">
          請聯絡系統管理員，將您的 email 加入管理員清單。
        </p>
        <button
          onClick={() => onNavigate('dashboard')}
          className="mt-4 px-6 py-2.5 rounded-full bg-primary text-on-primary font-medium"
        >
          返回會員中心
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-20">
      <header className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">管理員後台</h1>
            <p className="text-sm text-on-surface-variant">Admin Dashboard</p>
          </div>
          <button
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2 text-sm rounded-full bg-surface-container-high hover:bg-surface-container-highest"
          >
            回會員中心
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-1 overflow-x-auto">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<LayoutDashboard className="w-4 h-4" />} label="儀表板" />
          <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<Receipt className="w-4 h-4" />} label="訂單管理" />
          <TabButton active={tab === 'users'} onClick={() => setTab('users')} icon={<Users className="w-4 h-4" />} label="會員管理" />
          <TabButton active={tab === 'classes'} onClick={() => setTab('classes')} icon={<CalendarDays className="w-4 h-4" />} label="課程管理" />
          <TabButton active={tab === 'bookings'} onClick={() => setTab('bookings')} icon={<ClipboardList className="w-4 h-4" />} label="預約紀錄" />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<Settings className="w-4 h-4" />} label="系統設定" />
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'orders' && <OrdersTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'classes' && <ClassesTab />}
        {tab === 'bookings' && <BookingsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Dashboard Tab ──────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.admin.stats>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.admin
      .stats()
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;
  if (!stats) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="實際營收" value={`NT$ ${(stats.actual_revenue ?? stats.estimated_revenue).toLocaleString()}`} hint="已付款訂單總額" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="待確認訂單" value={(stats.pending_orders ?? 0).toString()} hint={`NT$ ${(stats.pending_revenue ?? 0).toLocaleString()} 待入帳`} />
        <StatCard icon={<UserCheck className="w-5 h-5" />} label="總會員數" value={stats.total_users.toString()} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="場位使用率" value={`${stats.occupancy_rate}%`} hint={`${stats.booked_spots} / ${stats.total_spots}`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniStat label="總預約數" value={stats.total_bookings} />
        <MiniStat label="已確認" value={stats.confirmed_bookings} color="text-green-600" />
        <MiniStat label="已取消" value={stats.cancelled_bookings} color="text-red-500" />
      </div>

      <div className="rounded-2xl bg-surface-container p-6">
        <p className="text-sm text-on-surface-variant mb-1">會員手上持有堂數總和</p>
        <p className="text-3xl font-bold">{stats.total_credits_held} 堂</p>
        <p className="text-xs text-on-surface-variant mt-2">
          = 潛在未實現營收約 NT$ {(stats.total_credits_held * 150).toLocaleString()}
        </p>
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface-container p-5">
      <div className="flex items-center gap-2 text-on-surface-variant mb-2">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-on-surface-variant mt-1">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value, color = '' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low p-4">
      <p className="text-sm text-on-surface-variant">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

// ── Users Tab ──────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.admin.listUsers>>['users']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    api.admin
      .listUsers()
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  const handleAdjust = async (userId: string, current: number, delta: number) => {
    const next = Math.max(0, current + delta);
    setSaving(userId);
    try {
      await api.admin.updateCredits(userId, next);
      setUsers((list) => list.map((u) => (u.user_id === userId ? { ...u, credits: next } : u)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleSet = async (userId: string) => {
    const input = prompt('請輸入新的堂數：');
    if (input === null) return;
    const n = parseInt(input, 10);
    if (isNaN(n) || n < 0) {
      alert('請輸入有效的數字');
      return;
    }
    setSaving(userId);
    try {
      await api.admin.updateCredits(userId, n);
      setUsers((list) => list.map((u) => (u.user_id === userId ? { ...u, credits: n } : u)));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const handleSetExpiry = async (userId: string, current: string | undefined) => {
    const input = prompt(
      '請輸入堂數到期日（YYYY-MM-DD）：\n・留空則清除到期日\n・例：' + new Date().toISOString().slice(0, 10),
      current || '',
    );
    if (input === null) return;
    const value = input.trim();
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      alert('日期格式錯誤，請用 YYYY-MM-DD');
      return;
    }
    setSaving(userId);
    try {
      const res = await api.admin.updateUserExpiry(userId, value);
      setUsers((list) =>
        list.map((u) =>
          u.user_id === userId
            ? { ...u, credits_expire_at: res.credits_expire_at, expired: false }
            : u,
        ),
      );
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="rounded-2xl bg-surface-container overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-high text-on-surface-variant">
            <tr>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">姓名</th>
              <th className="text-right px-4 py-3">堂數</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">有效期</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">註冊時間</th>
              <th className="text-center px-4 py-3">調整</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-outline-variant">
                <td className="px-4 py-3 font-medium">{u.email}</td>
                <td className="px-4 py-3">{u.name || '—'}</td>
                <td className="px-4 py-3 text-right font-bold text-primary">
                  {u.credits}
                  {u.expired && u.credits > 0 && (
                    <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-red-100 text-red-700">已過期</span>
                  )}
                </td>
                <td className="px-4 py-3 hidden md:table-cell text-xs">
                  <div className="flex items-center gap-2">
                    <span className={u.expired && u.credits > 0 ? 'text-red-600 font-semibold' : 'text-on-surface-variant'}>
                      {u.credits_expire_at || '—'}
                    </span>
                    <button
                      disabled={saving === u.user_id}
                      onClick={() => handleSetExpiry(u.user_id, u.credits_expire_at)}
                      className="px-2 h-6 rounded-md bg-surface-container-high text-[10px] font-semibold text-on-surface-variant hover:bg-primary hover:text-on-primary disabled:opacity-50"
                      title="編輯有效期"
                    >
                      編輯
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 text-on-surface-variant hidden lg:table-cell">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-TW') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-center gap-1">
                    <button
                      disabled={saving === u.user_id}
                      onClick={() => handleAdjust(u.user_id, u.credits, -1)}
                      className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-error hover:text-on-error disabled:opacity-50"
                    >
                      −
                    </button>
                    <button
                      disabled={saving === u.user_id}
                      onClick={() => handleAdjust(u.user_id, u.credits, 1)}
                      className="w-8 h-8 rounded-full bg-surface-container-high hover:bg-primary hover:text-on-primary disabled:opacity-50"
                    >
                      +
                    </button>
                    <button
                      disabled={saving === u.user_id}
                      onClick={() => handleSet(u.user_id)}
                      className="px-3 h-8 rounded-full bg-surface-container-high text-xs hover:bg-primary hover:text-on-primary disabled:opacity-50"
                    >
                      設定
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 && <p className="text-center py-8 text-on-surface-variant">目前沒有會員</p>}
    </div>
  );
}

const inputCls = "w-full px-4 py-2.5 rounded-xl bg-surface-container-low border-none focus:ring-2 focus:ring-primary/20 outline-none text-on-surface";

// ── Classes Tab ────────────────────────────────────────────────────────────────

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'upcoming' | 'past' | 'custom';

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeekISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(): string {
  const d = new Date();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function ClassesTab() {
  const [classes, setClasses] = useState<Array<{
    class_id: string;
    date: string;
    time: string;
    name: string;
    duration: number;
    price: number;
    total_spots: number;
    booked_spots: number;
    day_label: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    date: '',
    time: '19:00',
    name: 'U-Bound 彈跳床課程',
    duration: 60,
    price: 800,
    total_spots: 10,
  });
  const [submitting, setSubmitting] = useState(false);
  const [classBookings, setClassBookings] = useState<Awaited<ReturnType<typeof api.admin.listBookings>>['bookings']>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Date filter state
  const [preset, setPreset] = useState<DatePreset>('upcoming');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const reload = () => {
    setLoading(true);
    api.classes
      .list()
      .then((r) => setClasses(r.classes as typeof classes))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    setBookingsLoading(true);
    api.admin
      .listBookings()
      .then((r) => setClassBookings(r.bookings))
      .catch((e) => setBookingsError(e.message))
      .finally(() => setBookingsLoading(false));
  }, []);

  const resetForm = () => {
    setForm({
      date: '',
      time: '19:00',
      name: 'U-Bound 彈跳床課程',
      duration: 60,
      price: 800,
      total_spots: 10,
    });
  };

  const openCreate = () => {
    resetForm();
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (c: typeof classes[number]) => {
    setForm({
      date: c.date,
      time: c.time,
      name: c.name,
      duration: c.duration,
      price: c.price ?? 0,
      total_spots: c.total_spots,
    });
    setEditingId(c.class_id);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.time || !form.name) {
      alert('請完整填寫');
      return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        const target = classes.find((c) => c.class_id === editingId);
        if (target && form.total_spots < target.booked_spots) {
          alert(`名額不可低於目前已預約人數（${target.booked_spots}）`);
          setSubmitting(false);
          return;
        }
        await api.admin.updateClass(editingId, form);
      } else {
        await api.admin.createClass(form);
      }
      closeForm();
      reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (classId: string) => {
    if (!confirm('確定要刪除這堂課？')) return;
    try {
      await api.admin.deleteClass(classId);
      setClasses((list) => list.filter((c) => c.class_id !== classId));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const selectedClass = selectedClassId
    ? classes.find((c) => c.class_id === selectedClassId) ?? null
    : null;

  const selectedClassMembers = selectedClassId
    ? classBookings.filter(
        (b) => b.class_id === selectedClassId && b.status === 'confirmed',
      )
    : [];

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  // Resolve active date range based on preset / custom inputs
  const today = todayISO();
  let rangeFrom = '';
  let rangeTo = '';
  switch (preset) {
    case 'today':
      rangeFrom = today;
      rangeTo = today;
      break;
    case 'week':
      rangeFrom = startOfWeekISO();
      rangeTo = addDays(rangeFrom, 6);
      break;
    case 'month':
      rangeFrom = startOfMonthISO();
      rangeTo = endOfMonthISO();
      break;
    case 'upcoming':
      rangeFrom = today;
      rangeTo = '';
      break;
    case 'past':
      rangeFrom = '';
      rangeTo = addDays(today, -1);
      break;
    case 'custom':
      rangeFrom = customFrom;
      rangeTo = customTo;
      break;
    case 'all':
    default:
      rangeFrom = '';
      rangeTo = '';
  }

  const filtered = classes
    .filter((c) => {
      if (rangeFrom && c.date < rangeFrom) return false;
      if (rangeTo && c.date > rangeTo) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });

  const resetFilter = () => {
    setPreset('all');
    setCustomFrom('');
    setCustomTo('');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => (showForm ? closeForm() : openCreate())}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary font-medium"
        >
          <Plus className="w-4 h-4" />
          {showForm ? '取消' : '新增課程'}
        </button>
      </div>

      {/* Date filter */}
      <div className="rounded-2xl bg-surface-container p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant mr-2">
            <Filter className="w-3.5 h-3.5" />
            日期篩選
          </div>
          {([
            ['all', '全部'],
            ['today', '今日'],
            ['week', '本週'],
            ['month', '本月'],
            ['upcoming', '未來'],
            ['past', '已過期'],
            ['custom', '自訂'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                preset === key
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              {label}
            </button>
          ))}
          {preset !== 'all' && (
            <button
              onClick={resetFilter}
              className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high"
              title="清除篩選"
            >
              <X className="w-3 h-3" />
              清除
            </button>
          )}
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="block">
              <span className="text-xs text-on-surface-variant mb-1 block">起始日期</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-xs text-on-surface-variant mb-1 block">結束日期</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom || undefined}
                className={inputCls}
              />
            </label>
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-on-surface-variant pt-1">
          <span>
            顯示 <strong className="text-on-surface">{filtered.length}</strong> / {classes.length} 堂
            {(rangeFrom || rangeTo) && (
              <span className="ml-2 text-on-surface-variant/80">
                （{rangeFrom || '—'} ~ {rangeTo || '—'}）
              </span>
            )}
          </span>
        </div>
      </div>

      {showForm && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          onSubmit={handleSubmit}
          className="rounded-2xl bg-surface-container p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-on-surface-variant uppercase tracking-wider">
            {editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {editingId ? '編輯課程' : '新增課程'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="日期">
              <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="時間">
              <input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="課程名稱">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
            </FormField>
            <FormField label="時長（分鐘）">
              <input type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value) || 60 })} className={inputCls} />
            </FormField>
            <FormField label="單堂價格（NT$）">
              <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value) || 0 })} className={inputCls} />
            </FormField>
            <FormField label="總名額">
              <input type="number" value={form.total_spots} onChange={(e) => setForm({ ...form, total_spots: parseInt(e.target.value) || 10 })} className={inputCls} />
            </FormField>
          </div>
          {editingId && (() => {
            const target = classes.find((c) => c.class_id === editingId);
            if (!target || target.booked_spots === 0) return null;
            return (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                目前已有 <strong>{target.booked_spots}</strong> 人預約這堂課，名額不得低於此數字。
              </p>
            );
          })()}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={closeForm} className="px-4 py-2 rounded-full bg-surface-container-high">
              取消
            </button>
            <button type="submit" disabled={submitting} className="px-6 py-2 rounded-full bg-primary text-on-primary font-medium flex items-center gap-2 disabled:opacity-60">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? '儲存變更' : '建立課程'}
            </button>
          </div>
        </motion.form>
      )}

      <div className="rounded-2xl bg-surface-container overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-high text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">日期 / 時間</th>
                <th className="text-left px-4 py-3">課程</th>
                <th className="text-center px-4 py-3">名額</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isPast = c.date < today;
                const isSelected = c.class_id === selectedClassId;
                return (
                  <tr
                    key={c.class_id}
                    onClick={() => setSelectedClassId((prev) => (prev === c.class_id ? null : c.class_id))}
                    className={`border-t border-outline-variant cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary-container/30' : 'hover:bg-surface-container-high'
                    } ${isPast ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {c.date}
                        {isPast && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-normal">
                            已過期
                          </span>
                        )}
                        {c.date === today && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-container text-on-primary-container font-bold">
                            今日
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-on-surface-variant">{c.time} · {c.duration}分鐘</div>
                    </td>
                    <td className="px-4 py-3">{c.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold">{c.booked_spots}</span>
                      <span className="text-on-surface-variant"> / {c.total_spots}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(c);
                          }}
                          className="p-2 rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                          title="編輯課程"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(c.class_id);
                          }}
                          className="p-2 rounded-full hover:bg-error hover:text-on-error transition-colors"
                          title="刪除課程"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-center py-8 text-on-surface-variant">
            {classes.length === 0 ? '目前沒有課程' : '此日期範圍內沒有課程'}
          </p>
        )}
      </div>
      {selectedClassId && (
        <div className="rounded-2xl bg-surface-container p-4 md:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">本堂課預約名單</h3>
              <p className="text-sm text-on-surface-variant">
                {selectedClass
                  ? `${selectedClass.date} ${selectedClass.time} · ${selectedClass.name}`
                  : '課程資訊載入中'}
              </p>
            </div>
            <button
              onClick={() => setSelectedClassId(null)}
              className="px-3 py-1.5 rounded-full bg-surface-container-high text-xs font-medium text-on-surface-variant hover:bg-surface-container-highest"
            >
              關閉
            </button>
          </div>

          {bookingsLoading ? (
            <div className="py-4 flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="w-4 h-4 animate-spin" />
              名單載入中...
            </div>
          ) : bookingsError ? (
            <p className="text-sm text-error">載入預約名單失敗：{bookingsError}</p>
          ) : selectedClassMembers.length === 0 ? (
            <p className="text-sm text-on-surface-variant">目前沒有人預約這堂課。</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-outline-variant">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-high text-on-surface-variant">
                  <tr>
                    <th className="text-left px-4 py-2.5">姓名</th>
                    <th className="text-left px-4 py-2.5">Email</th>
                    <th className="text-left px-4 py-2.5">預約時間</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedClassMembers.map((b) => (
                    <tr key={b.booking_id} className="border-t border-outline-variant">
                      <td className="px-4 py-2.5">{b.user_name || '未填寫'}</td>
                      <td className="px-4 py-2.5">{b.user_email || '—'}</td>
                      <td className="px-4 py-2.5 text-on-surface-variant">{b.created_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-on-surface-variant mb-1 block">{label}</span>
      {children}
    </label>
  );
}

// ── Bookings Tab ───────────────────────────────────────────────────────────────

function BookingsTab() {
  const [bookings, setBookings] = useState<Awaited<ReturnType<typeof api.admin.listBookings>>['bookings']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [busyBookingId, setBusyBookingId] = useState('');

  useEffect(() => {
    api.admin
      .listBookings()
      .then((r) => setBookings(r.bookings))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  const filtered = filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);

  const handleDeleteBooking = async (bookingId: string) => {
    if (!confirm('確定要刪除此筆預約？系統會回補該會員 1 堂並釋出名額。')) return;
    setBusyBookingId(bookingId);
    try {
      await api.admin.deleteBooking(bookingId);
      setBookings((list) =>
        list.map((b) => (b.booking_id === bookingId ? { ...b, status: 'cancelled' } : b)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setBusyBookingId('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['all', 'confirmed', 'cancelled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm rounded-full ${
              filter === f ? 'bg-primary text-on-primary' : 'bg-surface-container-high'
            }`}
          >
            {f === 'all' ? '全部' : f === 'confirmed' ? '已確認' : '已取消'}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-surface-container overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-high text-on-surface-variant">
              <tr>
                <th className="text-left px-4 py-3">會員</th>
                <th className="text-left px-4 py-3">課程</th>
                <th className="text-left px-4 py-3">上課時間</th>
                <th className="text-center px-4 py-3">狀態</th>
                <th className="text-center px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.booking_id} className="border-t border-outline-variant">
                  <td className="px-4 py-3">
                    <div className="font-medium">{b.user_name || b.user_email}</div>
                    <div className="text-xs text-on-surface-variant">{b.user_email}</div>
                  </td>
                  <td className="px-4 py-3">{b.class_name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{b.class_datetime}</td>
                  <td className="px-4 py-3 text-center">
                    {b.status === 'confirmed' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs">
                        <CheckCircle2 className="w-3 h-3" />
                        已確認
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">
                        <XCircle className="w-3 h-3" />
                        已取消
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleDeleteBooking(b.booking_id)}
                      disabled={b.status === 'cancelled' || busyBookingId === b.booking_id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-surface-container-high hover:bg-error hover:text-on-error disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title={b.status === 'cancelled' ? '此預約已取消' : '刪除預約（回補堂數）'}
                    >
                      {busyBookingId === b.booking_id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <p className="text-center py-8 text-on-surface-variant">沒有符合條件的預約</p>}
      </div>
    </div>
  );
}

// ── Shared blocks ──────────────────────────────────────────────────────────────

function LoadingBlock() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-red-700">
      <p className="font-medium">讀取失敗</p>
      <p className="text-sm mt-1">{message}</p>
    </div>
  );
}

// ── Orders Tab ─────────────────────────────────────────────────────────────────

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'cancelled'>('pending');
  const [busyId, setBusyId] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Order | null>(null);

  const load = () => {
    setLoading(true);
    api.admin
      .listOrders()
      .then((r) => setOrders(r.orders))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openConfirmDialog = (order: Order) => setConfirmTarget(order);

  const submitConfirm = async (orderId: string, expireAt: string) => {
    setBusyId(orderId);
    try {
      const res = await api.admin.confirmOrder(orderId, expireAt);
      alert(`成功！會員目前堂數：${res.credits}（有效期至 ${res.credits_expire_at}）`);
      setConfirmTarget(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '確認失敗');
    } finally {
      setBusyId('');
    }
  };

  const cancelOrder = async (id: string) => {
    const reason = window.prompt('取消原因（可留空）：') ?? '';
    if (reason === null) return;
    setBusyId(id);
    try {
      await api.admin.cancelOrder(id, reason);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '取消失敗');
    } finally {
      setBusyId('');
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const pendingCount = orders.filter((o) => o.status === 'pending').length;

  const statusCls = {
    pending: 'bg-amber-100 text-amber-800',
    paid: 'bg-green-100 text-green-800',
    cancelled: 'bg-gray-100 text-gray-600',
  } as const;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">訂單管理</h2>
          <p className="text-sm text-on-surface-variant">
            {pendingCount > 0 ? `有 ${pendingCount} 筆訂單等待確認付款` : '目前沒有待確認訂單'}
          </p>
        </div>
        <div className="flex gap-1 bg-surface-container rounded-full p-1 text-sm">
          {(['pending', 'paid', 'cancelled', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                filter === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {s === 'all' ? '全部' : s === 'pending' ? '待確認' : s === 'paid' ? '已付款' : '已取消'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-surface-container p-10 text-center text-on-surface-variant">
          沒有符合條件的訂單
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.order_id} className="rounded-2xl bg-surface-container p-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${statusCls[o.status]}`}>
                      {o.status === 'pending' ? '待確認' : o.status === 'paid' ? '已付款' : '已取消'}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono">#{o.order_id}</span>
                  </div>
                  <p className="font-semibold">
                    {o.user_name || o.user_email}
                    <span className="text-sm text-on-surface-variant ml-2">({o.user_email})</span>
                  </p>
                  <div className="mt-1 text-sm text-on-surface-variant flex flex-wrap gap-x-4 gap-y-1">
                    <span>{o.quantity} 堂</span>
                    <span>NT$ {o.subtotal.toLocaleString()} − {o.discount.toLocaleString()} = <strong className="text-primary">NT$ {o.total.toLocaleString()}</strong></span>
                    {o.coupon_code && <span>折扣碼：{o.coupon_code}</span>}
                    <span>建立於 {new Date(o.created_at).toLocaleString('zh-TW')}</span>
                    {o.paid_at && <span>付款於 {new Date(o.paid_at).toLocaleString('zh-TW')}</span>}
                  </div>
                  {o.notes && <p className="mt-2 text-xs text-on-surface-variant">備註：{o.notes}</p>}
                </div>
                {o.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => openConfirmDialog(o)}
                      disabled={busyId === o.order_id}
                      className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                    >
                      {busyId === o.order_id && <Loader2 className="w-4 h-4 animate-spin" />}
                      <CheckCircle2 className="w-4 h-4" />
                      確認付款
                    </button>
                    <button
                      onClick={() => cancelOrder(o.order_id)}
                      disabled={busyId === o.order_id}
                      className="px-4 py-2.5 rounded-full bg-surface-container-high text-on-surface text-sm font-medium hover:bg-error/10 hover:text-error disabled:opacity-50"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmTarget && (
        <ConfirmOrderModal
          order={confirmTarget}
          busy={busyId === confirmTarget.order_id}
          onCancel={() => setConfirmTarget(null)}
          onSubmit={(expireAt) => submitConfirm(confirmTarget.order_id, expireAt)}
        />
      )}
    </motion.div>
  );
}

function ConfirmOrderModal({
  order,
  busy,
  onCancel,
  onSubmit,
}: {
  order: Order;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (expireAt: string) => void;
}) {
  // Default expiry = last day of current month (same rule as backend default).
  const defaultExpiry = (() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  })();
  const today = (() => {
    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
  })();

  const [expireAt, setExpireAt] = useState(defaultExpiry);

  const setRelative = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (x: number) => String(x).padStart(2, '0');
    setExpireAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  };

  const setEndOfMonth = (monthsAhead: number) => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthsAhead + 1, 0);
    const pad = (x: number) => String(x).padStart(2, '0');
    setExpireAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  };

  const invalid = !expireAt || expireAt < today;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-surface-container-lowest rounded-3xl shadow-xl max-w-md w-full p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold font-headline">確認收款</h3>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-on-surface-variant hover:text-on-surface disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-surface-container p-4 mb-5 text-sm space-y-1">
          <p className="font-semibold">
            {order.user_name || order.user_email}
            <span className="text-on-surface-variant font-normal ml-2">
              ({order.user_email})
            </span>
          </p>
          <p className="text-on-surface-variant">
            訂單編號：<span className="font-mono">#{order.order_id}</span>
          </p>
          <p className="text-on-surface-variant">
            本次加購：<strong className="text-primary">{order.quantity} 堂</strong>　/　
            應收：<strong className="text-primary">NT$ {order.total.toLocaleString()}</strong>
          </p>
        </div>

        <label className="block text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
          堂數有效期限
        </label>
        <input
          type="date"
          value={expireAt}
          min={today}
          onChange={(e) => setExpireAt(e.target.value)}
          disabled={busy}
          className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          <QuickDateBtn label="本月底" onClick={() => setEndOfMonth(0)} disabled={busy} />
          <QuickDateBtn label="下月底" onClick={() => setEndOfMonth(1)} disabled={busy} />
          <QuickDateBtn label="+ 30 天" onClick={() => setRelative(30)} disabled={busy} />
          <QuickDateBtn label="+ 60 天" onClick={() => setRelative(60)} disabled={busy} />
          <QuickDateBtn label="+ 90 天" onClick={() => setRelative(90)} disabled={busy} />
        </div>

        <p className="mt-4 text-xs text-on-surface-variant leading-relaxed">
          會員若已有未過期的堂數，系統會自動將所有堂數的到期日統一為較晚的日期，避免被提早失效。
        </p>

        <div className="mt-6 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-5 py-2.5 rounded-full text-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => onSubmit(expireAt)}
            disabled={busy || invalid}
            className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-semibold text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            <CheckCircle2 className="w-4 h-4" />
            確認收款
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickDateBtn({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-1.5 rounded-full bg-surface-container text-xs font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
    >
      {label}
    </button>
  );
}

// ── Settings Tab ───────────────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.admin
      .getSettings()
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.admin.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorBlock message={error} />;

  const fields: { key: string; label: string; placeholder: string; hint?: string }[] = [
    { key: 'bank_name', label: '銀行名稱（代號）', placeholder: '例：國泰世華銀行（013）' },
    { key: 'bank_account', label: '銀行帳號', placeholder: '例：1234567890123' },
    { key: 'bank_holder', label: '戶名', placeholder: '例：王小明' },
    { key: 'line_assistant_id', label: 'LINE 小助理 ID', placeholder: '@601gzrce', hint: '會員需傳送匯款截圖的 LINE 官方帳號' },
    { key: 'payment_note', label: '付款注意事項', placeholder: '例：請於 3 日內完成匯款' },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">系統設定</h2>
        <p className="text-sm text-on-surface-variant">這些資訊會顯示在會員訂單的付款頁面</p>
      </div>

      <div className="bg-surface-container rounded-2xl p-6 space-y-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="block text-sm font-medium mb-1.5">{f.label}</label>
            <input
              type="text"
              value={settings[f.key] ?? ''}
              onChange={(e) => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              className={inputCls}
            />
            {f.hint && <p className="text-xs text-on-surface-variant mt-1">{f.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-3 rounded-full bg-primary text-on-primary font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          儲存設定
        </button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            已儲存
          </span>
        )}
      </div>

      <NotificationsPanel />
    </motion.div>
  );
}

function NotificationsPanel() {
  const [status, setStatus] = useState<{
    email: boolean;
    line: boolean;
    gmail_user: string;
    from_name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [testLineId, setTestLineId] = useState('');
  const [sending, setSending] = useState<'email' | 'line' | null>(null);
  const [result, setResult] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    api.admin
      .notifyStatus()
      .then(setStatus)
      .catch(() => setStatus({ email: false, line: false, gmail_user: '', from_name: '' }))
      .finally(() => setLoading(false));
  }, []);

  const runTest = async (kind: 'email' | 'line') => {
    setResult(null);
    setSending(kind);
    try {
      if (kind === 'email') {
        const r = await api.admin.testEmail(testEmailAddr.trim() || undefined);
        setResult({ text: r.message, type: 'success' });
      } else {
        const r = await api.admin.testLine(testLineId.trim() || undefined);
        setResult({ text: r.message, type: 'success' });
      }
    } catch (e) {
      setResult({
        text: e instanceof Error ? e.message : '發送失敗',
        type: 'error',
      });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="bg-surface-container rounded-2xl p-6 space-y-5">
      <div>
        <h3 className="text-base font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4" />
          通知系統
        </h3>
        <p className="text-xs text-on-surface-variant mt-1">
          會員預約、訂單建立/確認/取消時會自動發送 Email 與 LINE 推播。
        </p>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <StatusPill
              ok={!!status?.email}
              icon={<Mail className="w-3.5 h-3.5" />}
              title="Gmail SMTP"
              detail={
                status?.email
                  ? `寄件者：${status.from_name} <${status.gmail_user}>`
                  : '未設定 GMAIL_USER / GMAIL_APP_PASSWORD'
              }
            />
            <StatusPill
              ok={!!status?.line}
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              title="LINE Messaging API"
              detail={
                status?.line
                  ? '已設定 Channel Access Token'
                  : '未設定 LINE_CHANNEL_ACCESS_TOKEN'
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant">
                測試寄信（留空則寄給自己）
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmailAddr}
                  onChange={(e) => setTestEmailAddr(e.target.value)}
                  placeholder="收件地址"
                  className={inputCls}
                />
                <button
                  onClick={() => runTest('email')}
                  disabled={!status?.email || sending === 'email'}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 flex items-center gap-2"
                >
                  {sending === 'email' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  寄信
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-on-surface-variant">
                測試 LINE 推播（留空則推給自己綁定的 LINE）
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testLineId}
                  onChange={(e) => setTestLineId(e.target.value)}
                  placeholder="LINE userId（U開頭）"
                  className={inputCls}
                />
                <button
                  onClick={() => runTest('line')}
                  disabled={!status?.line || sending === 'line'}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 flex items-center gap-2"
                >
                  {sending === 'line' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  推播
                </button>
              </div>
            </div>
          </div>

          {result && (
            <div
              className={`flex items-start gap-2 text-sm rounded-xl px-4 py-3 ${
                result.type === 'success'
                  ? 'bg-green-50 text-green-800 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {result.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <p>{result.text}</p>
            </div>
          )}

          <div className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl p-4 leading-relaxed">
            <p className="font-semibold mb-1">環境變數設定：</p>
            <code className="block text-[11px] font-mono">
              GMAIL_USER、GMAIL_APP_PASSWORD、GMAIL_FROM_NAME
              <br />
              LINE_CHANNEL_ACCESS_TOKEN
            </code>
            <p className="mt-2">
              Gmail 需於 Google 帳戶開啟二階段驗證後，產生「應用程式密碼」16 碼。
              LINE 推播需先建立 Messaging API Channel，且會員需加入該官方帳號為好友才能收到推播。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function StatusPill({
  ok,
  icon,
  title,
  detail,
}: {
  ok: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 border ${
        ok
          ? 'bg-green-50 border-green-200 text-green-900'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center ${
            ok ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {icon}
        </span>
        {title}
        <span
          className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
            ok ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {ok ? '已啟用' : '未設定'}
        </span>
      </div>
      <p className="text-xs mt-1 opacity-80">{detail}</p>
    </div>
  );
}
