import os
import json
import math
import hashlib
import secrets
import datetime
import random
import re
import smtplib
import threading
import urllib.parse
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

import requests as http_req
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import gspread
from google.oauth2.service_account import Credentials

app = Flask(__name__)
# 關閉「允許 NaN/Infinity」以符合嚴格 JSON（瀏覽器 fetch 無法解析 Infinity）
app.json.allow_nan = False  # type: ignore[attr-defined]
CORS(app, resources={r"/api/*": {"origins": "*"}})


@app.errorhandler(Exception)
def _handle_uncaught(err):
    """Friendly error messages for common upstream failures (e.g. Sheets quota)."""
    msg = str(err)
    if "429" in msg or "Quota exceeded" in msg or "RATE_LIMIT" in msg:
        return jsonify({
            "error": "系統忙碌中，請稍等幾秒再試一次。",
            "detail": "Google Sheets API rate limit reached.",
            "code": "RATE_LIMIT",
        }), 429
    return jsonify({"error": msg}), 500


def _safe(value):
    """將 float('inf')/nan/None 轉成可安全序列化的 JSON 值。"""
    if isinstance(value, float):
        if math.isinf(value) or math.isnan(value):
            return 0
        return value
    if isinstance(value, dict):
        return {k: _safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe(v) for v in value]
    return value

SCOPES = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive",
]


# ── Google Sheets helpers ──────────────────────────────────────────────────────

def _get_gc():
    # Prefer base64-encoded credentials (more reliable on Vercel)
    creds_b64 = os.environ.get("GOOGLE_CREDENTIALS_BASE64", "").strip()
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON", "").strip()

    if creds_b64:
        try:
            decoded = base64.b64decode(creds_b64).decode("utf-8")
            creds_dict = json.loads(decoded)
        except Exception as e:
            raise ValueError(f"GOOGLE_CREDENTIALS_BASE64 解碼失敗：{e}")
    elif creds_json:
        try:
            creds_dict = json.loads(creds_json)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"GOOGLE_CREDENTIALS_JSON 解析失敗（{e}）— 建議改用 GOOGLE_CREDENTIALS_BASE64"
            )
    else:
        raise ValueError("請設定 GOOGLE_CREDENTIALS_BASE64 或 GOOGLE_CREDENTIALS_JSON")

    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    return gspread.authorize(creds)


# Cache the Spreadsheet + Worksheet handles at module level. gspread fetches
# sheet metadata (another Sheets API read!) every time you call
# `.worksheet(name)` on a fresh Spreadsheet, so without this cache every
# admin action paid an extra read just to look up the worksheet handle.
_spreadsheet_handle = None
_worksheet_handles: dict = {}


def _get_spreadsheet():
    global _spreadsheet_handle
    if _spreadsheet_handle is not None:
        return _spreadsheet_handle
    gc = _get_gc()
    spreadsheet_id = os.environ.get("SPREADSHEET_ID", "")
    if not spreadsheet_id:
        raise ValueError("環境變數 SPREADSHEET_ID 未設定")
    _spreadsheet_handle = gc.open_by_key(spreadsheet_id)
    return _spreadsheet_handle


def _ws(sheet_name: str):
    ws = _worksheet_handles.get(sheet_name)
    if ws is not None:
        return ws
    ws = _get_spreadsheet().worksheet(sheet_name)
    _worksheet_handles[sheet_name] = ws
    return ws


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# ── Google Sheets read cache (short TTL to avoid API rate limits) ──────────────
# Google Sheets 免費配額：每位使用者每分鐘 60 次讀取。短時間的 burst 很容易爆。
# 用 3 秒的 TTL cache 來吸收重複讀取（例如同一個請求內讀多次 Users）。

import time as _time

# Cache entries: { sheet_name: (timestamp, data) }
# TTL is intentionally long because:
#  - Google Sheets free quota = 60 reads/min/user (shared across all app users!)
#  - Stale data is acceptable; writes invalidate the cache so real changes show up
#  - Vercel runs multiple warm instances whose caches are independent, so the
#    effective read rate can be (num_instances × sheets / TTL). We want this to
#    stay comfortably under 60/min even with 3-4 warm instances.
_sheet_cache: dict = {}
_SHEET_TTL = 45.0
# How long to keep serving stale data after a rate-limit hit before retrying.
_RATE_LIMIT_COOLDOWN = 30.0

# Per-sheet locks to prevent "thundering herd" — when N concurrent requests all
# find an expired cache entry, only one of them should call the Sheets API; the
# others wait on the lock and then use the freshly populated cache.
_sheet_locks: dict = {}
_locks_mutex = threading.Lock()


def _lock_for(sheet_name: str) -> threading.Lock:
    with _locks_mutex:
        lk = _sheet_locks.get(sheet_name)
        if lk is None:
            lk = threading.Lock()
            _sheet_locks[sheet_name] = lk
        return lk


def _cached_records(sheet_name: str):
    """Get all records from a worksheet with TTL cache.

    On quota-exceeded (429) errors we serve the previously cached data even if
    it is stale, so the UI keeps working instead of breaking on a hot quota.
    Concurrent cache misses are coalesced via a per-sheet lock so we never
    fire the same read multiple times in parallel.
    """
    now = _time.time()
    hit = _sheet_cache.get(sheet_name)
    if hit and now - hit[0] < _SHEET_TTL:
        return hit[1]

    lock = _lock_for(sheet_name)
    with lock:
        # Another thread may have refreshed the cache while we were waiting.
        now = _time.time()
        hit = _sheet_cache.get(sheet_name)
        if hit and now - hit[0] < _SHEET_TTL:
            return hit[1]
        try:
            if sheet_name == "Orders":
                ws = _ensure_orders_sheet()
            elif sheet_name == "Settings":
                ws = _ensure_settings_sheet()
            else:
                ws = _ws(sheet_name)
            if sheet_name == "Settings":
                # Keep values as literal strings (e.g. bank account with leading 0s).
                data = ws.get_all_records(numericise_ignore=["all"])
            else:
                data = ws.get_all_records()
            _sheet_cache[sheet_name] = (now, data)
            return data
        except Exception as e:
            # On rate-limit, fall back to last known data (even if expired).
            # Better to show slightly stale data than to fail the whole request.
            msg = str(e)
            is_rate_limited = (
                "429" in msg or "Quota exceeded" in msg or "RATE_LIMIT" in msg
            )
            if is_rate_limited and hit:
                # Pause further fetches for RATE_LIMIT_COOLDOWN seconds by
                # back-dating the timestamp so the cache stays "fresh" for that
                # long, even though the data is actually stale.
                fake_ts = now - _SHEET_TTL + _RATE_LIMIT_COOLDOWN
                _sheet_cache[sheet_name] = (fake_ts, hit[1])
                return hit[1]
            raise


def _invalidate_cache(*sheet_names: str):
    """Clear cache for specific sheets (call after a write). Pass none to clear all."""
    if not sheet_names:
        _sheet_cache.clear()
        return
    for n in sheet_names:
        _sheet_cache.pop(n, None)


# ── In-place cache mutations ──────────────────────────────────────────────────
# We prefer patching the cache instead of invalidating it so that subsequent
# reads don't have to refetch from Google Sheets. This matters a lot during
# bursts of admin writes where otherwise each write would force a fresh read on
# the NEXT request, quickly burning through the 60 reads/min quota.
#
# Tradeoff: other Vercel instances running this code have their own caches and
# won't see our patch until their TTL expires. That's acceptable for this app
# because writes are concentrated in one admin session.


def _patch_cache_row(sheet_name: str, match, patches: dict) -> None:
    """Apply `patches` to every cached row where `match(row) == True`.
    Silently no-ops if the sheet hasn't been cached yet."""
    hit = _sheet_cache.get(sheet_name)
    if not hit:
        return
    _ts, data = hit
    for i, row in enumerate(data):
        if match(row):
            merged = dict(row)
            merged.update(patches)
            data[i] = merged


def _append_cache_row(sheet_name: str, row: dict) -> None:
    """Append a row to the cache so the next read sees it without a refetch."""
    hit = _sheet_cache.get(sheet_name)
    if not hit:
        return
    _ts, data = hit
    data.append(row)


def _delete_cache_row(sheet_name: str, match) -> None:
    """Remove every cached row where `match(row) == True`."""
    hit = _sheet_cache.get(sheet_name)
    if not hit:
        return
    _ts, data = hit
    data[:] = [r for r in data if not match(r)]


def _ensure_worksheet_grid(ws, min_rows: int = 1, min_cols: int = 1) -> None:
    """Grow worksheet dimensions when a write would exceed the current grid.

    Legacy sheets (e.g. Users created with cols=10) throw APIError 400 when
    updating column K+; resize before writing.
    """
    if min_rows < 1:
        min_rows = 1
    if min_cols < 1:
        min_cols = 1
    cur_r = int(getattr(ws, "row_count", 0) or 0)
    cur_c = int(getattr(ws, "col_count", 0) or 0)
    need_r = max(cur_r, min_rows)
    need_c = max(cur_c, min_cols)
    if need_r > cur_r or need_c > cur_c:
        ws.resize(rows=need_r, cols=need_c)


def _batch_write_cells(ws, cell_updates) -> None:
    """Write multiple (row, col, value) updates in a SINGLE Sheets API call
    using batch_update. `cell_updates` is an iterable of (row, col, value).
    Using one batch call instead of N update_cell() calls saves N-1 write quota
    units; just as importantly it also avoids N sequential HTTP round-trips."""
    cell_updates = list(cell_updates)
    if cell_updates:
        max_row = max(u[0] for u in cell_updates)
        max_col = max(u[1] for u in cell_updates)
        _ensure_worksheet_grid(ws, min_rows=max_row, min_cols=max_col)
    body = []
    for row, col, val in cell_updates:
        body.append({
            "range": gspread.utils.rowcol_to_a1(row, col),
            "values": [[val]],
        })
    if body:
        ws.batch_update(body)


def _get_user_by_token(token: str):
    """Returns (user_dict, row_number) or (None, None)."""
    if not token:
        return None, None
    try:
        users = _cached_records("Users")
        for i, u in enumerate(users):
            if u.get("token") == token:
                return u, i + 2
    except Exception:
        pass
    return None, None


def _auth_required():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    user, row = _get_user_by_token(token)
    return user, row


def _is_admin(user: dict) -> bool:
    """檢查使用者是否為管理員（支援 email 或 user_id 白名單）。"""
    if not user:
        return False
    admin_emails = [
        e.strip().lower()
        for e in os.environ.get("ADMIN_EMAILS", "").split(",")
        if e.strip()
    ]
    admin_user_ids = [
        uid.strip().lower()
        for uid in os.environ.get("ADMIN_USER_IDS", "").split(",")
        if uid.strip()
    ]
    user_email = str(user.get("email", "") or "").strip().lower()
    user_id = str(user.get("user_id", "") or "").strip().lower()
    return user_email in admin_emails or user_id in admin_user_ids


def _admin_required():
    """Returns (user, row) if admin, otherwise returns (None, None)."""
    user, row = _auth_required()
    if not user or not _is_admin(user):
        return None, None
    return user, row


