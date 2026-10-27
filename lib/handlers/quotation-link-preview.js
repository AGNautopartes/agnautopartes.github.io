import { lookup } from 'node:dns/promises';
import net from 'node:net';
import supabase from '../../supabase-client.js';

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 512 * 1024;

const authenticate = async password => {
    const configured = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    if (configured && password === configured) return true;
    if (!password) return false;
    const { data } = await supabase.from('admin_users').select('username')
        .eq('password_hash', password).eq('is_active', true).maybeSingle();
    return Boolean(data);
};

const isPrivateIpv4 = address => {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
};

const isPrivateAddress = address => {
    if (net.isIP(address) === 4) return isPrivateIpv4(address);
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
        normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
        normalized.startsWith('fea') || normalized.startsWith('feb');
};

const validatePublicUrl = async rawUrl => {
    let url;
    try { url = new URL(rawUrl); } catch { throw new Error('El enlace no es válido'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
        throw new Error('Solo se permiten enlaces HTTP o HTTPS públicos');
    }
    if (url.port && !['80', '443'].includes(url.port)) throw new Error('El puerto del enlace no está permitido');
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(record => isPrivateAddress(record.address))) {
        throw new Error('El enlace debe apuntar a una dirección pública');
    }
    return url;
};

const metaContent = (html, property) => {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
        new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
    ];
    const match = patterns.map(pattern => html.match(pattern)).find(Boolean);
    return match?.[1]?.replace(/&amp;/g, '&').trim() || '';
};

const htmlText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600);

const readBody = async response => {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BODY_BYTES) throw new Error('La página supera el tamaño permitido para previsualizar');
        chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
};

const fetchPublicPage = async rawUrl => {
    let url = await validatePublicUrl(rawUrl);
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);
        let response;
        try {
            response = await fetch(url, {
                redirect: 'manual', signal: controller.signal,
                headers: { 'User-Agent': 'AGN-ERP-Quotation-Preview/1.0', Accept: 'text/html,application/xhtml+xml' }
            });
        } finally { clearTimeout(timeout); }
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location || attempt === MAX_REDIRECTS) throw new Error('Demasiadas redirecciones en el enlace');
            url = await validatePublicUrl(new URL(location, url).toString());
            continue;
        }
        if (!response.ok) throw new Error(`No fue posible leer el enlace (${response.status})`);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            throw new Error('El enlace no corresponde a una página de producto');
        }
        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_BODY_BYTES) throw new Error('La página supera el tamaño permitido para previsualizar');
        return { url: url.toString(), html: await readBody(response) };
    }
    throw new Error('No fue posible leer el enlace');
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message: 'Método no permitido' });
    if (!await authenticate(req.headers['x-admin-password'])) return res.status(401).json({ message: 'No autorizado' });
    try {
        const { url } = req.body || {};
        const page = await fetchPublicPage(url);
        const title = htmlText(metaContent(page.html, 'og:title') || page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
        const description = htmlText(metaContent(page.html, 'og:description') || metaContent(page.html, 'description'));
        const image = metaContent(page.html, 'og:image');
        const imageUrl = image ? new URL(image, page.url).toString() : '';
        return res.status(200).json({ data: { url: page.url, title, description, image_url: imageUrl } });
    } catch (error) {
        return res.status(422).json({ message: error.message || 'No fue posible previsualizar el enlace' });
    }
}
