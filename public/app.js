/* ══════════════════════════════════════════════════════════════
   State Bank of Karnataka — Frontend Application
   Auth: Phone Number + Password
   Features: Deposit, Transfer, Transaction History, Stats
   Security: Client-side rate limiting, debounce, input
             validation before every API call, graceful 429
             error handling with countdown timers.
   ══════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ─────────────────────────────────────────────────────
const state = {
    token: null,
    user: null,   // { id, username, phone, accountNumber }
    balance: null,
    transactions: [],
    txFilter: 'all',
    balanceVisible: true,
};

// ─── DOM helpers ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const q = (sel, ctx = document) => ctx.querySelector(sel);
const qa = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ══════════════════════════════════════════════════════════════
// CLIENT-SIDE RATE LIMITER
// Prevents rapid repeated submissions and reduces server-side
// rate-limit triggers.
// ══════════════════════════════════════════════════════════════
const RateLimiter = (() => {
    const cooldowns = {};   // key → timestamp of last attempt
    const timers = {};   // key → countdown interval ID

    /**
     * Try to record an attempt.
     * @param {string} key       - unique key (e.g. 'login', 'register')
     * @param {number} waitMs    - required gap in ms (default 5000)
     * @returns {{ allowed: boolean, remainingMs: number }}
     */
    function attempt(key, waitMs = 5000) {
        const last = cooldowns[key] || 0;
        const diff = Date.now() - last;
        if (diff < waitMs) {
            return { allowed: false, remainingMs: waitMs - diff };
        }
        cooldowns[key] = Date.now();
        return { allowed: true, remainingMs: 0 };
    }

    /**
     * Start a live countdown in an error element.
     * Clears itself when countdown reaches 0.
     * @param {string} errorElId  - element ID to write countdown message into
     * @param {number} remainingMs
     * @param {string} key        - same key used in `attempt()`
     */
    function startCountdown(errorElId, remainingMs, key) {
        clearInterval(timers[key]);
        let secs = Math.ceil(remainingMs / 1000);

        const el = $(errorElId);
        if (!el) return;

        // Add pulsing amber style for countdown
        el.classList.add('counting');

        function update() {
            el.textContent = `Please wait ${secs}s before trying again.`;
            el.style.display = '';
            if (secs <= 0) {
                clearInterval(timers[key]);
                el.textContent = '';
                el.style.display = 'none';
                el.classList.remove('counting');
            }
            secs--;
        }
        update();
        timers[key] = setInterval(update, 1000);
    }

    /**
     * Convert a 429 / rate-limit response into a user-friendly message,
     * optionally starting a cooldown in the UI.
     * @param {object} data         - parsed JSON body from server
     * @param {string} errorElId    - element to show message in
     * @param {string} key          - rate-limiter key to reset + countdown
     */
    function handle429(data, errorElId, key) {
        // Force a long client-side cooldown so user can't hammer server
        cooldowns[key] = Date.now() + (10 * 60 * 1000) - 5000; // ~10 min
        let msg = 'Too many attempts detected. Please wait a few minutes and try again.';
        if (data && data.code === 'too_many_attempts') msg = data.message || msg;
        showFieldErr(errorElId, msg);
        // Show a 60-second visual cooldown so user knows to wait
        startCountdown(errorElId, 60000, key + '_429');
    }

    return { attempt, startCountdown, handle429 };
})();

// ══════════════════════════════════════════════════════════════
// INPUT VALIDATORS (run BEFORE any API call)
// ══════════════════════════════════════════════════════════════
const Validate = {
    phone(val, errId) {
        if (!val || !val.trim()) { showFieldErr(errId, 'Phone number is required.'); return false; }
        if (!/^\d{10}$/.test(val.trim())) { showFieldErr(errId, 'Enter a valid 10-digit mobile number.'); return false; }
        return true;
    },
    password(val, errId, minLen = 6) {
        if (!val) { showFieldErr(errId, 'Password is required.'); return false; }
        if (val.length < minLen) { showFieldErr(errId, `Password must be at least ${minLen} characters.`); return false; }
        return true;
    },
    username(val, errId) {
        if (!val || !val.trim()) { showFieldErr(errId, 'Full name is required.'); return false; }
        if (val.trim().length < 2) { showFieldErr(errId, 'Name must be at least 2 characters.'); return false; }
        return true;
    },
    amount(val, errId, balance = null) {
        const n = parseFloat(val);
        if (!val || isNaN(n) || n <= 0) { showFieldErr(errId, 'Enter a valid positive amount.'); return false; }
        if (n < 1) { showFieldErr(errId, 'Minimum amount is ₹1.'); return false; }
        if (balance !== null && n > balance) {
            showFieldErr(errId, `Insufficient balance. Available: ₹${formatINR(balance)}`); return false;
        }
        return true;
    },
};

