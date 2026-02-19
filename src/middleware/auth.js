const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '1h';

/**
 * Middleware to verify JWT token from Authorization header or cookie
 */
function verifyToken(req, res, next) {
    let token = null;

    // 1. Check Authorization header (Bearer token)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
    }

    // 2. Fallback: check cookie
    if (!token && req.cookies && req.cookies.authToken) {
        token = req.cookies.authToken;
    }

    // 3. Fallback: check body or query
    if (!token) {
        token = req.body?.token || req.query?.token;
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired. Please login again.'
            });
        }
        return res.status(401).json({
            success: false,
            message: 'Invalid token. Please login again.'
        });
    }
}

/**
 * Generate a JWT token for a user
 */
function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

module.exports = { verifyToken, generateToken };
