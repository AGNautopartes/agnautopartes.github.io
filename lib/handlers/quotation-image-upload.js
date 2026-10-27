import { randomUUID } from 'node:crypto';
import supabase from '../../supabase-client.js';

const MAX_BYTES = 125 * 1024;
const authenticate = async (password, client) => {
    if (!password) return false;
    const configured = process.env.ADMIN_PASSWORD || process.env.PASSWORD_ADMIN;
    if (configured && password === configured) return true;
    const { data } = await client.from('admin_users').select('username')
        .eq('password_hash', password).eq('is_active', true).maybeSingle();
    return Boolean(data);
};

const storageHost = () => {
    try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL).hostname; }
    catch { return 'proyecto no identificado'; }
};

const describeBucket = async client => {
    if (typeof client.storage.getBucket !== 'function') return 'no se pudo verificar quotation-images';
    try {
        const { data, error } = await client.storage.getBucket('quotation-images');
        if (data) return `Storage reconoce quotation-images (${data.public ? 'público' : 'privado'}), pero rechazó la subida`;
        if (/bucket.*not found|bucket.*no existe/i.test(error?.message || '')) return 'Storage no encuentra quotation-images';
        return 'no se pudo verificar quotation-images con las credenciales del servidor';
    } catch { return 'no se pudo verificar quotation-images'; }
};

export const createQuotationImageUploadHandler = ({ client = supabase, hasServiceRole = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) } = {}) => async (req, res) => {
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) return res.status(405).json({ message:'Método no permitido.' });
    if (!await authenticate(req.headers['x-admin-password'], client)) return res.status(401).json({ message:'No autorizado.' });
    if (!hasServiceRole()) return res.status(503).json({ message:'Falta configurar el acceso del servidor al almacenamiento.' });
    if (req.method === 'GET') {
        try {
            const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL).origin;
            if (new URL(req.url || '/', 'http://localhost').searchParams.get('config') === '1') return res.status(200).json({origin});
            const { data, error } = await client.storage.from('quotation-images').list('', { limit:1000, sortBy:{column:'created_at', order:'desc'} });
            if (error) throw error;
            return res.status(200).json({origin, files:data || [], truncated:(data || []).length === 1000});
        } catch { return res.status(502).json({message:'No se pudo consultar el almacenamiento de imágenes.'}); }
    }
    if (req.method === 'DELETE') {
        const names = req.body?.names;
        if (!Array.isArray(names) || !names.length || names.length > 1000 || names.some(name => typeof name !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(name))) {
            return res.status(400).json({message:'Selección de archivos no válida.'});
        }
        try {
            const { error } = await client.storage.from('quotation-images').remove(names);
            if (error) throw error;
            return res.status(200).json({ok:true});
        } catch { return res.status(502).json({message:'No se pudieron eliminar las imágenes.'}); }
    }
    const image = req.body?.image;
    if (typeof image !== 'string' || image.length > Math.ceil(MAX_BYTES / 3) * 4 + 30 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
        return res.status(400).json({ message:'La imagen debe ser JPEG y pesar hasta 125 KB.' });
    }
    const bytes = Buffer.from(image.slice('data:image/jpeg;base64,'.length), 'base64');
    if (bytes.length > MAX_BYTES || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
        return res.status(400).json({ message:'La imagen JPEG no es válida o supera 125 KB.' });
    }
    try {
        const bucket = client.storage.from('quotation-images');
        const path = `${randomUUID()}.jpg`;
        const { error } = await bucket.upload(path, bytes, { contentType:'image/jpeg', upsert:false });
        if (error) {
            console.error('Error al subir imagen de cotización:', error.statusCode || error.status || error.name);
            if (/bucket.*not found|bucket.*no existe/i.test(error.message || '')) {
                const diagnosis = await describeBucket(client);
                return res.status(503).json({ message:`Servidor: ${storageHost()}. ${diagnosis}.` });
            }
            return res.status(502).json({ message:'El almacenamiento rechazó la imagen. Revisa la configuración de Storage.' });
        }
        const { data } = bucket.getPublicUrl(path);
        if (!data?.publicUrl) throw new Error('No se obtuvo el enlace de la imagen');
        return res.status(200).json({ url:data.publicUrl });
    } catch (error) {
        console.error('Error de almacenamiento de cotización:', error.name);
        return res.status(502).json({ message:'No se pudo conectar con el almacenamiento de imágenes.' });
    }
};

export default createQuotationImageUploadHandler();
