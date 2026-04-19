// Base URL: empty string means same origin (works on Vercel).
// In local dev, Vite proxies /api → http://localhost:5000
const BASE = "";

export interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
  credits_expire_at?: string;
  has_password?: boolean;
  has_real_email?: boolean;
  line_linked?: boolean;
  notify_email?: boolean;
  notify_line?: boolean;
}

export interface NotificationPrefs {
  notify_email: boolean;
  notify_line: boolean;
  line_linked: boolean;
  has_real_email: boolean;
  server_channels: { email: boolean; line: boolean };
}

export interface Order {
  order_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  quantity: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon_code: string;
  status: "pending" | "paid" | "cancelled";
  created_at: string;
  paid_at?: string;
  notes?: string;
}

export interface PaymentInfo {
  bank_name: string;
  bank_account: string;
  bank_holder: string;
  line_assistant_id: string;
  payment_note: string;
}

export interface OrderCreateResponse {
  order: Order;
  payment_info: PaymentInfo;
}

export interface ClassItem {
  class_id: string;
  date: string;
  time: string;
  duration: number;
  name: string;
  price: number;
  total_spots: number;
  booked_spots: number;
  day_label: string;
}

export interface Booking {
  booking_id: string;
  user_id: string;
  class_id: string;
  class_name: string;
  class_datetime: string;
  status: string;
}

export interface BookingResult {
  id: string;
  class_name: string;
  class_datetime: string;
  date: string;
  time: string;
  duration: number;
  status: string;
}

export interface Package {
  id: string;
  name: string;
  price: number;
  credits: number;
}

// ── Token storage ──────────────────────────────────────────────────────────────

export function saveToken(token: string) {
  localStorage.setItem("auth_token", token);
}

export function getToken(): string {
  return localStorage.getItem("auth_token") ?? "";
}

export function clearToken() {
  localStorage.removeItem("auth_token");
}

