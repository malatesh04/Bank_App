require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./src/routes/auth');
const bankRoutes = require('./src/routes/bank');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Security Middleware ───────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        }
    }
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,  // 10-minute window
    max: 15,                    // 15 attempts per window (generous for dev, protective for prod)
    statusCode: 429,
    standardHeaders: true,      // sends Retry-After header
    legacyHeaders: false,
    message: {
        success: false,
        code: 'too_many_attempts',
        message: 'Too many attempts detected. Please wait a few minutes and try again.'
    }
});

app.use(generalLimiter);
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:3000',
    'https://bank-app-sandy-pi.vercel.app'
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        callback(new Error('CORS: Origin not allowed'));
    },
    credentials: true
}));

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// ─── Static Files (Frontend) ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', bankRoutes);

// ─── SPA Fallback (serve index.html for all non-API routes) ───────────────
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ success: false, message: 'API endpoint not found.' });
    }
});

// ─── Global Error Handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, message: 'An unexpected error occurred.' });
});

// ─── Start Server (local dev only — Vercel handles this in production) ────
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`\n🏦 State Bank of Karnataka — API Server running on http://localhost:${PORT}`);
        console.log(`📊 Dashboard: http://localhost:${PORT}`);
        console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    });
}

// Export for Vercel serverless
module.exports = app;