# ── Sheet schema helpers ───────────────────────────────────────────────────────

ORDERS_HEADERS = [
    "order_id", "user_id", "user_email", "user_name", "quantity",
    "subtotal", "discount", "total", "coupon_code", "status",
    "created_at", "paid_at", "notes",
]
# Column positions (1-based) for Orders sheet
ORDER_COL = {h: i + 1 for i, h in enumerate(ORDERS_HEADERS)}

SETTINGS_HEADERS = ["key", "value"]

DEFAULT_SETTINGS = {
    "bank_name": "",
    "bank_account": "",
    "bank_holder": "",
    "line_assistant_id": "@601gzrce",
    "payment_note": "請於下單後 3 日內完成匯款，並將匯款截圖傳送至 LINE 小助理",
}


def _ensure_sheet(name: str, headers: list):
    sh = _get_spreadsheet()
    try:
        ws = sh.worksheet(name)
    except gspread.exceptions.WorksheetNotFound:
        ws = sh.add_worksheet(name, rows=1000, cols=max(10, len(headers)))
        ws.append_row(headers)
    return ws


def _ensure_orders_sheet():
    return _ensure_sheet("Orders", ORDERS_HEADERS)


_settings_defaults_ensured = False


def _ensure_settings_sheet():
    ws = _ensure_sheet("Settings", SETTINGS_HEADERS)
    # Only seed default rows once per process lifetime.  Re-reading the whole
    # sheet on every cache miss wastes a Google Sheets read request, which is
    # our scarcest resource (60 reads/min quota).
    global _settings_defaults_ensured
    if not _settings_defaults_ensured:
        try:
            existing = {str(r.get("key", "")): True for r in ws.get_all_records()}
            missing = [[k, v] for k, v in DEFAULT_SETTINGS.items() if k not in existing]
            if missing:
                ws.append_rows(missing)
        except Exception:
            # If we hit a rate limit here, skip seeding – sheet is likely
            # already populated, and we don't want to block normal operation.
            pass
        _settings_defaults_ensured = True
    return ws


def _get_settings() -> dict:
    try:
        rows = _cached_records("Settings")
        return {str(r.get("key", "")): str(r.get("value", "") or "") for r in rows}
    except Exception:
        return {}


def _set_setting(key: str, value: str):
    ws = _ensure_settings_sheet()
    rows = _cached_records("Settings")
    for i, r in enumerate(rows):
        if str(r.get("key")) == key:
            ws.update(f"B{i + 2}", [[value]], raw=True)
            _invalidate_cache("Settings")
            return
    ws.append_row([key, value], value_input_option="RAW")
    _invalidate_cache("Settings")


# ── Credit expiry helpers ──────────────────────────────────────────────────────

def _last_day_of_month(date_obj=None) -> str:
    """Returns ISO date (YYYY-MM-DD) of the last day of the given (or current) month."""
    from calendar import monthrange
    d = date_obj or datetime.date.today()
    last = monthrange(d.year, d.month)[1]
    return datetime.date(d.year, d.month, last).isoformat()


def _add_months(date_obj: datetime.date, months: int) -> datetime.date:
    """Add calendar months while keeping day in valid range."""
    from calendar import monthrange

    month_index = (date_obj.month - 1) + months
    year = date_obj.year + month_index // 12
    month = (month_index % 12) + 1
    day = min(date_obj.day, monthrange(year, month)[1])
    return datetime.date(year, month, day)


def _default_expiry_for_quantity(quantity: int) -> str:
    """Default credit expiry policy:
    - 1-8 classes: end of current month
    - >8 classes: two months from today
    """
    today = datetime.date.today()
    if quantity > 8:
        return _add_months(today, 2).isoformat()
    return _last_day_of_month(today)


def _credits_expired(user: dict) -> bool:
    """仍有「已過期但尚未清掉的批次餘額」（無任何可用堂數時用於提示重新購買）。"""
    return _has_expired_inventory_with_balance(user)


def _active_credits(user: dict) -> int:
    try:
        return _active_credits_from_lots(_load_credit_lots(user))
    except (ValueError, TypeError):
        return 0


def _has_confirmed_booking(bookings: list[dict], user_id: str, class_id: str) -> bool:
    """True when the user already has a confirmed booking for the class."""
    uid = str(user_id)
    cid = str(class_id)
    for b in bookings:
        if str(b.get("user_id")) != uid:
            continue
        if str(b.get("class_id")) != cid:
            continue
        if str(b.get("status", "")).lower() == "confirmed":
            return True
    return False


def _class_date_exceeds_credit_expiry(user: dict, class_date_str: str) -> bool:
    """True when no credit lot can cover this class date (legacy + multi-batch)."""
    try:
        class_date = datetime.date.fromisoformat(str(class_date_str))
    except ValueError:
        return False
    return _usable_credits_for_class_date(_load_credit_lots(user), class_date) < 1


def _users_credit_lots_col() -> int:
    return _users_col_index("credit_lots")


def _normalize_credit_lot(lot: dict) -> dict:
    return {
        "order_id": str(lot.get("order_id", "") or ""),
        "remaining": max(0, int(lot.get("remaining", 0) or 0)),
        "expire_at": str(lot.get("expire_at", "") or "").strip(),
    }


def _prune_credit_lots(lots: list[dict]) -> list[dict]:
    return [x for x in (_normalize_credit_lot(l) for l in lots) if x["remaining"] > 0]


def _parse_stored_credit_lots(raw: str) -> list[dict]:
    if not str(raw or "").strip():
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return _prune_credit_lots([_normalize_credit_lot(x) for x in data if isinstance(x, dict)])


def _load_credit_lots(user: dict) -> list[dict]:
    """All credit batches: JSON column if present, else legacy credits + credits_expire_at."""
    from_sheet = _parse_stored_credit_lots(str(user.get("credit_lots", "") or ""))
    if from_sheet:
        return from_sheet
    c = int(user.get("credits", 0) or 0)
    exp = str(user.get("credits_expire_at", "") or "").strip()
    if c > 0:
        return [{"order_id": "", "remaining": c, "expire_at": exp}]
    return []


def _active_credits_from_lots(lots: list[dict], today: datetime.date | None = None) -> int:
    today = today or datetime.date.today()
    total = 0
    for lot in lots:
        rem = int(lot.get("remaining", 0) or 0)
        if rem <= 0:
            continue
        exp_s = str(lot.get("expire_at", "") or "").strip()
        if exp_s:
            try:
                if datetime.date.fromisoformat(exp_s) < today:
                    continue
            except ValueError:
                pass
        total += rem
    return total


def _usable_credits_for_class_date(lots: list[dict], class_date: datetime.date, today: datetime.date | None = None) -> int:
    """How many credits can book a class on `class_date` (each lot must cover that date)."""
    today = today or datetime.date.today()
    total = 0
    for lot in lots:
        rem = int(lot.get("remaining", 0) or 0)
        if rem <= 0:
            continue
        exp_s = str(lot.get("expire_at", "") or "").strip()
        if exp_s:
            try:
                exp_d = datetime.date.fromisoformat(exp_s)
            except ValueError:
                exp_d = None
            if exp_d is not None:
                if exp_d < today:
                    continue
                if class_date > exp_d:
                    continue
        total += rem
    return total


def _soonest_expiry_sort_key(exp_d: datetime.date | None) -> tuple:
    """None / open-ended sorts last (use last)."""
    if exp_d is None:
        return (1, datetime.date.max)
    return (0, exp_d)


def _consume_one_credit_for_class(
    lots: list[dict], class_date: datetime.date, today: datetime.date | None = None
) -> tuple[list[dict] | None, str | None]:
    """FIFO by soonest lot expiry among lots that cover class_date. Returns (new_lots, source_order_id)."""
    today = today or datetime.date.today()
    candidates: list[tuple[int, tuple, str]] = []
    for i, lot in enumerate(lots):
        lot = _normalize_credit_lot(lot)
        rem = lot["remaining"]
        if rem <= 0:
            continue
        exp_s = lot["expire_at"]
        exp_d: datetime.date | None
        if exp_s:
            try:
                exp_d = datetime.date.fromisoformat(exp_s)
            except ValueError:
                exp_d = None
        else:
            exp_d = None
        if exp_d is not None:
            if exp_d < today:
                continue
            if class_date > exp_d:
                continue
        key = _soonest_expiry_sort_key(exp_d)
        candidates.append((i, key, lot["order_id"]))
    if not candidates:
        return None, None
    candidates.sort(key=lambda x: (x[1], x[0]))
    pick_idx = candidates[0][0]
    new_lots = [_normalize_credit_lot(dict(l)) for l in lots]
    src_oid = str(new_lots[pick_idx].get("order_id", "") or "")
    new_lots[pick_idx] = dict(new_lots[pick_idx])
    new_lots[pick_idx]["remaining"] = int(new_lots[pick_idx]["remaining"]) - 1
    return _prune_credit_lots(new_lots), src_oid


def _refund_credit_to_lot(lots: list[dict], source_order_id: str) -> list[dict]:
    """Return credit to the batch it was taken from (or legacy fallback)."""
    oid = str(source_order_id or "").strip()
    new_lots = [_normalize_credit_lot(dict(l)) for l in lots]
    if oid:
        for l in new_lots:
            if str(l.get("order_id", "") or "") == oid:
                l["remaining"] = int(l.get("remaining", 0) or 0) + 1
                return new_lots
    for l in new_lots:
        if str(l.get("order_id", "") or "") == "":
            l["remaining"] = int(l.get("remaining", 0) or 0) + 1
            return new_lots
    new_lots.append({"order_id": "", "remaining": 1, "expire_at": ""})
    return new_lots


def _credit_lots_summary_expiry(lots: list[dict], today: datetime.date | None = None) -> str:
    """Earliest expiry among currently usable credits (for single-date UI hint)."""
    today = today or datetime.date.today()
    dates: list[datetime.date] = []
    for lot in lots:
        rem = int(lot.get("remaining", 0) or 0)
        if rem <= 0:
            continue
        exp_s = str(lot.get("expire_at", "") or "").strip()
        if not exp_s:
            continue
        try:
            exp_d = datetime.date.fromisoformat(exp_s)
        except ValueError:
            continue
        if exp_d >= today:
            dates.append(exp_d)
    return min(dates).isoformat() if dates else ""


