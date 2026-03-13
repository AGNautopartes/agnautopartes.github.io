/**
 * AGN Autopartes — SCRIPT DE VERIFICACIÓN DE SEGURIDAD (RLS)
 * 
 * PROPÓSITO: Verificar que las tablas de la base de datos están protegidas
 * por RLS y que no se puede acceder a ellas usando una Anon Key.
 * 
 * INSTRUCCIONES:
 * 1. Asegúrate de tener SUPABASE_URL y SUPABASE_ANON_KEY en tu .env o variables de entorno.
 * 2. Ejecuta: node verify_security.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
    console.error('❌ Error: Faltan variables de entorno (URL o Anon Key).');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

async function testTable(tableName) {
    console.log(`\n🔍 Probando acceso a tabla: ${tableName}...`);
    try {
        const { data, error } = await supabase.from(tableName).select('*').limit(1);
        
        if (error) {
            console.log(`✅ [BLOQUEADO] La base de datos rechazó la consulta (esperado): ${error.message}`);
            return true;
        }
        
        if (data && data.length > 0) {
            console.warn(`❌ [VULNERABLE] Se pudieron leer datos de ${tableName} sin autorización!`);
            return false;
        } else {
            console.log(`✅ [PROTEGIDO] No se devolvieron datos de ${tableName} (RLS activo).`);
            return true;
        }
    } catch (err) {
        console.error(`💥 Error inesperado probando ${tableName}:`, err.message);
        return false;
    }
}

async function runTests() {
    console.log('--- INICIO DE PRUEBAS DE SEGURIDAD (RLS) ---');
    
    const tables = [
        'customers', 
        'orders', 
        'financials', 
        'admin_users', 
        'quotes',
        'order_items'
    ];
    
    let allPassed = true;
    for (const table of tables) {
        const passed = await testTable(table);
        if (!passed) allPassed = false;
    }
    
    console.log('\n------------------------------------------');
    if (allPassed) {
        console.log('🏆 RESULTADO: Todas las tablas están protegidas.');
    } else {
        console.log('⚠️ ADVERTENCIA: Se detectaron tablas vulnerables. Revisa las políticas RLS.');
    }
}

runTests();
