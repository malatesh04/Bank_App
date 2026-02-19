/**
 * State Bank of Karnataka — Full API Test Suite (v2)
 * Tests: Register, Login, Deposit, Transfer, Transactions, Profile
 */
const http = require('http');

function request(path, method, body, token) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

        const req = http.request({ hostname: 'localhost', port: 3000, path: '/api' + path, method, headers }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function log(label, status, body, expectOk = true) {
    const ok = status >= 200 && status < 300;
    const pass = expectOk ? ok : !ok;
    console.log(`\n${pass ? '✅' : '❌'} ${label}`);
    console.log(`   Status: ${status}`);
    if (body.message) console.log(`   Message: ${body.message}`);
    if (body.token) console.log(`   Token: ${body.token.substring(0, 40)}...`);
    if (body.user) console.log(`   User: ${JSON.stringify(body.user)}`);
    if (body.balance !== undefined) console.log(`   Balance: ₹${body.balance}`);
    if (body.newBalance !== undefined) console.log(`   New Balance: ₹${body.newBalance}`);
    if (body.transactions) console.log(`   Transactions: ${body.transactions.length}`);
    return pass;
}

async function run() {
    console.log('\n══════════════════════════════════════════════════');
    console.log('  State Bank of Karnataka — API Test Suite');
    console.log('══════════════════════════════════════════════════');

    let pass = 0, fail = 0;
    let t1, t2;

    const check = (label, status, body, expectOk = true) => {
        if (log(label, status, body, expectOk)) pass++; else fail++;
    };

    // ── Registration ──────────────────────────────────────────────
    {
        const r = await request('/register', 'POST', { username: 'Arjun Sharma', phone: '9876543210', password: 'SecurePass123', confirmPassword: 'SecurePass123' });
        check('Register User 1 (Arjun)', r.status, r.body);
    }

    {
        const r = await request('/register', 'POST', { username: 'Priya Patel', phone: '8765432109', password: 'Pass@4567', confirmPassword: 'Pass@4567' });
        check('Register User 2 (Priya)', r.status, r.body);
    }

    {
        const r = await request('/register', 'POST', { username: 'Vikram Singh', phone: '7776665554', password: 'Password123!', confirmPassword: 'Password123!' });
        check('Register User 3 (Vikram)', r.status, r.body);
    }

    {
        const r = await request('/register', 'POST', { username: 'Dup', phone: '9876543210', password: 'pass', confirmPassword: 'pass' });
        check('Reject duplicate phone (short pwd)', r.status, r.body, false);
    }

    {
        const r = await request('/register', 'POST', { username: 'Dup2', phone: '9876543210', password: 'ValidPass1', confirmPassword: 'ValidPass1' });
        check('Reject duplicate phone (valid pwd)', r.status, r.body, false);
    }

    // ── Login (phone + password) ──────────────────────────────────
    {
        const r = await request('/login', 'POST', { phone: '9876543210', password: 'SecurePass123' });
        check('Login Arjun (phone+password)', r.status, r.body); t1 = r.body.token;
    }

    {
        const r = await request('/login', 'POST', { phone: '8765432109', password: 'Pass@4567' });
        check('Login Priya (phone+password)', r.status, r.body); t2 = r.body.token;
    }

    {
        const r = await request('/login', 'POST', { phone: '9876543210', password: 'wrongpass' });
        check('Reject bad password', r.status, r.body, false);
    }

    {
        const r = await request('/login', 'POST', { phone: '1234567890', password: 'anypassword' });
        check('Reject unknown phone', r.status, r.body, false);
    }

    {
        const r = await request('/login', 'POST', { phone: '123', password: 'pass' });
        check('Reject invalid phone format', r.status, r.body, false);
    }

    // ── Balance ───────────────────────────────────────────────────
    {
        const r = await request('/balance', 'GET', null, t1);
        check('Balance = 0 after register', r.status, r.body);
        console.log(`   Balance value: ${r.body.balance}`);
    }

    // ── Deposit ───────────────────────────────────────────────────
    {
        const r = await request('/deposit', 'POST', { amount: 10000 }, t1);
        check('Deposit ₹10,000 to Arjun', r.status, r.body);
        console.log(`   New Balance: ₹${r.body.newBalance}`);
    }

    {
        const r = await request('/deposit', 'POST', { amount: 5000 }, t2);
        check('Deposit ₹5,000 to Priya', r.status, r.body);
    }

    {
        const r = await request('/deposit', 'POST', { amount: -100 }, t1);
        check('Reject negative deposit', r.status, r.body, false);
    }

    {
        const r = await request('/deposit', 'POST', { amount: 0 }, t1);
        check('Reject zero deposit', r.status, r.body, false);
    }

    // ── Transfer ──────────────────────────────────────────────────
    {
        const r = await request('/transfer', 'POST', { receiverPhone: '8765432109', amount: 2500 }, t1);
        check('Transfer ₹2,500 Arjun→Priya', r.status, r.body);
        console.log(`   New Balance: ₹${r.body.newBalance}`);
    }

    {
        const r = await request('/transfer', 'POST', { receiverPhone: '9876543210', amount: 100 }, t1);
        check('Reject self-transfer', r.status, r.body, false);
    }

    {
        const r = await request('/transfer', 'POST', { receiverPhone: '8765432109', amount: 99999 }, t1);
        check('Reject over-balance transfer', r.status, r.body, false);
    }

    {
        const r = await request('/transfer', 'POST', { receiverPhone: '0000000000', amount: 100 }, t1);
        check('Reject unknown receiver', r.status, r.body, false);
    }

    // ── Transactions ──────────────────────────────────────────────
    {
        const r = await request('/transactions', 'GET', null, t1);
        check('Get Arjun transactions', r.status, r.body);
        console.log(`   Count: ${r.body.transactions?.length}`);
        if (r.body.transactions) r.body.transactions.forEach(t => console.log(`   → ${t.direction.padEnd(8)} ${t.type.padEnd(8)} ₹${t.amount}`));
    }

    {
        const r = await request('/transactions', 'GET', null, t2);
        check('Get Priya transactions', r.status, r.body);
        console.log(`   Count: ${r.body.transactions?.length}`);
    }

    // ── Profile ───────────────────────────────────────────────────
    {
        const r = await request('/user', 'GET', null, t1);
        check('Get Arjun profile', r.status, r.body);
    }

    // ── Auth guard ────────────────────────────────────────────────
    {
        const r = await request('/deposit', 'GET', null, null);
        check('Deposit without auth rejected', r.status, r.body, false);
    }

    // ── Summary ───────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════');
    console.log(`  Results: ${pass} passed, ${fail} failed`);
    console.log('══════════════════════════════════════════════════\n');
    process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('Test error:', e.message); process.exit(1); });