def _persist_user_credit_state(users_ws, user_row: int, lots: list[dict], user_id: str) -> None:
    """Write credit_lots JSON + denormalized credits + summary credits_expire_at."""
    lots = _prune_credit_lots(lots)
    today = datetime.date.today()
    active_total = _active_credits_from_lots(lots, today)
    summary_exp = _credit_lots_summary_expiry(lots, today)
    payload = json.dumps(
        [{"order_id": l["order_id"], "remaining": l["remaining"], "expire_at": l["expire_at"]} for l in lots],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    expire_col = _users_expire_col()
    lots_col = _users_credit_lots_col()
    _batch_write_cells(users_ws, [
        (user_row, 5, active_total),
        (user_row, expire_col, summary_exp),
        (user_row, lots_col, payload),
    ])
    _patch_cache_row(
        "Users",
        lambda u, uid=str(user_id): str(u.get("user_id")) == uid,
        {"credits": active_total, "credits_expire_at": summary_exp, "credit_lots": payload},
    )


def _has_expired_inventory_with_balance(user: dict) -> bool:
    """True when lots hold remaining credits but every remaining lot is past expiry."""
    lots = _load_credit_lots(user)
    today = datetime.date.today()
    buried = 0
    for lot in lots:
        rem = int(lot.get("remaining", 0) or 0)
        if rem <= 0:
            continue
        exp_s = str(lot.get("expire_at", "") or "").strip()
        if not exp_s:
            return False
        try:
            exp_d = datetime.date.fromisoformat(exp_s)
        except ValueError:
            return False
        if exp_d >= today:
            return False
        buried += rem
    return buried > 0


def _users_col_index(header_name: str) -> int:
    """Returns 1-based column index of a header in the Users sheet, auto-adding it if missing."""
    ws = _ws("Users")
    headers = ws.row_values(1)
    if header_name in headers:
        return headers.index(header_name) + 1
    col = len(headers) + 1
    _ensure_worksheet_grid(ws, min_rows=1, min_cols=col)
    ws.update_cell(1, col, header_name)
    return col


def _users_expire_col() -> int:
    """Backwards-compat helper (kept for call sites)."""
    return _users_col_index("credits_expire_at")


def _bookings_header_list(ws) -> list[str]:
    headers = [str(h).strip() for h in ws.row_values(1) if str(h).strip()]
    if "credit_source_order_id" not in headers:
        new_col = len(headers) + 1
        _ensure_worksheet_grid(ws, min_rows=1, min_cols=new_col)
        ws.update_cell(1, new_col, "credit_source_order_id")
        headers = [str(h).strip() for h in ws.row_values(1) if str(h).strip()]
    return headers


def _booking_append_row(ws, values: dict) -> None:
    headers = _bookings_header_list(ws)
    ws.append_row([values.get(h, "") for h in headers])


def _user_response(u: dict) -> dict:
    """Consistent user payload for API responses."""
    email = str(u.get("email", "") or "")
    is_placeholder_email = email.endswith("@line.placeholder") or email.endswith("@google.placeholder")
    lots = _load_credit_lots(u)
    today = datetime.date.today()
    credits = _active_credits_from_lots(lots, today)
    summary_exp = _credit_lots_summary_expiry(lots, today)
    active_lots: list[dict] = []
    for lot in lots:
        rem = int(lot.get("remaining", 0) or 0)
        if rem <= 0:
            continue
        exp_s = str(lot.get("expire_at", "") or "").strip()
        if exp_s:
            try:
                if datetime.date.fromisoformat(exp_s) < today:
                    continue
            except ValueError:
                pass
        active_lots.append({
            "order_id": str(lot.get("order_id", "") or ""),
            "remaining": rem,
            "expire_at": exp_s,
        })
    return {
        "id": str(u.get("user_id", "")),
        "email": email,
        "name": u.get("name", ""),
        "credits": credits,
        "credits_expire_at": summary_exp if credits > 0 else "",
        "credit_lots": active_lots,
        "has_password": bool(u.get("password_hash", "")),
        "has_real_email": bool(email) and not is_placeholder_email,
        "line_linked": bool(str(u.get("line_user_id", "") or "")),
        "notify_email": _bool_cell(u.get("notify_email"), default=True),
        "notify_line": _bool_cell(u.get("notify_line"), default=False),
    }


# ── Notifications (Gmail SMTP + LINE Messaging API) ────────────────────────────
# 寄信與推播皆為「盡力而為 + 非同步」：失敗不會讓 API 請求失敗，且不會拖慢回應時間。

def _bool_cell(value, default: bool = False) -> bool:
    """Parse a sheet cell into a boolean. Treat empty / missing as *default*."""
    if value is None:
        return default
    s = str(value).strip().upper()
    if not s:
        return default
    return s in ("TRUE", "1", "YES", "Y")


def _notifications_config() -> dict:
    """Returns which channels are available based on env vars."""
    return {
        "email": bool(os.environ.get("GMAIL_USER") and os.environ.get("GMAIL_APP_PASSWORD")),
        "line": bool(os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")),
    }


def _html_to_text(html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", html, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _email_wrap(title: str, body_html: str) -> str:
    """Minimal styled HTML wrapper so messages look decent in Gmail/Outlook."""
    return f"""<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f5f2;padding:32px 16px;color:#1a1a1a;">
<table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
  <tr><td style="background:linear-gradient(135deg,#6750a4,#8a7cb8);padding:28px 32px;color:#fff;">
    <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.85;">JosieUBOUND</div>
    <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;">{title}</h1>
  </td></tr>
  <tr><td style="padding:32px;font-size:15px;line-height:1.7;color:#333;">{body_html}</td></tr>
  <tr><td style="padding:20px 32px;background:#f7f5f2;color:#888;font-size:12px;text-align:center;">
    此為系統自動通知郵件，請勿直接回覆。<br>如需協助，請聯絡小助理。
  </td></tr>
</table></body></html>"""


def _send_email_sync(to: str, subject: str, html: str, text: str = "") -> tuple[bool, str]:
    user = os.environ.get("GMAIL_USER", "").strip()
    pw = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "")
    from_name = os.environ.get("GMAIL_FROM_NAME", "JosieUBOUND")
    if not user or not pw:
        return False, "GMAIL_USER / GMAIL_APP_PASSWORD 未設定"
    if not to or "@" not in to:
        return False, "無效收件地址"
    if to.endswith("@line.placeholder") or to.endswith("@google.placeholder"):
        return False, "佔位信箱無法寄送（使用者未提供真實 email）"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = formataddr((from_name, user))
    msg["To"] = to
    msg.attach(MIMEText(text or _html_to_text(html), "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(user, pw)
            server.sendmail(user, [to], msg.as_string())
        return True, "sent"
    except Exception as e:
        print(f"[email] send failed to {to}: {e}")
        return False, str(e)


def _send_line_push_sync(line_user_id: str, text: str) -> tuple[bool, str]:
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "").strip()
    if not token:
        return False, "LINE_CHANNEL_ACCESS_TOKEN 未設定"
    if not line_user_id:
        return False, "未綁定 LINE"
    try:
        res = http_req.post(
            "https://api.line.me/v2/bot/message/push",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            json={"to": line_user_id, "messages": [{"type": "text", "text": text[:4900]}]},
            timeout=15,
        )
        if res.status_code == 200:
            return True, "sent"
        return False, f"LINE API {res.status_code}: {res.text[:200]}"
    except Exception as e:
        print(f"[line] push failed to {line_user_id}: {e}")
        return False, str(e)


def _send_email(to: str, subject: str, html: str, text: str = ""):
    """Fire-and-forget email send."""
    threading.Thread(
        target=_send_email_sync, args=(to, subject, html, text), daemon=True
    ).start()


def _send_line_push(line_user_id: str, text: str):
    """Fire-and-forget LINE push."""
    threading.Thread(
        target=_send_line_push_sync, args=(line_user_id, text), daemon=True
    ).start()


def _welcome_email_html(name: str, free_credits: int = 0) -> str:
    gift = (
        f"<p>我們送您 <strong>{free_credits} 堂免費體驗課程</strong>，登入後即可使用！</p>"
        if free_credits > 0
        else ""
    )
    return (
        f"<p>嗨 {name}，歡迎加入 JosieUBOUND！</p>"
        + gift
        + "<p>接下來您可以到官網「預約課程」挑選喜歡的時段。"
        "預約、訂單與堂數相關通知，我們都會透過此信箱（或 LINE）與您聯繫。</p>"
        "<p>律動愉快 🎵</p>"
    )


def _booking_email_html(class_name: str, class_dt: str, credits_remaining: int) -> str:
    return (
        f"<p>您已成功預約：<strong>{class_name}</strong></p>"
        f"<p>上課時間：<strong>{class_dt}</strong></p>"
        f"<p>目前剩餘堂數：<strong>{credits_remaining} 堂</strong></p>"
        "<p style=\"color:#c45b3c;font-size:13px;\">"
        "⏰ 取消政策：請於課程開始前 <strong>6 小時</strong>自行取消並退回堂數，"
        "逾時將無法自助取消。</p>"
    )


def _booking_cancel_email_html(class_name: str, class_dt: str, credits_remaining: int) -> str:
    return (
        f"<p>您已取消預約：<strong>{class_name}</strong></p>"
        f"<p>原上課時間：{class_dt}</p>"
        f"<p>堂數已退還，目前剩餘 <strong>{credits_remaining} 堂</strong>。</p>"
    )


def _order_created_email_html(order_id: str, quantity: int, total: int, payment: dict) -> str:
    bank = payment.get("bank_name", "")
    account = payment.get("bank_account", "")
    holder = payment.get("bank_holder", "")
    line_id = payment.get("line_assistant_id", "")
    return (
        f"<p>您的訂單已建立！</p>"
        f"<p>訂單編號：<code style='background:#f0f0f0;padding:2px 6px;border-radius:4px;'>{order_id}</code></p>"
        f"<p>購買堂數：<strong>{quantity} 堂</strong><br>"
        f"應付金額：<strong style='color:#6750a4;font-size:18px;'>NT${total:,}</strong></p>"
        "<hr style='border:none;border-top:1px solid #e5e5e5;margin:20px 0;'>"
        "<p><strong>💳 請依下列資訊匯款，並將截圖傳給小助理：</strong></p>"
        f"<p>銀行：{bank}<br>帳號：<code>{account}</code><br>戶名：{holder}<br>LINE 小助理：<strong>{line_id}</strong></p>"
        "<p style='color:#888;font-size:13px;'>管理員確認入帳後，堂數會自動加入您的帳戶，我們會再寄信通知。</p>"
    )


def _order_confirmed_email_html(quantity: int, total: int, expire_at: str, total_credits: int) -> str:
    return (
        f"<p>🎉 付款已確認！</p>"
        f"<p>本次購買的 <strong>{quantity} 堂</strong>（NT${total:,}）已加入您的帳戶。</p>"
        f"<p>目前總堂數：<strong style='color:#6750a4;font-size:18px;'>{total_credits} 堂</strong><br>"
        f"堂數有效期至：<strong>{expire_at}</strong></p>"
        "<p>立即到官網「預約課程」開始您的律動旅程！</p>"
    )


def _order_cancelled_email_html(order_id: str, reason: str) -> str:
    extra = f"<p>原因：{reason}</p>" if reason else ""
    return (
        f"<p>您的訂單 <code>{order_id}</code> 已被取消。</p>"
        + extra
        + "<p>如有疑問，請聯絡小助理。</p>"
    )


def _notify(
    user: dict,
    subject: str,
    body_html: str,
    line_text: str = "",
    plain_text: str = "",
    sync_line: bool = False,
):
    """Send both channels according to user prefs. Silently ignores disabled / unavailable channels."""
    if not user:
        return

    email = str(user.get("email", "") or "")
    want_email = _bool_cell(user.get("notify_email"), default=True)
    if want_email and email and "@" in email and not email.endswith((".placeholder",)) and not email.endswith("@line.placeholder") and not email.endswith("@google.placeholder"):
        _send_email(email, subject, _email_wrap(subject, body_html), plain_text)

    line_uid = str(user.get("line_user_id", "") or "").strip()
    # If the preference cell is missing/empty but user already linked LINE,
    # default to sending so critical notices are not silently dropped.
    want_line = _bool_cell(user.get("notify_line"), default=bool(line_uid))
    if want_line and line_uid:
        payload = line_text or plain_text or _html_to_text(body_html)
        if sync_line:
            _send_line_push_sync(line_uid, payload)
        else:
            _send_line_push(line_uid, payload)


# ── Auth ───────────────────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    name = data.get("name", email.split("@")[0])

    if not email or not password:
        return jsonify({"error": "請輸入電子郵件和密碼"}), 400

    try:
        ws = _ws("Users")
        users = _cached_records("Users")
        for u in users:
            if str(u.get("email", "")).lower() == email:
                return jsonify({"error": "此電子郵件已被使用"}), 409

        user_id = secrets.token_hex(8)
        token = secrets.token_hex(32)
        now = datetime.datetime.now().isoformat()
        ws.append_row([user_id, email, _hash(password), name, 0, now, token])
        _invalidate_cache("Users")

        _notify(
            {"email": email, "name": name, "notify_email": "TRUE"},
            "歡迎加入 JosieUBOUND！",
            _welcome_email_html(name, 0),
        )

        return jsonify({
            "user": {
                "id": user_id, "email": email, "name": name,
                "credits": 0, "credits_expire_at": "",
            },
            "token": token,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "請輸入電子郵件和密碼"}), 400

    try:
        ws = _ws("Users")
        users = _cached_records("Users")
        pw_hash = _hash(password)
        for i, u in enumerate(users):
            if str(u.get("email", "")).lower() == email and u.get("password_hash") == pw_hash:
                token = secrets.token_hex(32)
                ws.update_cell(i + 2, 7, token)
                u["token"] = token
                _invalidate_cache("Users")
                return jsonify({"user": _user_response(u), "token": token})
        return jsonify({"error": "電子郵件或密碼錯誤"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/user/me", methods=["GET"])
def get_me():
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401
    return jsonify({"user": _user_response(user)})


@app.route("/api/user/notifications", methods=["GET"])
def get_notifications():
    """Return the user's current notification preferences and channel status."""
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401
    cfg = _notifications_config()
    email = str(user.get("email", "") or "")
    is_placeholder = email.endswith("@line.placeholder") or email.endswith("@google.placeholder")
    return jsonify({
        "notify_email": _bool_cell(user.get("notify_email"), default=True),
        "notify_line": _bool_cell(user.get("notify_line"), default=False),
        "line_linked": bool(str(user.get("line_user_id", "") or "")),
        "has_real_email": bool(email) and not is_placeholder,
        "server_channels": cfg,
    })


@app.route("/api/user/notifications", methods=["PATCH"])
def update_notifications():
    """Enable/disable Email or LINE notifications for the logged-in user."""
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    data = request.get_json() or {}
    ws = _ws("Users")

    try:
        if "notify_email" in data:
            col = _users_col_index("notify_email")
            ws.update_cell(user_row, col, "TRUE" if bool(data["notify_email"]) else "FALSE")
            user["notify_email"] = "TRUE" if bool(data["notify_email"]) else "FALSE"

        if "notify_line" in data:
            if bool(data["notify_line"]) and not str(user.get("line_user_id", "") or ""):
                return jsonify({"error": "請先用 LINE 登入綁定帳號，才能啟用 LINE 通知"}), 400
            col = _users_col_index("notify_line")
            ws.update_cell(user_row, col, "TRUE" if bool(data["notify_line"]) else "FALSE")
            user["notify_line"] = "TRUE" if bool(data["notify_line"]) else "FALSE"

        _invalidate_cache("Users")
        return jsonify({
            "message": "通知設定已更新",
            "notify_email": _bool_cell(user.get("notify_email"), default=True),
            "notify_line": _bool_cell(user.get("notify_line"), default=False),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/user/me", methods=["PATCH"])
def update_me():
    """Let the logged-in user change their display name and/or password."""
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    data = request.get_json() or {}
    new_name = data.get("name")
    new_password = data.get("new_password")
    current_password = data.get("current_password")

    if new_name is None and not new_password:
        return jsonify({"error": "沒有要更新的欄位"}), 400

    if new_name is not None:
        new_name = str(new_name).strip()
        if not new_name:
            return jsonify({"error": "姓名不能為空"}), 400
        if len(new_name) > 40:
            return jsonify({"error": "姓名過長"}), 400

    if new_password:
        if len(new_password) < 6:
            return jsonify({"error": "新密碼至少 6 個字元"}), 400
        # If the user already has a password, require the current one for verification
        existing_hash = str(user.get("password_hash", "") or "")
        if existing_hash:
            if not current_password or _hash(str(current_password)) != existing_hash:
                return jsonify({"error": "目前密碼不正確"}), 401

    try:
        ws = _ws("Users")
        if new_name is not None:
            ws.update_cell(user_row, 4, new_name)
            user["name"] = new_name
        if new_password:
            new_hash = _hash(str(new_password))
            ws.update_cell(user_row, 3, new_hash)
            user["password_hash"] = new_hash

        _invalidate_cache("Users")
        return jsonify({"user": _user_response(user), "message": "個人資料已更新"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Classes ────────────────────────────────────────────────────────────────────

@app.route("/api/classes", methods=["GET"])
def get_classes():
    try:
        classes = _cached_records("Classes")
        return jsonify({"classes": _safe(classes)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Bookings ───────────────────────────────────────────────────────────────────

@app.route("/api/bookings", methods=["POST"])
def create_booking():
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    data = request.get_json() or {}
    class_id = str(data.get("class_id", ""))

    try:
        classes_ws = _ws("Classes")
        classes = _cached_records("Classes")

        target = None
        class_row = None
        for i, c in enumerate(classes):
            if str(c["class_id"]) == class_id:
                target = c
                class_row = i + 2
                break

        if not target:
            return jsonify({"error": "找不到此課程"}), 404

        if int(target["booked_spots"]) >= int(target["total_spots"]):
            return jsonify({"error": "此課程已額滿"}), 400

        if _credits_expired(user) and _active_credits(user) < 1:
            return jsonify({"error": "您的堂數已過期，請重新購買", "code": "EXPIRED"}), 400

        if _active_credits(user) < 1:
            return jsonify({"error": "堂數不足，請先購買套票", "code": "NO_CREDITS"}), 400

        if _class_date_exceeds_credit_expiry(user, str(target.get("date", ""))):
            return jsonify({"error": "此課程日期已超過您目前可用批次的有效期限，請先購買可涵蓋該日的堂數", "code": "EXPIRE_BEFORE_CLASS"}), 400

        bookings_ws = _ws("Bookings")
        bookings = _cached_records("Bookings")
        if _has_confirmed_booking(bookings, str(user["user_id"]), class_id):
            return jsonify({"error": "同一堂課每位會員限預約一次", "code": "DUPLICATE_BOOKING"}), 400

        # Create booking record
        booking_id = secrets.token_hex(8)
        now = datetime.datetime.now().isoformat()
        class_datetime = f"{target['date']} {target['time']}"

        lots = _load_credit_lots(user)
        today = datetime.date.today()
        class_date = datetime.date.fromisoformat(str(target.get("date", "")))
        new_lots, src_oid = _consume_one_credit_for_class(lots, class_date, today)
        if new_lots is None:
            return jsonify({"error": "扣堂失敗，請稍後再試", "code": "CREDIT_DEDUCT"}), 400

        _booking_append_row(bookings_ws, {
            "booking_id": booking_id,
            "user_id": str(user["user_id"]),
            "class_id": class_id,
            "class_name": target["name"],
            "class_datetime": class_datetime,
            "status": "confirmed",
            "created_at": now,
            "credit_source_order_id": src_oid or "",
        })

        classes_ws.update_cell(class_row, 8, int(target["booked_spots"]) + 1)

        users_ws = _ws("Users")
        _persist_user_credit_state(users_ws, user_row, new_lots, str(user["user_id"]))
        new_credits = _active_credits_from_lots(new_lots, today)
        _invalidate_cache("Users", "Classes", "Bookings")

        _notify(
            user,
            f"預約成功｜{target['name']}",
            _booking_email_html(target["name"], class_datetime, new_credits),
            line_text=(
                f"✅ 預約成功\n課程：{target['name']}\n時間：{class_datetime}\n"
                f"剩餘堂數：{new_credits} 堂\n提醒：開始前 6 小時內無法取消。"
            ),
            sync_line=True,
        )

        return jsonify({
            "booking": {
                "id": booking_id,
                "class_name": target["name"],
                "class_datetime": class_datetime,
                "date": target["date"],
                "time": target["time"],
                "duration": target["duration"],
                "status": "confirmed",
            },
            "credits_remaining": new_credits,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/bookings/user", methods=["GET"])
def get_user_bookings():
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    try:
        all_bookings = _cached_records("Bookings")
        user_bookings = [
            b for b in all_bookings
            if str(b.get("user_id")) == str(user["user_id"]) and b.get("status") == "confirmed"
        ]
        return jsonify({"bookings": _safe(user_bookings)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/bookings/<booking_id>", methods=["DELETE"])
def cancel_booking(booking_id):
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    try:
        bookings_ws = _ws("Bookings")
        bookings = _cached_records("Bookings")

        for i, b in enumerate(bookings):
            if str(b.get("booking_id")) == str(booking_id) and str(b.get("user_id")) == str(user["user_id"]):
                if b.get("status") == "cancelled":
                    return jsonify({"error": "此預約已取消"}), 400

                # 6-hour cancellation rule
                class_dt = None
                dt_str = str(b.get("class_datetime", ""))
                for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S"):
                    try:
                        class_dt = datetime.datetime.strptime(dt_str, fmt)
                        break
                    except ValueError:
                        continue
                if class_dt and class_dt - datetime.datetime.now() < datetime.timedelta(hours=6):
                    return jsonify({"error": "課程開始前 6 小時內無法取消"}), 400

                row_num = i + 2
                bookings_ws.update_cell(row_num, 6, "cancelled")

                # Restore spot in class
                classes_ws = _ws("Classes")
                classes = _cached_records("Classes")
                for j, c in enumerate(classes):
                    if str(c["class_id"]) == str(b.get("class_id")):
                        new_spots = max(0, int(c["booked_spots"]) - 1)
                        classes_ws.update_cell(j + 2, 8, new_spots)
                        break

                src_oid = str(b.get("credit_source_order_id", "") or "").strip()
                lots = _load_credit_lots(user)
                new_lots = _refund_credit_to_lot(lots, src_oid)
                users_ws = _ws("Users")
                _persist_user_credit_state(users_ws, user_row, new_lots, str(user["user_id"]))
                new_credits = _active_credits_from_lots(new_lots, datetime.date.today())
                _invalidate_cache("Users", "Classes", "Bookings")

                _notify(
                    user,
                    f"已取消預約｜{b.get('class_name', '課程')}",
                    _booking_cancel_email_html(
                        str(b.get("class_name", "課程")), dt_str, new_credits
                    ),
                    line_text=(
                        f"❎ 預約已取消\n課程：{b.get('class_name', '課程')}\n原時間：{dt_str}\n"
                        f"堂數已退還，目前剩餘 {new_credits} 堂。"
                    ),
                )

                return jsonify({"message": "課程已取消，堂數已退還", "credits": new_credits})

        return jsonify({"error": "找不到此預約"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Packages ───────────────────────────────────────────────────────────────────
# 定價規則：每堂 NT$150；單筆購買 4 堂（含）以上總價減 NT$20（4 堂檔折扣，每帳號每月限一次，依訂單建立日曆月）

PRICE_PER_CLASS = 150
BULK_DISCOUNT_MIN = 4
BULK_DISCOUNT_AMOUNT = 20


def calc_price(quantity: int) -> dict:
    """計算購買堂數的費用明細。"""
    subtotal = quantity * PRICE_PER_CLASS
    discount = BULK_DISCOUNT_AMOUNT if quantity >= BULK_DISCOUNT_MIN else 0
    total = subtotal - discount
    return {"subtotal": subtotal, "discount": discount, "total": total}


def _order_created_year_month(value) -> tuple[int, int] | None:
    """Parse created_at into (year, month); None if missing or unparseable."""
    raw = str(value or "").strip()
    if not raw:
        return None
    if len(raw) >= 7 and raw[4] == "-":
        try:
            y = int(raw[0:4])
            mo = int(raw[5:7])
            if 1900 <= y <= 2100 and 1 <= mo <= 12:
                return (y, mo)
        except ValueError:
            pass
    try:
        dt = datetime.datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
        return (dt.year, dt.month)
    except ValueError:
        return None


def _has_used_bulk_discount_this_month(user_id: str) -> bool:
    """本月是否已使用過「滿 4 堂折 NT$20」（每帳號每月限一次，依伺服器日曆月）。"""
    now = datetime.datetime.now()
    current = (now.year, now.month)
    orders = _cached_records("Orders")
    for order in orders:
        if str(order.get("user_id")) != str(user_id):
            continue
        if str(order.get("status", "")).lower() == "cancelled":
            continue
        try:
            quantity = int(order.get("quantity", 0) or 0)
        except (TypeError, ValueError):
            quantity = 0
        if quantity < BULK_DISCOUNT_MIN:
            continue
        ym = _order_created_year_month(order.get("created_at"))
        if ym == current:
            return True
    return False


@app.route("/api/packages/pricing", methods=["GET"])
def get_pricing():
    """回傳定價規則，供前端即時計算。"""
    return jsonify({
        "price_per_class": PRICE_PER_CLASS,
        "bulk_discount_min": BULK_DISCOUNT_MIN,
        "bulk_discount_amount": BULK_DISCOUNT_AMOUNT,
    })


@app.route("/api/packages/purchase", methods=["POST"])
def purchase_package():
    """[已棄用] 保留做為相容層，轉導至建立訂單。"""
    return create_order()


# ── Public settings ────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def public_settings():
    """Return payment-related settings (public, non-sensitive)."""
    s = _get_settings()
    return jsonify({
        "bank_name": s.get("bank_name", ""),
        "bank_account": s.get("bank_account", ""),
        "bank_holder": s.get("bank_holder", ""),
        "line_assistant_id": s.get("line_assistant_id", ""),
        "payment_note": s.get("payment_note", ""),
    })


# ── Orders ─────────────────────────────────────────────────────────────────────

@app.route("/api/orders", methods=["POST"])
def create_order():
    """建立一筆 pending 訂單，回傳訂單資訊 + 匯款資訊。"""
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    data = request.get_json() or {}
    try:
        quantity = int(data.get("quantity", 1))
    except (ValueError, TypeError):
        return jsonify({"error": "堂數格式錯誤"}), 400
    if quantity < 1 or quantity > 50:
        return jsonify({"error": "購買堂數需在 1–50 之間"}), 400

    coupon_code = str(data.get("coupon_code", "") or "").strip().upper()

    pricing = calc_price(quantity)
    # Phase 1: 先簡易支援固定折扣碼（新同學折扣 NT$20）
    # Phase 2 會改為從 Coupons sheet 讀取
    coupon_discount = 0
    if coupon_code == "FIRST20":
        coupon_discount = 20
    elif coupon_code:
        return jsonify({"error": "折扣碼無效", "code": "INVALID_COUPON"}), 400

    subtotal = pricing["subtotal"]
    bulk_discount = pricing["discount"]
    if bulk_discount > 0 and _has_used_bulk_discount_this_month(str(user["user_id"])):
        bulk_discount = 0
    total_discount = bulk_discount + coupon_discount
    total = max(0, subtotal - total_discount)

    try:
        ws = _ensure_orders_sheet()
        order_id = secrets.token_hex(8)
        now = datetime.datetime.now().isoformat()
        ws.append_row([
            order_id,
            str(user["user_id"]),
            user.get("email", ""),
            user.get("name", ""),
            quantity,
            subtotal,
            total_discount,
            total,
            coupon_code,
            "pending",
            now,
            "",
            "",
        ])
        _invalidate_cache("Orders")
        settings = _get_settings()
        payment_info = {
            "bank_name": settings.get("bank_name", ""),
            "bank_account": settings.get("bank_account", ""),
            "bank_holder": settings.get("bank_holder", ""),
            "line_assistant_id": settings.get("line_assistant_id", ""),
            "payment_note": settings.get("payment_note", ""),
        }

        _notify(
            user,
            f"訂單已建立｜{quantity} 堂 NT${total:,}",
            _order_created_email_html(order_id, quantity, total, payment_info),
            line_text=(
                f"📋 訂單已建立\n編號：{order_id}\n堂數：{quantity} 堂\n應付：NT${total:,}\n\n"
                f"請匯款至：\n{payment_info['bank_name']} {payment_info['bank_account']}\n"
                f"戶名：{payment_info['bank_holder']}\n\n"
                f"匯款後請將截圖傳給小助理 {payment_info['line_assistant_id']}"
            ),
            sync_line=True,
        )

        return jsonify({
            "order": {
                "order_id": order_id,
                "quantity": quantity,
                "subtotal": subtotal,
                "discount": total_discount,
                "total": total,
                "coupon_code": coupon_code,
                "status": "pending",
                "created_at": now,
            },
            "payment_info": payment_info,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/orders/mine", methods=["GET"])
def my_orders():
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401
    try:
        orders = _cached_records("Orders")
        mine = [o for o in orders if str(o.get("user_id")) == str(user["user_id"])]
        mine.sort(key=lambda o: str(o.get("created_at", "")), reverse=True)
        return jsonify({"orders": _safe(mine)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _backend_url() -> str:
    """Base URL where this Flask app is running (used for OAuth redirect_uri)."""
    return os.environ.get("BACKEND_URL", "http://localhost:5000")


def _frontend_url() -> str:
    """Base URL of the React frontend (used to redirect user after OAuth)."""
    return os.environ.get("FRONTEND_URL", os.environ.get("BACKEND_URL", "http://localhost:3000"))


def _upsert_oauth_user(
    email: str,
    name: str,
    provider_uid: str,
    line_user_id: str = "",
) -> tuple:
    """Find existing user by email, or create a new one. Returns (user_dict, token, is_new)."""
    ws = _ws("Users")
    users = _cached_records("Users")

    for i, u in enumerate(users):
        if str(u.get("email", "")).lower() == email.lower():
            row = i + 2
            token = secrets.token_hex(32)
            ws.update_cell(row, 7, token)
            # Save/update the LINE userId if provided and not yet stored
            if line_user_id and not str(u.get("line_user_id", "") or ""):
                col = _users_col_index("line_user_id")
                ws.update_cell(row, col, line_user_id)
                # Enable LINE notifications by default when first linked
                notify_line_col = _users_col_index("notify_line")
                if not _bool_cell(u.get("notify_line"), default=False):
                    ws.update_cell(row, notify_line_col, "TRUE")
            _invalidate_cache("Users")
            fresh = dict(u)
            if line_user_id and not str(fresh.get("line_user_id", "") or ""):
                fresh["line_user_id"] = line_user_id
            return (_user_response(fresh), token, False)

    # New user – credits start at 0, must be purchased via orders
    user_id = provider_uid
    token = secrets.token_hex(32)
    now = datetime.datetime.now().isoformat()
    ws.append_row([user_id, email, "", name, 0, now, token])
    # If LINE Login, record userId and enable LINE notifications
    if line_user_id:
        line_col = _users_col_index("line_user_id")
        notify_line_col = _users_col_index("notify_line")
        new_row = len(users) + 2
        ws.update_cell(new_row, line_col, line_user_id)
        ws.update_cell(new_row, notify_line_col, "TRUE")
    _invalidate_cache("Users")
    return (
        _user_response({
            "user_id": user_id,
            "email": email,
            "name": name,
            "credits": 0,
            "credits_expire_at": "",
            "password_hash": "",
            "credit_lots": "",
            "line_user_id": line_user_id or "",
        }),
        token,
        True,
    )


def _oauth_success_redirect(user: dict, token: str):
    """Redirect browser back to the React frontend with auth data in URL."""
    user_b64 = base64.b64encode(json.dumps(user, ensure_ascii=False).encode()).decode()
    return redirect(f"{_frontend_url()}/?oauth_token={token}&oauth_user={urllib.parse.quote(user_b64)}")


def _oauth_error_redirect(msg: str):
    return redirect(f"{_frontend_url()}/?oauth_error={urllib.parse.quote(msg)}")


# ── Google OAuth ───────────────────────────────────────────────────────────────

@app.route("/api/auth/google")
def google_auth():
    """Step 1: Redirect user to Google's consent screen."""
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    if not client_id:
        return jsonify({"error": "GOOGLE_OAUTH_CLIENT_ID 未設定"}), 500

    params = {
        "client_id": client_id,
        "redirect_uri": f"{_backend_url()}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account",
    }
    return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params))


@app.route("/api/auth/google/callback")
def google_callback():
    """Step 2: Exchange code → token → user info → create/login user."""
    code = request.args.get("code", "")
    if not code:
        return _oauth_error_redirect("Google 登入已取消")

    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")
    redirect_uri = f"{_backend_url()}/api/auth/google/callback"

    # Exchange authorization code for access token
    token_res = http_req.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    token_data = token_res.json()
    access_token = token_data.get("access_token", "")
    if not access_token:
        return _oauth_error_redirect("無法取得 Google 存取權杖")

    # Fetch user profile
    userinfo = http_req.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    ).json()

    email = userinfo.get("email", "")
    name = userinfo.get("name", email.split("@")[0])
    provider_uid = f"google_{userinfo.get('sub', secrets.token_hex(8))}"

    try:
        user, token, is_new = _upsert_oauth_user(email, name, provider_uid)
        if is_new:
            # Welcome email for brand new Google-signed-up users
            _notify(
                {"email": email, "name": name, "notify_email": "TRUE"},
                "歡迎加入 JosieUBOUND！",
                _welcome_email_html(name, 0),
                line_text="",
            )
        return _oauth_success_redirect(user, token)
    except Exception as e:
        return _oauth_error_redirect(str(e))


# ── LINE OAuth ─────────────────────────────────────────────────────────────────

@app.route("/api/auth/line")
def line_auth():
    """Step 1: Redirect user to LINE Login consent screen."""
    channel_id = os.environ.get("LINE_CHANNEL_ID", "")
    if not channel_id:
        return jsonify({"error": "LINE_CHANNEL_ID 未設定"}), 500

    params = {
        "response_type": "code",
        "client_id": channel_id,
        "redirect_uri": f"{_backend_url()}/api/auth/line/callback",
        "state": secrets.token_hex(16),
        "scope": "profile openid",
        "bot_prompt": "normal",
    }
    return redirect("https://access.line.me/oauth2/v2.1/authorize?" + urllib.parse.urlencode(params))


@app.route("/api/auth/line/callback")
def line_callback():
    """Step 2: Exchange code → token → profile → create/login user."""
    code = request.args.get("code", "")
    if not code:
        return _oauth_error_redirect("LINE 登入已取消")

    channel_id = os.environ.get("LINE_CHANNEL_ID", "")
    channel_secret = os.environ.get("LINE_CHANNEL_SECRET", "")
    redirect_uri = f"{_backend_url()}/api/auth/line/callback"

    # Exchange code for access token
    token_res = http_req.post(
        "https://api.line.me/oauth2/v2.1/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": channel_id,
            "client_secret": channel_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    token_data = token_res.json()
    access_token = token_data.get("access_token", "")
    if not access_token:
        return _oauth_error_redirect("無法取得 LINE 存取權杖")

    # Fetch LINE profile
    profile = http_req.get(
        "https://api.line.me/v2/profile",
        headers={"Authorization": f"Bearer {access_token}"},
    ).json()

    uid = profile.get("userId", secrets.token_hex(8))
    name = profile.get("displayName", "LINE 使用者")
    # LINE basic scope doesn't provide email; use a placeholder unique to the user
    email = f"line_{uid}@line.placeholder"
    provider_uid = f"line_{uid}"

    try:
        user, token, is_new = _upsert_oauth_user(email, name, provider_uid, line_user_id=uid)
        if is_new:
            _send_line_push(
                uid,
                f"歡迎加入 JosieUBOUND，{name}！\n"
                "到官網購買堂數後即可開始預約課程。\n"
                "之後預約、訂單與堂數變動都會透過 LINE 通知您。",
            )
        return _oauth_success_redirect(user, token)
    except Exception as e:
        return _oauth_error_redirect(str(e))


# ── Admin: check + management APIs ─────────────────────────────────────────────

@app.route("/api/admin/_debug", methods=["GET"])
def admin_debug():
    """臨時除錯用：檢查管理員白名單環境變數與目前登入者是否匹配。"""
    user, _ = _auth_required()
    admin_emails_raw = os.environ.get("ADMIN_EMAILS", "")
    admin_user_ids_raw = os.environ.get("ADMIN_USER_IDS", "")
    admin_emails = [e.strip() for e in admin_emails_raw.lower().split(",") if e.strip()]
    admin_user_ids = [uid.strip() for uid in admin_user_ids_raw.lower().split(",") if uid.strip()]
    user_email = str((user or {}).get("email", "")).lower() if user else ""
    user_id = str((user or {}).get("user_id", "")).lower() if user else ""
    return jsonify({
        "env_admin_emails_raw": repr(admin_emails_raw),
        "env_admin_user_ids_raw": repr(admin_user_ids_raw),
        "env_admin_emails_parsed": admin_emails,
        "env_admin_user_ids_parsed": admin_user_ids,
        "your_email": user_email,
        "your_user_id": user_id,
        "match_email": user_email in admin_emails if user_email else False,
        "match_user_id": user_id in admin_user_ids if user_id else False,
        "match": (user_email in admin_emails if user_email else False) or (user_id in admin_user_ids if user_id else False),
        "authenticated": user is not None,
    })


@app.route("/api/admin/check", methods=["GET"])
def admin_check():
    """前端用來判斷目前登入者是否為管理員。"""
    user, _ = _auth_required()
    return jsonify({"is_admin": _is_admin(user)})


@app.route("/api/admin/users", methods=["GET"])
def admin_list_users():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    try:
        users = _cached_records("Users")
        # 不回傳密碼 hash 與 token
        safe = []
        today = datetime.date.today()
        for u in users:
            lots = _load_credit_lots(u)
            active_lots = []
            for lot in lots:
                rem = int(lot.get("remaining", 0) or 0)
                if rem <= 0:
                    continue
                exp_s = str(lot.get("expire_at", "") or "").strip()
                if exp_s:
                    try:
                        if datetime.date.fromisoformat(exp_s) < today:
                            continue
                    except ValueError:
                        pass
                active_lots.append({
                    "order_id": str(lot.get("order_id", "") or ""),
                    "remaining": rem,
                    "expire_at": exp_s,
                })
            safe.append({
                "user_id": u.get("user_id"),
                "email": u.get("email"),
                "name": u.get("name"),
                "credits": _active_credits(u),
                "credits_expire_at": _credit_lots_summary_expiry(lots, today),
                "credit_lots": active_lots,
                "expired": _has_expired_inventory_with_balance(u),
                "created_at": u.get("created_at"),
            })
        return jsonify({"users": safe, "total": len(safe)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/users/<user_id>/credits", methods=["PATCH"])
def admin_update_credits(user_id):
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    data = request.get_json() or {}

    new_credits = None
    if "credits" in data:
        try:
            new_credits = int(data.get("credits", 0))
            if new_credits < 0:
                return jsonify({"error": "堂數不能為負數"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "堂數格式錯誤"}), 400

    new_expire = None
    if "credits_expire_at" in data:
        raw = data.get("credits_expire_at") or ""
        raw = str(raw).strip()
        if raw:
            try:
                datetime.date.fromisoformat(raw)
            except ValueError:
                return jsonify({"error": "日期格式錯誤，請用 YYYY-MM-DD"}), 400
        new_expire = raw  # either "" (clear) or a valid ISO date

    if new_credits is None and new_expire is None:
        return jsonify({"error": "沒有要更新的欄位"}), 400

    try:
        ws = _ws("Users")
        users = _cached_records("Users")
        for i, u in enumerate(users):
            if str(u.get("user_id")) == str(user_id):
                row = i + 2
                lots = _load_credit_lots(u)
                if new_credits is not None and new_expire is not None:
                    lots = [_normalize_credit_lot({
                        "order_id": "manual",
                        "remaining": new_credits,
                        "expire_at": new_expire,
                    })]
                elif new_credits is not None:
                    keep_exp = str(u.get("credits_expire_at", "") or "").strip()
                    lots = [_normalize_credit_lot({
                        "order_id": "manual",
                        "remaining": new_credits,
                        "expire_at": keep_exp,
                    })]
                elif new_expire is not None:
                    lots = [dict(l) for l in lots]
                    if lots:
                        for lot in lots:
                            lot["expire_at"] = new_expire
                    else:
                        lots = [_normalize_credit_lot({
                            "order_id": "manual",
                            "remaining": int(u.get("credits", 0) or 0),
                            "expire_at": new_expire,
                        })]
                _persist_user_credit_state(ws, row, lots, str(user_id))
                today = datetime.date.today()
                out_credits = _active_credits_from_lots(lots, today)
                out_expire = _credit_lots_summary_expiry(lots, today)
                return jsonify({
                    "message": "會員資料已更新",
                    "credits": out_credits,
                    "credits_expire_at": out_expire,
                })
        return jsonify({"error": "找不到使用者"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/classes", methods=["POST"])
def admin_create_class():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    data = request.get_json() or {}
    try:
        date = data["date"]           # 'YYYY-MM-DD'
        time = data["time"]           # 'HH:MM'
        name = data["name"]
        duration = int(data.get("duration", 60))
        price = int(data.get("price", PRICE_PER_CLASS))
        total_spots = int(data.get("total_spots", 10))
    except (KeyError, ValueError) as e:
        return jsonify({"error": f"欄位錯誤：{e}"}), 400

    try:
        class_id = secrets.token_hex(6)
        date_obj = datetime.date.fromisoformat(date)
        day_names = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        day_label = f"{date_obj.month}月{date_obj.day}日 {day_names[date_obj.weekday()]}"

        _ws("Classes").append_row(
            [class_id, date, time, duration, name, price, total_spots, 0, day_label]
        )
        _append_cache_row("Classes", {
            "class_id": class_id,
            "date": date,
            "time": time,
            "duration": duration,
            "name": name,
            "price": price,
            "total_spots": total_spots,
            "booked_spots": 0,
            "day_label": day_label,
        })
        return jsonify({"message": "課程已新增", "class_id": class_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/classes/<class_id>", methods=["DELETE"])
def admin_delete_class(class_id):
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    try:
        ws = _ws("Classes")
        classes = _cached_records("Classes")
        for i, c in enumerate(classes):
            if str(c.get("class_id")) == str(class_id):
                ws.delete_rows(i + 2)
                _delete_cache_row(
                    "Classes",
                    lambda r, cid=str(class_id): str(r.get("class_id")) == cid,
                )
                return jsonify({"message": "課程已刪除"})
        return jsonify({"error": "找不到課程"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Classes sheet columns (1-based):
# 1 class_id | 2 date | 3 time | 4 duration | 5 name | 6 price
# 7 total_spots | 8 booked_spots | 9 day_label
_CLASS_COL = {
    "class_id": 1, "date": 2, "time": 3, "duration": 4, "name": 5,
    "price": 6, "total_spots": 7, "booked_spots": 8, "day_label": 9,
}


@app.route("/api/admin/classes/<class_id>", methods=["PATCH"])
def admin_update_class(class_id):
    """編輯課程：可更新 date / time / name / duration / price / total_spots。
    其他未提供的欄位保持不變。total_spots 不可低於目前已預約人數。"""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    data = request.get_json(silent=True) or {}
    if not data:
        return jsonify({"error": "沒有要更新的欄位"}), 400

    try:
        ws = _ws("Classes")
        # Use the cached records to locate the row we want to update. This
        # avoids a full sheet read on every admin edit, which was the main
        # contributor to the 429 quota errors during bulk edits.
        classes = _cached_records("Classes")
        target = None
        row = None
        for i, c in enumerate(classes):
            if str(c.get("class_id")) == str(class_id):
                target = c
                row = i + 2  # header row is 1
                break
        if target is None:
            return jsonify({"error": "找不到課程"}), 404

        # (field_name, col_index, value) — keep both so we can write to Sheets
        # AND patch the cache with the same data afterwards.
        updates: list[tuple[str, int, object]] = []

        new_date = str(target.get("date", ""))
        date_changed = False
        if "date" in data:
            raw = str(data["date"] or "").strip()
            try:
                datetime.date.fromisoformat(raw)
            except ValueError:
                return jsonify({"error": "日期格式錯誤，請使用 YYYY-MM-DD"}), 400
            if raw != new_date:
                new_date = raw
                date_changed = True
                updates.append(("date", _CLASS_COL["date"], raw))

        if "time" in data:
            t = str(data["time"] or "").strip()
            if not re.match(r"^\d{2}:\d{2}$", t):
                return jsonify({"error": "時間格式錯誤，請使用 HH:MM"}), 400
            updates.append(("time", _CLASS_COL["time"], t))

        if "name" in data:
            name = str(data["name"] or "").strip()
            if not name:
                return jsonify({"error": "課程名稱不可為空"}), 400
            updates.append(("name", _CLASS_COL["name"], name))

        if "duration" in data:
            try:
                duration = int(data["duration"])
            except (TypeError, ValueError):
                return jsonify({"error": "時長必須是整數"}), 400
            if duration <= 0:
                return jsonify({"error": "時長必須大於 0"}), 400
            updates.append(("duration", _CLASS_COL["duration"], duration))

        if "price" in data:
            try:
                price = int(data["price"])
            except (TypeError, ValueError):
                return jsonify({"error": "價格必須是整數"}), 400
            if price < 0:
                return jsonify({"error": "價格不可為負數"}), 400
            updates.append(("price", _CLASS_COL["price"], price))

        if "total_spots" in data:
            try:
                spots = int(data["total_spots"])
            except (TypeError, ValueError):
                return jsonify({"error": "名額必須是整數"}), 400
            booked = int(target.get("booked_spots", 0) or 0)
            if spots < booked:
                return jsonify({
                    "error": f"名額不可低於目前已預約人數（{booked}）"
                }), 400
            if spots <= 0:
                return jsonify({"error": "名額必須大於 0"}), 400
            updates.append(("total_spots", _CLASS_COL["total_spots"], spots))

        # Recompute day_label if the date changed.
        if date_changed:
            date_obj = datetime.date.fromisoformat(new_date)
            day_names = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
            day_label = f"{date_obj.month}月{date_obj.day}日 {day_names[date_obj.weekday()]}"
            updates.append(("day_label", _CLASS_COL["day_label"], day_label))

        if not updates:
            return jsonify({"message": "沒有變更"})

        # One HTTP round-trip for all changed cells.
        _batch_write_cells(ws, [(row, col, val) for (_, col, val) in updates])

        # Patch the cache in-place so we don't need a fresh read on the next
        # request.
        _patch_cache_row(
            "Classes",
            lambda c: str(c.get("class_id")) == str(class_id),
            {field: val for (field, _, val) in updates},
        )

        return jsonify({"message": "課程已更新", "updated_fields": len(updates)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/bookings", methods=["GET"])
def admin_list_bookings():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    try:
        bookings = _cached_records("Bookings")
        users = {str(u.get("user_id")): u for u in _cached_records("Users")}
        enriched = []
        for b in bookings:
            u = users.get(str(b.get("user_id")), {})
            enriched.append({
                **b,
                "user_email": u.get("email", ""),
                "user_name": u.get("name", ""),
            })
        return jsonify({"bookings": _safe(enriched), "total": len(enriched)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/bookings", methods=["POST"])
def admin_create_booking():
    """管理員代客建立預約（扣 1 堂、占 1 名額）。"""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    data = request.get_json() or {}
    user_id = str(data.get("user_id", "") or "").strip()
    class_id = str(data.get("class_id", "") or "").strip()
    if not user_id or not class_id:
        return jsonify({"error": "缺少 user_id 或 class_id"}), 400

    try:
        users = _cached_records("Users")
        target_user = None
        user_row = None
        for i, u in enumerate(users):
            if str(u.get("user_id")) == user_id:
                target_user = u
                user_row = i + 2
                break
        if not target_user or user_row is None:
            return jsonify({"error": "找不到會員"}), 404

        classes_ws = _ws("Classes")
        classes = _cached_records("Classes")
        target_class = None
        class_row = None
        for i, c in enumerate(classes):
            if str(c.get("class_id")) == class_id:
                target_class = c
                class_row = i + 2
                break
        if not target_class or class_row is None:
            return jsonify({"error": "找不到課程"}), 404

        if int(target_class.get("booked_spots", 0) or 0) >= int(target_class.get("total_spots", 0) or 0):
            return jsonify({"error": "此課程已額滿"}), 400

        bookings = _cached_records("Bookings")
        if _has_confirmed_booking(bookings, user_id, class_id):
            return jsonify({"error": "同一堂課每位會員限預約一次", "code": "DUPLICATE_BOOKING"}), 400

        if _credits_expired(target_user) and _active_credits(target_user) < 1:
            return jsonify({"error": "會員堂數已過期，請先處理堂數效期"}), 400

        if _active_credits(target_user) < 1:
            return jsonify({"error": "會員堂數不足，無法代為預約"}), 400

        if _class_date_exceeds_credit_expiry(target_user, str(target_class.get("date", ""))):
            return jsonify({"error": "此課程日期已超過會員目前可用批次的有效期限"}), 400

        booking_id = secrets.token_hex(8)
        now = datetime.datetime.now().isoformat()
        class_datetime = f"{target_class['date']} {target_class['time']}"

        lots = _load_credit_lots(target_user)
        today = datetime.date.today()
        class_date = datetime.date.fromisoformat(str(target_class.get("date", "")))
        new_lots, src_oid = _consume_one_credit_for_class(lots, class_date, today)
        if new_lots is None:
            return jsonify({"error": "扣堂失敗，請稍後再試"}), 500

        bookings_ws = _ws("Bookings")
        _booking_append_row(bookings_ws, {
            "booking_id": booking_id,
            "user_id": user_id,
            "class_id": class_id,
            "class_name": target_class["name"],
            "class_datetime": class_datetime,
            "status": "confirmed",
            "created_at": now,
            "credit_source_order_id": src_oid or "",
        })
        classes_ws.update_cell(class_row, 8, int(target_class.get("booked_spots", 0) or 0) + 1)
        users_ws = _ws("Users")
        _persist_user_credit_state(users_ws, user_row, new_lots, user_id)
        new_credits = _active_credits_from_lots(new_lots, today)
        _invalidate_cache("Users", "Classes", "Bookings")

        _notify(
            target_user,
            f"預約成功｜{target_class['name']}",
            _booking_email_html(target_class["name"], class_datetime, new_credits),
            line_text=(
                f"✅ 預約成功\n課程：{target_class['name']}\n時間：{class_datetime}\n"
                f"剩餘堂數：{new_credits} 堂\n提醒：開始前 6 小時內無法取消。"
            ),
            sync_line=True,
        )

        return jsonify({
            "message": "已成功代會員完成預約",
            "booking": {
                "booking_id": booking_id,
                "user_id": user_id,
                "class_id": class_id,
                "class_name": target_class["name"],
                "class_datetime": class_datetime,
                "status": "confirmed",
                "created_at": now,
            },
            "credits_remaining": new_credits,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/bookings/<booking_id>", methods=["DELETE"])
def admin_cancel_booking(booking_id):
    """管理員取消預約：可強制取消，並回補會員堂數與課程名額。"""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    try:
        bookings_ws = _ws("Bookings")
        bookings = _cached_records("Bookings")

        for i, b in enumerate(bookings):
            if str(b.get("booking_id")) != str(booking_id):
                continue

            if b.get("status") == "cancelled":
                return jsonify({"error": "此預約已取消"}), 400

            row_num = i + 2
            bookings_ws.update_cell(row_num, 6, "cancelled")

            # Restore spot in class
            classes_ws = _ws("Classes")
            classes = _cached_records("Classes")
            for j, c in enumerate(classes):
                if str(c.get("class_id")) == str(b.get("class_id")):
                    new_spots = max(0, int(c.get("booked_spots", 0) or 0) - 1)
                    classes_ws.update_cell(j + 2, 8, new_spots)
                    break

            users_ws = _ws("Users")
            users = _cached_records("Users")
            target_user = None
            owner_row = None
            for j, u in enumerate(users):
                if str(u.get("user_id")) == str(b.get("user_id")):
                    target_user = u
                    owner_row = j + 2
                    break

            new_credits = None
            if target_user is not None and owner_row is not None:
                src_oid = str(b.get("credit_source_order_id", "") or "").strip()
                lots = _load_credit_lots(target_user)
                new_lots = _refund_credit_to_lot(lots, src_oid)
                _persist_user_credit_state(users_ws, owner_row, new_lots, str(b.get("user_id")))
                new_credits = _active_credits_from_lots(new_lots, datetime.date.today())

            _invalidate_cache("Users", "Classes", "Bookings")

            if target_user and new_credits is not None:
                dt_str = str(b.get("class_datetime", ""))
                _notify(
                    target_user,
                    f"已取消預約｜{b.get('class_name', '課程')}",
                    _booking_cancel_email_html(
                        str(b.get("class_name", "課程")), dt_str, new_credits
                    ),
                    line_text=(
                        f"❎ 預約已取消\n課程：{b.get('class_name', '課程')}\n原時間：{dt_str}\n"
                        f"堂數已退還，目前剩餘 {new_credits} 堂。"
                    ),
                )

            return jsonify({"message": "預約已取消並回補堂數"})

        return jsonify({"error": "找不到此預約"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/orders", methods=["GET"])
def admin_list_orders():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    try:
        orders = _cached_records("Orders")
        orders = sorted(orders, key=lambda o: str(o.get("created_at", "")), reverse=True)
        return jsonify({"orders": _safe(orders), "total": len(orders)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/orders/<order_id>/confirm", methods=["POST"])
def admin_confirm_order(order_id):
    """確認訂單付款：訂單狀態 → paid，本筆堂數與有效期限獨立成一批次（不與舊堂數合併效期）。

    Optional JSON body:
        credits_expire_at:  ISO date (YYYY-MM-DD) override for *this order's*
                            batch only. If omitted, defaults from堂數規則
                            （1–8 堂：當月底；9 堂以上：自今日起兩個月）。
    """
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    data = request.get_json(silent=True) or {}
    override_expiry_raw = str(data.get("credits_expire_at", "") or "").strip()
    override_expiry: str | None = None
    if override_expiry_raw:
        try:
            d = datetime.date.fromisoformat(override_expiry_raw)
            if d < datetime.date.today():
                return jsonify({"error": "有效期限不能早於今天"}), 400
            override_expiry = d.isoformat()
        except ValueError:
            return jsonify({"error": "有效期限格式錯誤，請使用 YYYY-MM-DD"}), 400

    try:
        ws = _ensure_orders_sheet()
        # Use the cache to locate the order and the user. Writes below keep
        # the cache consistent via _patch_cache_row, so we don't pay for a
        # fresh read on every confirmation.
        orders = _cached_records("Orders")
        for i, o in enumerate(orders):
            if str(o.get("order_id")) != str(order_id):
                continue

            if str(o.get("status")) != "pending":
                return jsonify({"error": f"此訂單狀態為 {o.get('status')}，無法重複確認"}), 400

            users_ws = _ws("Users")
            users = _cached_records("Users")
            target_user = None
            user_row = None
            for j, u in enumerate(users):
                if str(u.get("user_id")) == str(o.get("user_id")):
                    target_user = u
                    user_row = j + 2
                    break
            if not target_user:
                return jsonify({"error": "找不到訂單對應的使用者"}), 404

            quantity = int(o.get("quantity", 0) or 0)
            batch_expiry = override_expiry or _default_expiry_for_quantity(quantity)
            lots = list(_load_credit_lots(target_user))
            lots.append(_normalize_credit_lot({
                "order_id": str(order_id),
                "remaining": quantity,
                "expire_at": batch_expiry,
            }))

            now = datetime.datetime.now().isoformat()
            user_target_uid = str(target_user.get("user_id"))
            order_row = i + 2
            _persist_user_credit_state(users_ws, user_row, lots, user_target_uid)
            today = datetime.date.today()
            new_credits = _active_credits_from_lots(lots, today)
            summary_exp = _credit_lots_summary_expiry(lots, today)

            _batch_write_cells(ws, [
                (order_row, ORDER_COL["status"], "paid"),
                (order_row, ORDER_COL["paid_at"], now),
            ])
            _patch_cache_row(
                "Orders",
                lambda r, oid=str(order_id): str(r.get("order_id")) == oid,
                {"status": "paid", "paid_at": now},
            )

            order_total = int(o.get("total", 0) or 0)
            _notify(
                target_user,
                f"付款已確認｜堂數已加入（+{quantity} 堂）",
                _order_confirmed_email_html(quantity, order_total, batch_expiry, new_credits),
                line_text=(
                    f"🎉 付款已確認！\n本次購買 {quantity} 堂（NT${order_total:,}），本筆效期至 {batch_expiry}。\n"
                    f"目前帳戶可用總堂數：{new_credits} 堂\n\n快到官網預約課程吧！"
                ),
                sync_line=True,
            )

            return jsonify({
                "message": "訂單已確認，堂數已發放",
                "user_id": str(o.get("user_id")),
                "credits": new_credits,
                "credits_expire_at": summary_exp,
            })

        return jsonify({"error": "找不到此訂單"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/orders/<order_id>/cancel", methods=["POST"])
def admin_cancel_order(order_id):
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    data = request.get_json() or {}
    reason = str(data.get("reason", "") or "")
    try:
        ws = _ensure_orders_sheet()
        orders = _cached_records("Orders")
        for i, o in enumerate(orders):
            if str(o.get("order_id")) == str(order_id):
                if str(o.get("status")) == "paid":
                    return jsonify({"error": "已付款的訂單無法取消，請手動處理"}), 400
                order_row = i + 2
                cell_updates = [(order_row, ORDER_COL["status"], "cancelled")]
                patch = {"status": "cancelled"}
                if reason:
                    cell_updates.append((order_row, ORDER_COL["notes"], reason))
                    patch["notes"] = reason
                _batch_write_cells(ws, cell_updates)
                _patch_cache_row(
                    "Orders",
                    lambda r, oid=str(order_id): str(r.get("order_id")) == oid,
                    patch,
                )

                # Look up user and notify
                users = _cached_records("Users")
                target_user = next(
                    (u for u in users if str(u.get("user_id")) == str(o.get("user_id"))), None
                )
                if target_user:
                    _notify(
                        target_user,
                        f"訂單已取消｜{o.get('order_id')}",
                        _order_cancelled_email_html(str(o.get("order_id")), reason),
                        line_text=(
                            f"❎ 訂單已取消\n編號：{o.get('order_id')}\n"
                            + (f"原因：{reason}\n" if reason else "")
                            + "如有疑問請聯絡小助理。"
                        ),
                        sync_line=True,
                    )

                return jsonify({"message": "訂單已取消"})
        return jsonify({"error": "找不到此訂單"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/settings", methods=["GET"])
def admin_get_settings():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    return jsonify({"settings": _get_settings()})


@app.route("/api/admin/settings", methods=["PATCH"])
def admin_update_settings():
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    data = request.get_json() or {}
    try:
        allowed = set(DEFAULT_SETTINGS.keys())
        for key, value in data.items():
            if key not in allowed:
                continue
            _set_setting(str(key), str(value) if value is not None else "")
        return jsonify({"message": "設定已更新", "settings": _get_settings()})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/admin/notify/status", methods=["GET"])
def admin_notify_status():
    """Tell admin which notification channels are configured on this server."""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    cfg = _notifications_config()
    return jsonify({
        "email": cfg["email"],
        "line": cfg["line"],
        "gmail_user": os.environ.get("GMAIL_USER", "")[:3] + "***" if cfg["email"] else "",
        "from_name": os.environ.get("GMAIL_FROM_NAME", "JosieUBOUND"),
    })


@app.route("/api/admin/notify/test_email", methods=["POST"])
def admin_test_email():
    """Send a test email (synchronous so admin sees success/failure immediately)."""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    data = request.get_json() or {}
    to = str(data.get("to") or admin.get("email") or "").strip()
    if not to or "@" not in to:
        return jsonify({"error": "請提供有效的收件地址"}), 400
    ok, detail = _send_email_sync(
        to,
        "JosieUBOUND 測試郵件",
        _email_wrap("測試郵件", "<p>如果您看到這封信，代表 Email 通知已設定成功！</p>"),
    )
    if ok:
        return jsonify({"message": f"測試郵件已寄出至 {to}", "detail": detail})
    return jsonify({"error": f"寄信失敗：{detail}"}), 500


@app.route("/api/admin/notify/test_line", methods=["POST"])
def admin_test_line():
    """Push a test message via LINE Messaging API to the admin's own LINE account."""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403
    data = request.get_json() or {}
    line_uid = str(data.get("line_user_id") or admin.get("line_user_id") or "").strip()
    if not line_uid:
        return jsonify({
            "error": "未綁定 LINE。請先用 LINE 登入本系統以綁定，或手動提供 LINE userId。"
        }), 400
    ok, detail = _send_line_push_sync(
        line_uid,
        "🧪 JosieUBOUND 測試推播\n如果您收到這則訊息，代表 LINE 推播已設定成功！",
    )
    if ok:
        return jsonify({"message": "測試推播已發送", "detail": detail})
    return jsonify({"error": f"推播失敗：{detail}"}), 500


@app.route("/api/admin/stats", methods=["GET"])
def admin_stats():
    """Returns simple revenue / usage statistics."""
    admin, _ = _admin_required()
    if not admin:
        return jsonify({"error": "需要管理員權限"}), 403

    try:
        users = _cached_records("Users")
        classes = _cached_records("Classes")
        bookings = _cached_records("Bookings")
        orders = _cached_records("Orders")

        confirmed = [b for b in bookings if b.get("status") == "confirmed"]
        cancelled = [b for b in bookings if b.get("status") == "cancelled"]

        pending_orders = [o for o in orders if o.get("status") == "pending"]
        paid_orders = [o for o in orders if o.get("status") == "paid"]

        # 實際營收 = 已付款訂單總額
        actual_revenue = sum(int(o.get("total", 0) or 0) for o in paid_orders)
        pending_revenue = sum(int(o.get("total", 0) or 0) for o in pending_orders)

        total_spots = sum(int(c.get("total_spots", 0) or 0) for c in classes)
        booked_spots = sum(int(c.get("booked_spots", 0) or 0) for c in classes)
        occupancy = round(booked_spots / total_spots * 100, 1) if total_spots else 0

        total_credits_held = sum(_active_credits(u) for u in users)

        return jsonify({
            "total_users": len(users),
            "total_classes": len(classes),
            "total_bookings": len(bookings),
            "confirmed_bookings": len(confirmed),
            "cancelled_bookings": len(cancelled),
            "pending_orders": len(pending_orders),
            "paid_orders": len(paid_orders),
            "actual_revenue": actual_revenue,
            "pending_revenue": pending_revenue,
            "estimated_revenue": actual_revenue,
            "total_spots": total_spots,
            "booked_spots": booked_spots,
            "occupancy_rate": occupancy,
            "total_credits_held": total_credits_held,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Admin: seed initial data ───────────────────────────────────────────────────

@app.route("/api/admin/seed", methods=["POST"])
def seed_data():
    """
    Call once to create/reset all worksheets with headers and sample class data.
    POST /api/admin/seed
    """
    try:
        sh = _get_spreadsheet()

        def get_or_create(name, rows=1000, cols=10):
            try:
                return sh.worksheet(name)
            except gspread.exceptions.WorksheetNotFound:
                return sh.add_worksheet(name, rows, cols)

        # Users sheet
        users_ws = get_or_create("Users")
        users_ws.clear()
        users_ws.append_row(["user_id", "email", "password_hash", "name", "credits", "created_at", "token"])

        # Add a demo user: demo@test.com / password123
        demo_id = secrets.token_hex(8)
        demo_token = secrets.token_hex(32)
        now = datetime.datetime.now().isoformat()
        users_ws.append_row([demo_id, "demo@test.com", _hash("password123"), "Demo User", 10, now, demo_token])

        # Classes sheet
        classes_ws = get_or_create("Classes")
        classes_ws.clear()
        classes_ws.append_row(["class_id", "date", "time", "duration", "name", "price", "total_spots", "booked_spots", "day_label"])

        day_names = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        templates = [
            ("07:30", 60, "晨間流動瑜珈", 150, 15),
            ("08:00", 60, "基礎皮拉提斯", 150, 15),
            ("12:00", 50, "午間舒緩伸展", 150, 12),
            ("12:15", 45, "UBOUND 高強度間歇", 150, 10),
            ("18:30", 45, "UBOUND 燃脂派對", 150, 12),
            ("19:00", 60, "深層放鬆陰瑜珈", 150, 12),
            ("19:30", 60, "進階皮拉提斯", 150, 10),
        ]

        random.seed(42)
        rows_to_add = []
        for day in range(1, 31):
            date_str = f"2024-09-{day:02d}"
            date_obj = datetime.date(2024, 9, day)
            day_label = f"9月{day}日 {day_names[date_obj.weekday()]}"

            morning = templates[0] if day % 2 == 0 else templates[1]
            noon = templates[2] if day % 3 == 0 else templates[3]
            if day % 4 == 0:
                evening, full = templates[4], True
            elif day % 5 == 0:
                evening, full = templates[6], True
            else:
                evening, full = templates[5], False

            for t, is_full in [(morning, False), (noon, False), (evening, full)]:
                booked = t[4] if is_full else random.randint(0, max(0, t[4] - 2))
                rows_to_add.append([secrets.token_hex(6), date_str, t[0], t[1], t[2], t[3], t[4], booked, day_label])

        classes_ws.append_rows(rows_to_add)

        # Bookings sheet
        bookings_ws = get_or_create("Bookings")
        bookings_ws.clear()
        bookings_ws.append_row([
            "booking_id", "user_id", "class_id", "class_name", "class_datetime",
            "status", "created_at", "credit_source_order_id",
        ])

        return jsonify({
            "message": "資料初始化完成！",
            "demo_account": {"email": "demo@test.com", "password": "password123"},
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Local dev entry point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000)