// ─── API ────────────────────────────────────────────────────────
const API = {
    async request(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

        let res, data;
        try {
            res = await fetch('/api' + path, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
            data = await res.json();
        } catch {
            return { ok: false, status: 0, data: { message: 'Network error. Please check your connection.' } };
        }

        // Auto-logout on expired JWT (but don't loop)
        if (res.status === 401 && !options._noAutoLogout) {
            doLogout(true);
        }

        return { ok: res.ok, status: res.status, data };
    },
    post: (path, body) => API.request(path, { method: 'POST', body }),
    get: (path) => API.request(path, { method: 'GET' }),
};

// ─── Toast ──────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = 'info') {
    const t = $('toast');
    clearTimeout(_toastTimer);
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
    t.className = `toast show toast-${type}`;
    t.innerHTML = `<i class="fa-solid ${icons[type] || 'fa-circle-info'}"></i> ${msg}`;
    _toastTimer = setTimeout(() => (t.className = 'toast'), 4500);
}

// ─── Page routing ───────────────────────────────────────────────
function showPage(pageId) {
    qa('.page').forEach(p => p.classList.remove('active'));
    const page = $(`page-${pageId}`);
    if (page) page.classList.add('active');
    window.scrollTo(0, 0);

    // Dynamic Chatbot Visibility: Show on dashboard, hide on Auth pages
    const isAuthPage = pageId === 'login' || pageId === 'register';
    if (typeof setChatbotVisibility === 'function') {
        setChatbotVisibility(!isAuthPage);
    } else {
        // Safety: If script hasn't loaded yet, set a style on body
        document.body.classList.toggle('hide-chatbot', isAuthPage);
    }
}

// ─── Modal helpers ──────────────────────────────────────────────
function openModal(id) { $(id).style.display = ''; }
function closeModal(id) { $(id).style.display = 'none'; }

// ─── Button loading state ───────────────────────────────────────
/**
 * Enable/disable a submit button and toggle spinner text.
 * While loading=true the button is fully inert (no clicks possible).
 */
function setLoading(btn, loading) {
    btn.disabled = loading;
    // Use pointer-events as extra guard for CSS-based clicks
    btn.style.pointerEvents = loading ? 'none' : '';
    q('.btn-text', btn).style.display = loading ? 'none' : '';
    q('.btn-loader', btn).style.display = loading ? '' : 'none';
}

// ─── Inline messages ────────────────────────────────────────────
function showFieldErr(id, msg) {
    const el = $(id); if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
}
function showFieldOk(id, msg) {
    const el = $(id); if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
}
function clearFormMessages(...ids) {
    ids.forEach(id => { showFieldErr(id, ''); showFieldOk(id, ''); });
}

// ─── Greeting ──────────────────────────────────────────────────
function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good Morning,' : h < 17 ? 'Good Afternoon,' : 'Good Evening,';
}

