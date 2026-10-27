import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import supabase from '../../supabase-client.js';

// Vercel's response-size limit is approximately 4.5 MB. Keep this bounded.
const MAX_BYTES = 4_500_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT = 8_000;

const forbidden = new net.BlockList();
for (const [address, bits] of [
    ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
    ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24],
    ['192.88.99.0',24], ['192.168.0.0',16], ['198.18.0.0',15],
    ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4]
]) forbidden.addSubnet(address, bits, 'ipv4');

export const isPublicIPv4 = address => net.isIP(address) === 4 && !forbidden.check(address, 'ipv4');

const authenticate = async password => {
    if (!password) return false;
    const configured = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    if (configured && password === configured) return true;
    const { data } = await supabase.from('admin_users').select('username')
        .eq('password_hash', password).eq('is_active', true).maybeSingle();
    return Boolean(data);
};

const resolvePublic = async raw => {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname ||
        (url.port && !['80', '443'].includes(url.port)) || url.hostname.startsWith('[')) {
        throw new Error('Enlace no permitido');
    }
    const records = await lookup(url.hostname, { all:true, family:4 });
    if (!records.length || records.some(record => !isPublicIPv4(record.address))) throw new Error('Destino no permitido');
    return { url, address:records[0].address };
};

const getResponse = ({url, address}) => new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, {
        family:4, agent:false, timeout:REQUEST_TIMEOUT,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: { Accept:'image/jpeg,image/png,image/webp', 'User-Agent':'AGN-ERP-Image/1.0' }
    }, response => resolve(response));
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
});

const identifyImage = buffer => {
    if (buffer.length >= 8 && buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer.length >= 12 && buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP') return 'image/webp';
    throw new Error('El enlace no contiene una imagen compatible');
};

export async function fetchPublicImage(rawUrl) {
    let target = rawUrl;
    for (let n=0; n<=MAX_REDIRECTS; n++) {
        const resolved = await resolvePublic(target);
        const response = await getResponse(resolved);
        if ([301,302,303,307,308].includes(response.statusCode)) {
            const location = response.headers.location;
            response.resume();
            if (!location || n === MAX_REDIRECTS) throw new Error('Redirección no permitida');
            target = new URL(location, resolved.url).toString();
            continue;
        }
        if (response.statusCode !== 200) { response.resume(); throw new Error('No se pudo leer la imagen'); }
        if (Number(response.headers['content-length']) > MAX_BYTES) { response.destroy(); throw new Error('Imagen demasiado grande'); }
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
            size += chunk.length;
            if (size > MAX_BYTES) { response.destroy(); throw new Error('Imagen demasiado grande'); }
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);
        return { buffer, contentType:identifyImage(buffer) };
    }
    throw new Error('No se pudo leer la imagen');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ message:'Método no permitido' });
    if (!await authenticate(req.headers['x-admin-password'])) return res.status(401).json({ message:'No autorizado' });
    try {
        const url = req.body?.url;
        if (typeof url !== 'string' || url.length > 4096) return res.status(400).json({ message:'Enlace inválido' });
        const image = await fetchPublicImage(url);
        res.setHeader('Content-Type', image.contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(image.buffer);
    } catch {
        return res.status(422).json({ message:'No se pudo descargar la imagen. Descárgala y pégala en la cotización.' });
    }
}
