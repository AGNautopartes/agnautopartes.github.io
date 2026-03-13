import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

// En el backend (Vercel API), PRIORIZAMOS la Service Role Key para saltar RLS
// En el frontend (si se usara), usaríamos la Anon Key.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabaseKey = serviceKey || anonKey;

if (!supabaseUrl) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL no configurada.');
}

if (!supabaseKey) {
    console.error('❌ Error: No se encontró SUPABASE_SERVICE_ROLE_KEY ni ANON_KEY.');
} else if (!serviceKey) {
    console.warn('⚠️ Warning: Usando ANON_KEY en el backend. RLS podría bloquear operaciones si no se configuran políticas.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;