// ─── Number formatters ──────────────────────────────────────────
function formatINR(n) {
    return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function formatDate(ts) {
    if (!ts) return '--';
    const d = new Date(ts + (ts.includes('T') ? '' : ' UTC'));
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a raw 10-digit account number for display.
 * '4501123456' → 'SBK 4501 123456'
 */
function formatAcctNum(raw) {
    if (!raw) return '--';
    const s = String(raw).replace(/\D/g, ''); // digits only
    if (s.length === 10) return `SBK ${s.slice(0, 4)} ${s.slice(4)}`;
    return raw; // return as-is if unexpected length
}

/**
 * Update every account-number display element and rewire the copy button.
 * Call this whenever account number is known/changes.
 */
function setAccountNumber(raw) {
    const formatted = formatAcctNum(raw);

    // Dashboard balance-card chip
    const chip = $('account-number-display');
    if (chip) chip.textContent = formatted;

    // Balance modal
    const bm = $('modal-balance-acct');
    if (bm) bm.textContent = formatted;

    // Profile modal
    const pm = $('profile-modal-acct');
    if (pm) pm.textContent = formatted;

    // Copy button
    const copyBtn = $('copy-acct-btn');
    if (copyBtn && raw) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(raw).then(() => {
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                copyBtn.style.color = '#10b981';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                    copyBtn.style.color = '';
                }, 2000);
            }).catch(() => showToast('Could not copy. Please copy manually.', 'error'));
        };
    }
}

// ─── Password visibility toggle ─────────────────────────────────
function wireToggle(btnId, inputId) {
    const btn = $(btnId), inp = $(inputId);
    if (!btn || !inp) return;
    btn.addEventListener('click', () => {
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = show ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
}

// ─── Password strength indicator ────────────────────────────────
function pwdStrength(p) {
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
}

// ══════════════════════════════════════════════════════════════
// REGISTER
// ══════════════════════════════════════════════════════════════
function initRegister() {
    const form = $('register-form');
    const pwdIn = $('reg-password');
    const strBox = $('password-strength');
    const fill = $('strength-fill');
    const slabel = $('strength-label');
    const btn = $('register-btn');

    wireToggle('toggle-reg-pwd', 'reg-password');
    wireToggle('toggle-reg-confirm-pwd', 'reg-confirm-password');

    // Password strength UI
    pwdIn.addEventListener('input', () => {
        const v = pwdIn.value;
        if (!v) { strBox.style.display = 'none'; return; }
        strBox.style.display = 'flex';
        const s = pwdStrength(v);
        const pcts = ['0%', '25%', '50%', '75%', '100%'];
        const colors = ['#f43f5e', '#f97316', '#f59e0b', '#22c55e', '#10b981'];
        const names = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
        fill.style.width = pcts[s];
        fill.style.background = colors[s];
        slabel.textContent = names[s];
        slabel.style.color = colors[s];
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormMessages('register-error', 'register-success');

        const username = $('reg-username').value.trim();
        const phone = $('reg-phone').value.trim();
        const password = $('reg-password').value;
        const confirmPassword = $('reg-confirm-password').value;

        // ── 1. Full client-side validation BEFORE any network call ──
        if (!Validate.username(username, 'register-error')) return;
        if (!Validate.phone(phone, 'register-error')) return;
        if (!Validate.password(password, 'register-error')) return;
        if (password !== confirmPassword) {
            return showFieldErr('register-error', 'Passwords do not match.');
        }

        // ── 2. Client-side rate limit check (5-second cooldown) ─────
        const rl = RateLimiter.attempt('register', 5000);
        if (!rl.allowed) {
            RateLimiter.startCountdown('register-error', rl.remainingMs, 'register');
            return;
        }

        // ── 3. Disable button & show spinner ────────────────────────
        setLoading(btn, true);

        // ── 4. API call ─────────────────────────────────────────────
        const { ok, status, data } = await API.post('/register', { username, phone, password, confirmPassword });

        setLoading(btn, false);

        // ── 5. Handle response ──────────────────────────────────────
        if (status === 429) {
            RateLimiter.handle429(data, 'register-error', 'register');
            return;
        }
        if (!ok) {
            showFieldErr('register-error', data.message || 'Registration failed. Please try again.');
            return;
        }

        // ── 6. Success ──────────────────────────────────────────────
        showFieldOk('register-success', `✅ ${data.message}`);
        showToast('Account created! Please sign in.', 'success');

        setTimeout(() => {
            $('login-phone').value = phone;
            form.reset();
            strBox.style.display = 'none';
            showPage('login');
            $('login-password').focus();
        }, 1600);
    });

    $('go-to-login').addEventListener('click', () => showPage('login'));
}

// ══════════════════════════════════════════════════════════════
// LOGIN — Phone + Password
// ══════════════════════════════════════════════════════════════
function initLogin() {
    const form = $('login-form');
    const btn = $('login-btn');

    wireToggle('toggle-login-pwd', 'login-password');

    // Restore phone if saved from previous session
    const savedPhone = localStorage.getItem('sb_last_phone');
    if (savedPhone) $('login-phone').value = savedPhone;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormMessages('login-error');

        const phone = $('login-phone').value.trim();
        const password = $('login-password').value;

        // ── 1. Client-side validation BEFORE network call ───────────
        if (!Validate.phone(phone, 'login-error')) return;
        if (!Validate.password(password, 'login-error')) return;

        // ── 2. Client-side rate limit (5-second cooldown) ───────────
        const rl = RateLimiter.attempt('login', 5000);
        if (!rl.allowed) {
            RateLimiter.startCountdown('login-error', rl.remainingMs, 'login');
            return;
        }

        // ── 3. Disable button immediately — prevent double submit ────
        setLoading(btn, true);

        // ── 4. API call ─────────────────────────────────────────────
        const { ok, status, data } = await API.post('/login', { phone, password });

        setLoading(btn, false);

        // ── 5. Handle response ──────────────────────────────────────
        if (status === 429) {
            // Server-side rate limit hit — show clean custom message + countdown
            RateLimiter.handle429(data, 'login-error', 'login');
            return;
        }
        if (!ok) {
            showFieldErr('login-error', data.message || 'Invalid phone number or password. Please try again.');
            return;
        }

        // ── 6. Success ──────────────────────────────────────────────
        state.token = data.token;
        state.user = data.user;
        localStorage.setItem('sb_token', data.token);
        localStorage.setItem('sb_last_phone', phone);

        $('login-password').value = '';
        loadDashboard();
    });

    $('go-to-register').addEventListener('click', () => showPage('register'));
}

