import os
import json
import hashlib
import secrets
import datetime
import random
import urllib.parse
import base64

import requests as http_req
from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
import gspread
from google.oauth2.service_account import Credentials

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

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


def _get_spreadsheet():
    gc = _get_gc()
    spreadsheet_id = os.environ.get("SPREADSHEET_ID", "")
    if not spreadsheet_id:
        raise ValueError("環境變數 SPREADSHEET_ID 未設定")
    return gc.open_by_key(spreadsheet_id)


def _ws(sheet_name: str):
    return _get_spreadsheet().worksheet(sheet_name)


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def _get_user_by_token(token: str):
    """Returns (user_dict, row_number) or (None, None)."""
    if not token:
        return None, None
    try:
        ws = _ws("Users")
        users = ws.get_all_records()
        for i, u in enumerate(users):
            if u.get("token") == token:
                return u, i + 2  # 1-based + header row
    except Exception:
        pass
    return None, None


def _auth_required():
    token = request.headers.get("Authorization", "").replace("Bearer ", "").strip()
    user, row = _get_user_by_token(token)
    return user, row


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
        users = ws.get_all_records()
        for u in users:
            if str(u.get("email", "")).lower() == email:
                return jsonify({"error": "此電子郵件已被使用"}), 409

        user_id = secrets.token_hex(8)
        token = secrets.token_hex(32)
        now = datetime.datetime.now().isoformat()
        ws.append_row([user_id, email, _hash(password), name, 10, now, token])

        return jsonify({
            "user": {"id": user_id, "email": email, "name": name, "credits": 10},
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
        users = ws.get_all_records()
        pw_hash = _hash(password)
        for i, u in enumerate(users):
            if str(u.get("email", "")).lower() == email and u.get("password_hash") == pw_hash:
                token = secrets.token_hex(32)
                ws.update_cell(i + 2, 7, token)
                return jsonify({
                    "user": {
                        "id": str(u["user_id"]),
                        "email": u["email"],
                        "name": u["name"],
                        "credits": int(u.get("credits", 0)),
                    },
                    "token": token,
                })
        return jsonify({"error": "電子郵件或密碼錯誤"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/user/me", methods=["GET"])
def get_me():
    user, _ = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401
    return jsonify({
        "user": {
            "id": str(user["user_id"]),
            "email": user["email"],
            "name": user["name"],
            "credits": int(user.get("credits", 0)),
        }
    })


# ── Classes ────────────────────────────────────────────────────────────────────

@app.route("/api/classes", methods=["GET"])
def get_classes():
    try:
        ws = _ws("Classes")
        classes = ws.get_all_records()
        return jsonify({"classes": classes})
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
        classes = classes_ws.get_all_records()

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

        if int(user.get("credits", 0)) < 1:
            return jsonify({"error": "堂數不足，請先購買套票", "code": "NO_CREDITS"}), 400

        # Create booking record
        bookings_ws = _ws("Bookings")
        booking_id = secrets.token_hex(8)
        now = datetime.datetime.now().isoformat()
        class_datetime = f"{target['date']} {target['time']}"

        bookings_ws.append_row([
            booking_id,
            str(user["user_id"]),
            class_id,
            target["name"],
            class_datetime,
            "confirmed",
            now,
        ])

        # Update booked spots
        classes_ws.update_cell(class_row, 8, int(target["booked_spots"]) + 1)

        # Deduct one credit
        new_credits = int(user["credits"]) - 1
        _ws("Users").update_cell(user_row, 5, new_credits)

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
        ws = _ws("Bookings")
        all_bookings = ws.get_all_records()
        user_bookings = [
            b for b in all_bookings
            if str(b.get("user_id")) == str(user["user_id"]) and b.get("status") == "confirmed"
        ]
        return jsonify({"bookings": user_bookings})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/bookings/<booking_id>", methods=["DELETE"])
def cancel_booking(booking_id):
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    try:
        bookings_ws = _ws("Bookings")
        bookings = bookings_ws.get_all_records()

        for i, b in enumerate(bookings):
            if str(b.get("booking_id")) == str(booking_id) and str(b.get("user_id")) == str(user["user_id"]):
                row_num = i + 2
                bookings_ws.update_cell(row_num, 6, "cancelled")

                # Restore spot in class
                classes_ws = _ws("Classes")
                classes = classes_ws.get_all_records()
                for j, c in enumerate(classes):
                    if str(c["class_id"]) == str(b.get("class_id")):
                        new_spots = max(0, int(c["booked_spots"]) - 1)
                        classes_ws.update_cell(j + 2, 8, new_spots)
                        break

                # Refund credit
                new_credits = int(user.get("credits", 0)) + 1
                _ws("Users").update_cell(user_row, 5, new_credits)

                return jsonify({"message": "課程已取消，堂數已退還", "credits": new_credits})

        return jsonify({"error": "找不到此預約"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Packages ───────────────────────────────────────────────────────────────────
# 定價規則：每堂 NT$150；一次購買 4 堂（含）以上，總價減 NT$20

PRICE_PER_CLASS = 150
BULK_DISCOUNT_MIN = 4
BULK_DISCOUNT_AMOUNT = 20


def calc_price(quantity: int) -> dict:
    """計算購買堂數的費用明細。"""
    subtotal = quantity * PRICE_PER_CLASS
    discount = BULK_DISCOUNT_AMOUNT if quantity >= BULK_DISCOUNT_MIN else 0
    total = subtotal - discount
    return {"subtotal": subtotal, "discount": discount, "total": total}


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
    user, user_row = _auth_required()
    if not user:
        return jsonify({"error": "請先登入"}), 401

    data = request.get_json() or {}
    try:
        quantity = int(data.get("quantity", 1))
    except (ValueError, TypeError):
        return jsonify({"error": "堂數格式錯誤"}), 400

    if quantity < 1 or quantity > 50:
        return jsonify({"error": "購買堂數需在 1–50 之間"}), 400

    pricing = calc_price(quantity)
    try:
        new_credits = int(user.get("credits", 0)) + quantity
        _ws("Users").update_cell(user_row, 5, new_credits)
        return jsonify({
            "message": f"成功購買 {quantity} 堂課程",
            "credits": new_credits,
            "pricing": pricing,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── OAuth helpers ─────────────────────────────────────────────────────────────

def _backend_url() -> str:
    """Base URL where this Flask app is running (used for OAuth redirect_uri)."""
    return os.environ.get("BACKEND_URL", "http://localhost:5000")


def _frontend_url() -> str:
    """Base URL of the React frontend (used to redirect user after OAuth)."""
    return os.environ.get("FRONTEND_URL", os.environ.get("BACKEND_URL", "http://localhost:3000"))


def _upsert_oauth_user(email: str, name: str, provider_uid: str) -> tuple:
    """Find existing user by email, or create a new one. Returns (user_dict, token)."""
    ws = _ws("Users")
    users = ws.get_all_records()

    for i, u in enumerate(users):
        if str(u.get("email", "")).lower() == email.lower():
            token = secrets.token_hex(32)
            ws.update_cell(i + 2, 7, token)
            return {
                "id": str(u["user_id"]),
                "email": u["email"],
                "name": u["name"],
                "credits": int(u.get("credits", 0)),
            }, token

    # New user – grant 5 free credits on first OAuth login
    user_id = provider_uid
    token = secrets.token_hex(32)
    now = datetime.datetime.now().isoformat()
    ws.append_row([user_id, email, "", name, 5, now, token])
    return {"id": user_id, "email": email, "name": name, "credits": 5}, token


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
        user, token = _upsert_oauth_user(email, name, provider_uid)
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
        user, token = _upsert_oauth_user(email, name, provider_uid)
        return _oauth_success_redirect(user, token)
    except Exception as e:
        return _oauth_error_redirect(str(e))


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
        bookings_ws.append_row(["booking_id", "user_id", "class_id", "class_name", "class_datetime", "status", "created_at"])

        return jsonify({
            "message": "資料初始化完成！",
            "demo_account": {"email": "demo@test.com", "password": "password123"},
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Local dev entry point ──────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run(debug=True, port=5000)
