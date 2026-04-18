// Base URL: empty string means same origin (works on Vercel).
// In local dev, Vite proxies /api → http://localhost:5000
const BASE = "";

export interface User {
  id: string;
  email: string;
  name: string;
  credits: number;
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

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error ?? "發生未知錯誤") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }
  return data as T;
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
    list: () => apiFetch<{ packages: Package[] }>("/api/packages"),

    purchase: (quantity: number) =>
      apiFetch<{ message: string; credits: number; pricing: { subtotal: number; discount: number; total: number } }>(
        "/api/packages/purchase",
        { method: "POST", body: JSON.stringify({ quantity }) }
      ),

    pricing: () =>
      apiFetch<{ price_per_class: number; bulk_discount_min: number; bulk_discount_amount: number }>(
        "/api/packages/pricing"
      ),
  },
};