// ══════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════
function doLogout(expired = false) {
    state.token = null;
    state.user = null;
    state.balance = null;
    state.transactions = [];
    localStorage.removeItem('sb_token');
    API.post('/logout', {}).catch(() => { });
    if (typeof setChatbotVisibility === 'function') setChatbotVisibility(false);
    showPage('login');
    clearFormMessages('login-error');
    showToast(
        expired ? 'Session expired. Please sign in again.' : 'Logged out successfully.',
        expired ? 'error' : 'info'
    );
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
async function loadDashboard() {
    showPage('dashboard');
    $('welcome-greeting').textContent = greeting();
    if (state.user) {
        $('welcome-name').textContent = state.user.username;
        $('nav-username').textContent = state.user.username;
        $('nav-avatar').textContent = state.user.username.charAt(0).toUpperCase();
        $('account-phone').textContent = `+91 ${state.user.phone}`;
        if (state.user.accountNumber) setAccountNumber(state.user.accountNumber);
    }
    await Promise.all([fetchBalance(), fetchTransactions()]);
}

async function fetchBalance() {
    const { ok, data } = await API.get('/balance');
    if (!ok) { showToast('Could not fetch balance.', 'error'); return; }
    state.balance = data.balance;
    if (state.user) {
        state.user.username = data.username;
        state.user.phone = data.phone;
        state.user.accountNumber = data.accountNumber;
    }
    $('account-phone').textContent = `+91 ${data.phone}`;
    $('nav-username').textContent = data.username;
    $('nav-avatar').textContent = data.username.charAt(0).toUpperCase();
    $('welcome-name').textContent = data.username;
    $('avail-balance-value').textContent = `₹${formatINR(data.balance)}`;
    if (data.accountNumber) setAccountNumber(data.accountNumber);
    renderBalance();
}

function renderBalance() {
    if (state.balance === null) return;
    $('balance-value').textContent = state.balanceVisible ? formatINR(state.balance) : '••••••';
}

function initBalanceToggle() {
    $('balance-toggle').addEventListener('click', () => {
        state.balanceVisible = !state.balanceVisible;
        $('balance-toggle').innerHTML = state.balanceVisible
            ? '<i class="fa-solid fa-eye"></i>'
            : '<i class="fa-solid fa-eye-slash"></i>';
        renderBalance();
    });
}

// ─── Transactions ────────────────────────────────────────────
async function fetchTransactions() {
    const { ok, data } = await API.get('/transactions');
    if (!ok) { showToast('Could not load transactions.', 'error'); return; }
    state.transactions = data.transactions || [];
    updateStats();
    renderTransactions();
}

function updateStats() {
    let deposited = 0, sent = 0, received = 0;
    state.transactions.forEach(t => {
        const a = parseFloat(t.amount);
        if (t.direction === 'deposit') deposited += a;
        else if (t.direction === 'debit') sent += a;
        else if (t.direction === 'credit') received += a;
    });
    $('stat-deposited').textContent = `₹${formatINR(deposited)}`;
    $('stat-sent').textContent = `₹${formatINR(sent)}`;
    $('stat-received').textContent = `₹${formatINR(received)}`;
    $('stat-txns').textContent = state.transactions.length;
}

function renderTransactions() {
    const list = $('transactions-list');
    const filter = state.txFilter;
    const filtered = filter === 'all'
        ? state.transactions
        : state.transactions.filter(t => t.direction === filter);

    if (!filtered.length) {
        const msgs = {
            all: { icon: 'fa-receipt', title: 'No transactions yet', sub: 'Add money or send to get started' },
            deposit: { icon: 'fa-arrow-down-circle', title: 'No deposits yet', sub: 'Tap "Add Money" to deposit' },
            debit: { icon: 'fa-paper-plane', title: 'No sent transactions', sub: 'Tap "Send Money" to transfer' },
            credit: { icon: 'fa-inbox', title: 'No received transactions', sub: 'Ask someone to send you money' },
        };
        const m = msgs[filter] || msgs.all;
        list.innerHTML = `<div class="empty-state"><i class="fa-solid ${m.icon}"></i><p>${m.title}</p><span>${m.sub}</span></div>`;
        return;
    }

    list.innerHTML = filtered.map(t => {
        const dir = t.direction;
        const amt = parseFloat(t.amount);
        const icon = dir === 'debit' ? 'fa-arrow-up-circle' : 'fa-arrow-down-circle';
        const sign = dir === 'debit' ? '-' : '+';
        const amtClass = dir === 'debit' ? 'debit' : 'credit';
        const typeLabel = dir === 'deposit' ? 'Deposit' : dir === 'debit' ? 'Sent' : 'Received';
        const partyText = dir === 'deposit'
            ? 'Self Deposit'
            : dir === 'debit'
                ? `To: ${t.party_name || t.party_phone || 'Unknown'}`
                : `From: ${t.party_name || t.party_phone || 'Unknown'}`;

        return `
      <div class="transaction-item">
        <div class="transaction-item__left">
          <div class="tx-icon ${dir}"><i class="fa-solid ${icon}"></i></div>
          <div class="tx-info">
            <span class="tx-party">${partyText}</span>
            <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
              <span class="tx-type-badge ${dir}">${typeLabel}</span>
              <span class="tx-date">${formatDate(t.timestamp)}</span>
            </div>
          </div>
        </div>
        <span class="tx-amount ${amtClass}">${sign}₹${formatINR(amt)}</span>
      </div>`;
    }).join('');
}

function initTransactionFilters() {
    $('tx-filter-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.tx-tab');
        if (!tab) return;
        qa('.tx-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.txFilter = tab.dataset.filter;
        renderTransactions();
    });
}