// ── Core fetch helper ──────────────────────────────────────────────────────────
// Short TTL cache for GETs (and in-flight dedup) to mitigate Google Sheets API
// rate limits when the user clicks rapidly between tabs.
const GET_CACHE_TTL_MS = 8000;
const getCache = new Map<string, { ts: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function clearGetCache(pathPrefix?: string) {
  if (!pathPrefix) {
    getCache.clear();
    return;
  }
  for (const key of Array.from(getCache.keys())) {
    if (key.startsWith(pathPrefix)) getCache.delete(key);
  }
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const cacheable = method === "GET";

  if (cacheable) {
    const hit = getCache.get(path);
    if (hit && Date.now() - hit.ts < GET_CACHE_TTL_MS) {
      return hit.data as T;
    }
    const pending = inflight.get(path);
    if (pending) return pending as Promise<T>;
  }

  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const request = (async () => {
    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json();

    if (!res.ok) {
      const err = new Error(data.error ?? "發生未知錯誤") as Error & { code?: string };
      err.code = data.code;
      throw err;
    }
    return data as T;
  })();

  if (cacheable) {
    inflight.set(path, request);
    try {
      const data = await request;
      getCache.set(path, { ts: Date.now(), data });
      return data;
    } finally {
      inflight.delete(path);
    }
  }

  // Non-GET: invalidate any cached path that could be affected.
  try {
    return await request;
  } finally {
    clearGetCache("/api/");
  }
}

// ── API surface ────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      apiFetch<{ user: User; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),

    register: (email: string, password: string, name?: string) =>
      apiFetch<{ user: User; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      }),

    getMe: () => apiFetch<{ user: User }>("/api/user/me"),

    updateMe: (payload: {
      name?: string;
      current_password?: string;
      new_password?: string;
    }) =>
      apiFetch<{ user: User; message: string }>("/api/user/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),

    getNotifications: () =>
      apiFetch<NotificationPrefs>("/api/user/notifications"),

    updateNotifications: (payload: { notify_email?: boolean; notify_line?: boolean }) =>
      apiFetch<{ message: string; notify_email: boolean; notify_line: boolean }>(
        "/api/user/notifications",
        { method: "PATCH", body: JSON.stringify(payload) }
      ),
  },

  classes: {
    list: () => apiFetch<{ classes: ClassItem[] }>("/api/classes"),
  },

  bookings: {
    create: (classId: string) =>
      apiFetch<{ booking: BookingResult; credits_remaining: number }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ class_id: classId }),
      }),

    list: () => apiFetch<{ bookings: Booking[] }>("/api/bookings/user"),

    cancel: (bookingId: string) =>
      apiFetch<{ message: string; credits: number }>(`/api/bookings/${bookingId}`, {
        method: "DELETE",
      }),
  },

  packages: {
    pricing: () =>
      apiFetch<{ price_per_class: number; bulk_discount_min: number; bulk_discount_amount: number }>(
        "/api/packages/pricing"
      ),
  },

  orders: {
    create: (quantity: number, couponCode?: string) =>
      apiFetch<OrderCreateResponse>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ quantity, coupon_code: couponCode ?? "" }),
      }),

    listMine: () => apiFetch<{ orders: Order[] }>("/api/orders/mine"),
  },

  settings: {
    get: () => apiFetch<PaymentInfo>("/api/settings"),
  },

  admin: {
    check: () => apiFetch<{ is_admin: boolean }>("/api/admin/check"),

    stats: () =>
      apiFetch<{
        total_users: number;
        total_classes: number;
        total_bookings: number;
        confirmed_bookings: number;
        cancelled_bookings: number;
        estimated_revenue: number;
        actual_revenue: number;
        pending_revenue: number;
        pending_orders: number;
        paid_orders: number;
        total_spots: number;
        booked_spots: number;
        occupancy_rate: number;
        total_credits_held: number;
      }>("/api/admin/stats"),

    listUsers: () =>
      apiFetch<{
        users: Array<{
          user_id: string;
          email: string;
          name: string;
          credits: number;
          credits_expire_at?: string;
          expired?: boolean;
          created_at: string;
        }>;
        total: number;
      }>("/api/admin/users"),

    updateCredits: (userId: string, credits: number) =>
      apiFetch<{ message: string; credits: number; credits_expire_at: string }>(
        `/api/admin/users/${userId}/credits`,
        { method: "PATCH", body: JSON.stringify({ credits }) }
      ),

    updateUserExpiry: (userId: string, creditsExpireAt: string) =>
      apiFetch<{ message: string; credits: number; credits_expire_at: string }>(
        `/api/admin/users/${userId}/credits`,
        {
          method: "PATCH",
          body: JSON.stringify({ credits_expire_at: creditsExpireAt }),
        }
      ),

    createClass: (payload: {
      date: string;
      time: string;
      name: string;
      duration?: number;
      price?: number;
      total_spots?: number;
    }) =>
      apiFetch<{ message: string; class_id: string }>("/api/admin/classes", {
        method: "POST",
        body: JSON.stringify(payload),
      }),

    deleteClass: (classId: string) =>
      apiFetch<{ message: string }>(`/api/admin/classes/${classId}`, {
        method: "DELETE",
      }),

    listBookings: () =>
      apiFetch<{
        bookings: Array<{
          booking_id: string;
          user_id: string;
          user_email: string;
          user_name: string;
          class_id: string;
          class_name: string;
          class_datetime: string;
          status: string;
          created_at: string;
        }>;
        total: number;
      }>("/api/admin/bookings"),

    listOrders: () =>
      apiFetch<{ orders: Order[]; total: number }>("/api/admin/orders"),

    confirmOrder: (orderId: string) =>
      apiFetch<{ message: string; credits: number; credits_expire_at: string }>(
        `/api/admin/orders/${orderId}/confirm`,
        { method: "POST" }
      ),

    cancelOrder: (orderId: string, reason?: string) =>
      apiFetch<{ message: string }>(`/api/admin/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: reason ?? "" }),
      }),

    getSettings: () =>
      apiFetch<{ settings: Record<string, string> }>("/api/admin/settings"),

    updateSettings: (settings: Record<string, string>) =>
      apiFetch<{ message: string; settings: Record<string, string> }>(
        "/api/admin/settings",
        { method: "PATCH", body: JSON.stringify(settings) }
      ),

    notifyStatus: () =>
      apiFetch<{ email: boolean; line: boolean; gmail_user: string; from_name: string }>(
        "/api/admin/notify/status"
      ),

    testEmail: (to?: string) =>
      apiFetch<{ message: string; detail: string }>("/api/admin/notify/test_email", {
        method: "POST",
        body: JSON.stringify({ to: to ?? "" }),
      }),

    testLine: (lineUserId?: string) =>
      apiFetch<{ message: string; detail: string }>("/api/admin/notify/test_line", {
        method: "POST",
        body: JSON.stringify({ line_user_id: lineUserId ?? "" }),
      }),
  },
};
