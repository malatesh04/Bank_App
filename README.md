# 🏦 State Bank of Karnataka — Secure Banking Web Application

A full-stack secure banking application with **phone + password authentication**, **bcrypt password hashing**, **JWT session management**, and a **premium dark-navy UI**.

---

## 📁 Project Structure

```
Bank app/
├── server.js              # Express server + middleware setup
├── package.json
├── .env                   # Environment variables (JWT secret, port)
├── .gitignore
├── bank.db                # SQLite database (auto-created on first run)
├── test-api.js            # Full API test suite (22 tests)
│
├── src/
│   ├── database/
│   │   └── db.js          # sql.js database (schema, helpers)
│   ├── middleware/
│   │   └── auth.js        # JWT verifyToken middleware + generateToken
│   └── routes/
│       ├── auth.js        # POST /register, POST /login, POST /logout
│       └── bank.js        # GET /balance, POST /deposit, POST /transfer, GET /transactions, GET /user
│
└── public/               # Static frontend (SPA)
    ├── index.html         # All pages in one file
    ├── style.css          # Premium CSS (glassmorphism, animations)
    └── app.js             # Frontend JS (SPA routing, API calls, rate limiting)
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` (already created with defaults):
```env
PORT=3000
JWT_SECRET=your_very_long_secret_key_here
JWT_EXPIRY=1h
NODE_ENV=development
```

### 3. Start the Server
```bash
node server.js
```
Or with auto-restart on file changes:
```bash
npm run dev
```

### 4. Open the App
Visit **http://localhost:3000** in your browser.

---

## 🔐 How Authentication Works

1. **Register** → Fill in name, phone, password → Backend hashes password with **bcrypt (12 rounds)** → Account created → Redirected to login
2. **Login** → Enter phone number + password → Backend looks up user by phone, verifies bcrypt hash → Issues **JWT** → Stored in `localStorage` + HTTP-only cookie
3. **Protected Routes** → Every API call sends `Authorization: Bearer <token>` → Middleware validates token → Serves data or returns 401

---

## 📡 API Reference

| Method | Endpoint            | Auth | Description                        |
|--------|---------------------|------|------------------------------------|
| POST   | `/api/register`     | ❌   | Create new account                 |
| POST   | `/api/login`        | ❌   | Login with phone number + password |
| POST   | `/api/logout`       | ❌   | Clear auth cookie                  |
| GET    | `/api/balance`      | ✅   | Get current user balance           |
| POST   | `/api/deposit`      | ✅   | Add money to account               |
| POST   | `/api/transfer`     | ✅   | Transfer money to another user     |
| GET    | `/api/transactions` | ✅   | Get last 20 transactions           |
| GET    | `/api/user`         | ✅   | Get user profile                   |

### Request Examples

**Register**
```json
POST /api/register
{
  "username": "Arjun Sharma",
  "phone": "9876543210",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123"
}
```

**Login**
```json
POST /api/login
{
  "phone": "9876543210",
  "password": "SecurePass123"
}
```

**Deposit**
```json
POST /api/deposit
Authorization: Bearer <token>
{
  "amount": 5000
}
```

**Transfer**
```json
POST /api/transfer
Authorization: Bearer <token>
{
  "receiverPhone": "8765432109",
  "amount": 500
}
```

---

## 🗄️ Database Schema

### `users`
| Column     | Type    | Notes                     |
|------------|---------|---------------------------|
| id         | INTEGER | Primary key, autoincrement|
| username   | TEXT    | Full name                 |
| phone      | TEXT    | Unique, 10 digits         |
| password   | TEXT    | bcrypt hashed             |
| balance    | REAL    | Default 0.0               |
| created_at | TEXT    | ISO datetime              |

### `transactions`
| Column      | Type    | Notes                              |
|-------------|---------|----------------------------------  |
| id          | INTEGER | Primary key                        |
| sender_id   | INTEGER | Foreign key → users.id (NULL = deposit) |
| receiver_id | INTEGER | Foreign key → users.id             |
| amount      | REAL    | Transaction amount                 |
| type        | TEXT    | 'deposit' or 'transfer'            |
| timestamp   | TEXT    | ISO datetime                       |

---

## 🔒 Security Features

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcryptjs, 12 salt rounds |
| JWT tokens | HS256, 1-hour expiry |
| Server-side rate limiting | 15 auth requests / 10 min (HTTP 429 + Retry-After header) |
| Client-side rate limiting | 5-second cooldown between attempts |
| Countdown UI on rate limit | Amber pulsing timer shown after too many attempts |
| HTTP-only cookies | Prevents XSS token theft |
| Security headers | Helmet.js (CSP, HSTS, etc.) |
| SQL injection | Parameterized queries only |
| Self-transfer prevention | Backend + frontend validation |
| Atomic transfers | SQLite transactions (BEGIN/COMMIT/ROLLBACK) |
| Unauthorized access | JWT middleware on all protected routes |

---

## 🎨 Frontend Features

- **SPA routing** — no page reloads, smooth transitions
- **Dark navy glassmorphism** login/register cards
- **Animated background orbs**
- **Password strength meter** on registration
- **Balance visibility toggle** (show/hide amount)
- **Add Money modal** with quick preset amounts + payment method selector
- **Send Money modal** with receiver lookup preview
- **Transaction history** with Deposit / Sent / Received filter tabs
- **Stats row** — Total Deposited, Total Sent, Total Received, Transaction Count
- **Toast notifications** for all actions
- **Session persistence** (survives page refresh via localStorage)
- **Responsive** — works on mobile, tablet, desktop

---

## 🧪 Run API Tests

```bash
node test-api.js
```

Tests cover (22 total):
- ✅ Register two users
- ✅ Reject duplicate phone numbers
- ✅ Login with correct phone + password
- ✅ Reject wrong passwords
- ✅ Reject unknown phone numbers
- ✅ Reject invalid phone formats
- ✅ Check balance (authenticated)
- ✅ Deposit money
- ✅ Reject negative/zero deposits
- ✅ Transfer between users
- ✅ Reject self-transfer
- ✅ Reject transfer with insufficient balance
- ✅ Reject transfer to unknown receiver
- ✅ Transaction history (with direction labels)
- ✅ User profile
- ✅ Reject unauthenticated API access

---

## ⚙️ Environment Variables

| Variable    | Default           | Description           |
|-------------|-------------------|-----------------------|
| `PORT`      | `3000`            | Server port           |
| `JWT_SECRET`| (long secret key) | JWT signing secret    |
| `JWT_EXPIRY`| `1h`              | Token expiry duration |
| `NODE_ENV`  | `development`     | Environment mode      |