// ══════════════════════════════════════════════════════════════
// ADD MONEY MODAL
// ══════════════════════════════════════════════════════════════
function initAddMoney() {
    const modal = $('add-money-modal');
    const form = $('add-money-form');
    const submitBtn = $('add-money-submit-btn');
    const amtInput = $('deposit-amount');

    $('add-money-btn').addEventListener('click', () => {
        clearFormMessages('add-money-error', 'add-money-success');
        form.reset();
        openModal('add-money-modal');
        setTimeout(() => amtInput.focus(), 100);
    });
    $('close-add-money-modal').addEventListener('click', () => closeModal('add-money-modal'));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('add-money-modal'); });

    qa('.quick-amt-btn', form).forEach(b => {
        b.addEventListener('click', () => { amtInput.value = b.dataset.amount; amtInput.focus(); });
    });

    qa('.deposit-method', modal).forEach(m => {
        m.addEventListener('click', () => {
            qa('.deposit-method', modal).forEach(x => x.classList.remove('active'));
            m.classList.add('active');
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormMessages('add-money-error', 'add-money-success');

        const amount = parseFloat(amtInput.value);

        // Client-side validation
        if (!Validate.amount(amtInput.value, 'add-money-error')) return;
        if (amount > 10000000) return showFieldErr('add-money-error', 'Maximum single deposit is ₹1,00,00,000.');

        setLoading(submitBtn, true);
        const { ok, status, data } = await API.post('/deposit', { amount });
        setLoading(submitBtn, false);

        if (status === 429) { RateLimiter.handle429(data, 'add-money-error', 'deposit'); return; }
        if (!ok) { showFieldErr('add-money-error', data.message || 'Deposit failed.'); return; }

        showFieldOk('add-money-success', `✅ ${data.message}`);
        showToast(data.message, 'success');
        state.balance = data.newBalance;
        $('avail-balance-value').textContent = `₹${formatINR(data.newBalance)}`;
        renderBalance();
        await fetchTransactions();
        setTimeout(() => { closeModal('add-money-modal'); form.reset(); }, 1800);
    });
}

// ══════════════════════════════════════════════════════════════
// SEND MONEY MODAL
// ══════════════════════════════════════════════════════════════
function initTransfer() {
    const modal = $('transfer-modal');
    const form = $('transfer-form');
    const submitBtn = $('transfer-submit-btn');
    const phoneInput = $('receiver-phone');
    const amtInput = $('transfer-amount');
    let lookupTimer;

    $('transfer-btn').addEventListener('click', () => {
        clearFormMessages('transfer-error', 'transfer-success');
        form.reset();
        $('receiver-lookup').style.display = 'none';
        $('avail-balance-value').textContent = state.balance !== null ? `₹${formatINR(state.balance)}` : '₹--';
        openModal('transfer-modal');
        setTimeout(() => phoneInput.focus(), 100);
    });
    $('close-transfer-modal').addEventListener('click', () => closeModal('transfer-modal'));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal('transfer-modal'); });

    qa('.quick-amt-btn', form).forEach(b => {
        b.addEventListener('click', () => { amtInput.value = b.dataset.amount; amtInput.focus(); });
    });

    // Receiver preview (debounced, 500ms)
    phoneInput.addEventListener('input', () => {
        clearTimeout(lookupTimer);
        $('receiver-lookup').style.display = 'none';
        const phone = phoneInput.value.trim();
        if (!/^\d{10}$/.test(phone)) return;
        lookupTimer = setTimeout(() => {
            $('receiver-avatar').textContent = '?';
            $('receiver-name-display').textContent = '...';
            $('receiver-phone-display').textContent = `+91 ${phone}`;
            $('receiver-lookup').style.display = 'flex';
        }, 500);
    });

    // Live self-send warning
    phoneInput.addEventListener('blur', () => {
        const phone = phoneInput.value.trim();
        if (state.user && phone && phone === state.user.phone) {
            showFieldErr('transfer-error', 'You cannot send money to yourself.');
        } else {
            showFieldErr('transfer-error', '');
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormMessages('transfer-error', 'transfer-success');

        const receiverPhone = phoneInput.value.trim();
        const amount = parseFloat(amtInput.value);

        // Client-side validation
        if (!Validate.phone(receiverPhone, 'transfer-error')) return;
        if (state.user && receiverPhone === state.user.phone) {
            return showFieldErr('transfer-error', 'You cannot send money to yourself.');
        }
        if (!Validate.amount(amtInput.value, 'transfer-error', state.balance)) return;

        setLoading(submitBtn, true);
        const { ok, status, data } = await API.post('/transfer', { receiverPhone, amount });
        setLoading(submitBtn, false);

        if (status === 429) { RateLimiter.handle429(data, 'transfer-error', 'transfer'); return; }
        if (!ok) { showFieldErr('transfer-error', data.message || 'Transfer failed.'); return; }

        if (data.receiverName) {
            $('receiver-avatar').textContent = data.receiverName.charAt(0).toUpperCase();
            $('receiver-name-display').textContent = data.receiverName;
            $('receiver-phone-display').textContent = `+91 ${receiverPhone}`;
            $('receiver-lookup').style.display = 'flex';
        }

        showFieldOk('transfer-success', `✅ ${data.message}`);
        showToast(data.message, 'success');
        state.balance = data.newBalance;
        $('avail-balance-value').textContent = `₹${formatINR(data.newBalance)}`;
        renderBalance();
        await fetchTransactions();
        setTimeout(() => { closeModal('transfer-modal'); form.reset(); $('receiver-lookup').style.display = 'none'; }, 2000);
    });
}

