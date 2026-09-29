import supabase from '../../supabase-client.js';
import { setJWTCookie, clearJWTCookie, authMiddleware } from '../../middleware/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const ip = req.ip || req.socket.remoteAddress;
    const { password } = req.body || {};

    // Rate limiting
    const rateCheck = authMiddleware.checkRateLimit(ip, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
        return res.status(429).json({
            message: 'Demasiados intentos. Intente en 15 minutos.',
            retryAfter: rateCheck.retryAfter,
        });
    }

    // Validar password
    let isAuthed = false;
    const passEnv = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;

    if (password === passEnv) {
        isAuthed = true;
    } else {
        // Fallback DB
        try {
            const { data: user } = await supabase
                .from('admin_users')
                .select('username')
                .eq('password_hash', password)
                .eq('is_active', true)
                .maybeSingle();
            if (user) isAuthed = true;
        } catch (e) {
            console.error("Supabase admin auth error:", e);
        }
    }

    if (!isAuthed) {
        return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Generar JWT
    const jwtToken = authMiddleware.generateJWT({ admin: true }, '1h');

    // Establecer cookie httpOnly
    setJWTCookie(res, jwtToken);

    return res.status(200).json({
        message: 'Login exitoso',
        token: jwtToken,
    });
}

// Logout
export function logout(req, res) {
    clearJWTCookie(res);
    return res.status(200).json({ message: 'Sesión cerrada' });
}