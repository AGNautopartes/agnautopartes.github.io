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

export const createQuotationImageUploadHandler = ({ client = supabase, hasServiceRole = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) } = {}) => async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ message:'Método no permitido.' });
    if (!await authenticate(req.headers['x-admin-password'], client)) return res.status(401).json({ message:'No autorizado.' });
    if (!hasServiceRole()) return res.status(503).json({ message:'Falta configurar el acceso del servidor al almacenamiento.' });
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
                return res.status(503).json({ message:'No existe el espacio quotation-images en Storage. Revisa su configuración en Supabase.' });
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