// ══════════════════════════════════════════════════════════════
// BALANCE MODAL
// ══════════════════════════════════════════════════════════════
function initBalanceModal() {
    $('check-balance-btn').addEventListener('click', async () => {
        openModal('balance-modal');
        $('modal-balance-value').textContent = '…';
        const { ok, data } = await API.get('/balance');
        if (!ok) { closeModal('balance-modal'); showToast('Could not fetch balance.', 'error'); return; }
        $('modal-balance-value').textContent = formatINR(data.balance);
        $('modal-balance-name').textContent = data.username;
        $('modal-balance-phone').textContent = `+91 ${data.phone}`;
        if (data.accountNumber) {
            $('modal-balance-acct').textContent = formatAcctNum(data.accountNumber);
            setAccountNumber(data.accountNumber);
        }
        state.balance = data.balance;
        renderBalance();
    });
    $('close-balance-modal').addEventListener('click', () => closeModal('balance-modal'));
    $('close-balance-modal-btn').addEventListener('click', () => closeModal('balance-modal'));
    $('balance-modal').addEventListener('click', e => { if (e.target === $('balance-modal')) closeModal('balance-modal'); });
}

// ══════════════════════════════════════════════════════════════
// PROFILE MODAL
// ══════════════════════════════════════════════════════════════
function initProfile() {
    $('profile-btn').addEventListener('click', async () => {
        openModal('profile-modal');
        const { ok, data } = await API.get('/user');
        if (!ok) { closeModal('profile-modal'); showToast('Could not load profile.', 'error'); return; }
        const u = data.user;
        $('profile-modal-name').textContent = u.username;
        $('profile-modal-phone').textContent = `+91 ${u.phone}`;
        $('profile-modal-balance').textContent = `₹${formatINR(u.balance)}`;
        $('profile-avatar-large').textContent = u.username.charAt(0).toUpperCase();
        $('profile-modal-acct').textContent = formatAcctNum(u.accountNumber);
        if (u.accountNumber) setAccountNumber(u.accountNumber);
        const since = new Date(u.created_at + ' UTC');
        $('profile-modal-since').textContent = since.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    });
    $('close-profile-modal').addEventListener('click', () => closeModal('profile-modal'));
    $('profile-modal').addEventListener('click', e => { if (e.target === $('profile-modal')) closeModal('profile-modal'); });
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD MISC
// ══════════════════════════════════════════════════════════════
function initDashboardMisc() {
    $('logout-btn').addEventListener('click', () => doLogout());

    $('refresh-balance-btn').addEventListener('click', async () => {
        $('refresh-balance-btn').disabled = true;
        await Promise.all([fetchBalance(), fetchTransactions()]);
        $('refresh-balance-btn').disabled = false;
        showToast('Data refreshed.', 'info');
    });

    $('view-all-transactions').addEventListener('click', async () => {
        await fetchTransactions();
        showToast('Transactions refreshed.', 'info');
    });
}

// ══════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    initRegister();
    initBalanceToggle();
    initTransactionFilters();
    initAddMoney();
    initTransfer();
    initBalanceModal();
    initProfile();
    initDashboardMisc();

    // Auto-login from stored token
    const saved = localStorage.getItem('sb_token');
    if (saved) {
        state.token = saved;
        API.request('/user', { method: 'GET', _noAutoLogout: true }).then(({ ok, data }) => {
            if (ok && data.user) {
                state.user = data.user;
                loadDashboard();
            } else {
                localStorage.removeItem('sb_token');
                showPage('login');
            }
        }).catch(() => showPage('login'));
    } else {
        showPage('login');
    }
});
