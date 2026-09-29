import { createHash } from 'crypto';

// Rate limit storage (en producción: Redis/Memcached)
const rateLimit = new Map();

export function checkRateLimit(ip, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const attempts = rateLimit.get(ip) || [];

    const recentAttempts = attempts.filter(t => now - t < windowMs);

    if (recentAttempts.length >= maxAttempts) {
        return {
            allowed: false,
            retryAfter: Math.max(...recentAttempts) + windowMs - now,
        };
    }

    recentAttempts.push(now);
    rateLimit.set(ip, recentAttempts);

    return { allowed: true };
}

export function generateJWT(payload, expiresIn = '1h') {
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const now = Math.floor(Date.now() / 1000);

    const payloadSection = JSON.stringify({
        ...payload,
        iat: now,
        exp: now + parseInt(expiresIn) || 3600,
    });

    // Simplificado: usar solo header+payload sin firma compleja
    // En producción usar: npm i jsonwebtoken
    const signature = createHash('sha256')
        .update(`${header}.${payloadSection}.${adminPassword}`)
        .digest('base64');

    return `${header}.${payloadSection}.${signature}`;
}

export function verifyJWT(token, adminPassword) {
    try {
        const [headerB64, payloadB64, signatureB64] = token.split('.');

        if (!headerB64 || !payloadB64 || !signatureB64) {
            return { valid: false, error: 'Token inválido' };
        }

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf-8'));

        // Verificar firma simplificada
        const expectedSig = createHash('sha256')
            .update(`${headerB64}.${payloadB64}.${adminPassword}`)
            .digest('base64');

        const isValid = signatureB64 === expectedSig;

        if (!isValid) {
            return { valid: false, error: 'Firma inválida' };
        }

        return {
            valid: true,
            payload,
        };
    } catch (e) {
        return { valid: false, error: 'Error decodificando token' };
    }
}

export function authMiddleware(handler) {
    return async function (req, res) {
        const ip = req.ip || req.socket.remoteAddress;

        // Rate limiting
        const rateCheck = checkRateLimit(ip, 5, 15 * 60 * 1000);
        if (!rateCheck.allowed) {
            return res.status(429).json({
                message: 'Demasiados intentos. Intente en 15 minutos.',
                retryAfter: rateCheck.retryAfter,
            });
        }

        // Intentar JWT primero, fallback a header x-admin-password
        let authValid = false;

        const jwtToken = req.cookies?.['agn-admin-token'];
        if (jwtToken) {
            const result = verifyJWT(jwtToken, req.headers['x-admin-password'] || '');
            if (result.valid) {
                authValid = true;
            }
        }

        if (!authValid) {
            const headerPwd = req.headers['x-admin-password'];
            if (headerPwd) {
                authValid = headerPwd === (process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN);
            }
        }

        if (!authValid) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        return handler(req, res);
    };
}

export function setJWTCookie(res, jwtToken) {
    res.cookie('agn-admin-token', jwtToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 1000, // 1 hora
        path: '/',
    });
}

export function clearJWTCookie(res) {
    res.cookie('agn-admin-token', '', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict',
        maxAge: 0,
        path: '/',
    });
}