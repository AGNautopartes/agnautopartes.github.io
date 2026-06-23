# AGN Autopartes ERP - Documentación para Desarrolladores

Sistema de gestión de órdenes de repuestos automotrices con asistente de IA.

## 🏗️ Arquitectura

### Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Frontend** | HTML + CSS puro + JavaScript vanilla (sin frameworks) |
| **Backend** | Node.js + Vercel Serverless Functions |
| **Base de Datos** | Supabase (PostgreSQL) |
| **Hosting** | Vercel (deploy automático desde GitHub) |
| **IA** | Google Gemini + OpenRouter (múltiples modelos) |

### Estructura del Proyecto

```
agnautopartes/
├── admin.html              # Aplicación principal (monolítica, ~3200 líneas)
├── api/                    # Serverless functions de Vercel
│   ├── admin-chat.js       # Endpoint de Aria AI
│   ├── create-order.js     # Crear órdenes
│   ├── update-order-full.js # Actualizar órdenes completas
│   ├── get-all-orders.js   # Obtener todas las órdenes
│   ├── add-note.js         # Agregar notas
│   ├── delete-order.js     # Eliminar órdenes
│   └── get-models.js       # Listar modelos de IA disponibles
├── supabase-client.js      # Cliente de Supabase
├── package.json            # Dependencias (mínimas)
└── vercel.json             # Configuración de Vercel
```

## 🔧 ¿Qué Hace el Sistema?

### Funcionalidades Principales

1. **Gestión de Órdenes de Repuestos**
   - Crear, editar, eliminar órdenes
   - Múltiples ítems por orden (array `items_json`)
   - Tracking de estados (Solicitado → Cotizado → Comprado → Tránsito → Entregado)
   - Alarmas para órdenes críticas

2. **Cálculos Financieros**
   - Landed cost: FOB + Freight Supplier + Customs Nationalization + Other Expenses
   - Margen tipo markdown: `Price = Cost / (1 - Margin)`
   - IVA 15% hardcoded
   - Agregación financiera por orden

3. **Aria - Asistente de IA**
   - Comandos en lenguaje natural en español
   - Acciones: crear órdenes, actualizar status, agregar ítems, agregar notas
   - Parsing inteligente de typos y variaciones ortográficas
   - Voice input/output (Web Speech API)
   - Modelos disponibles: Gemini (Google) + OpenRouter (free/paid)

4. **Reportes**
   - Reporte completo, financiero y de pipeline
   - Filtros por fecha, marca, modelo, status, cliente
   - Exportación a CSV

## 💻 ¿Cómo Lo Hace?

### Flujo de Autenticación

```javascript
// admin.html (líneas ~1653-1705)
async function doLogin() {
    const pwd = document.getElementById('login-pass').value;
    const res = await fetch(`${API}/api/get-all-orders`, {
        headers: { 'x-admin-password': pwd }
    });
    
    if (res.ok) {
        // Login exitoso
        sessionStorage.setItem('agn-admin-logged', 'true');
        sessionStorage.setItem('agn-admin-pass', pwd);
        sessionStorage.setItem('agn-admin-name', name);
    }
}

// Restore de sesión al cargar (líneas ~1551-1570)
if (sessionStorage.getItem('agn-admin-logged') === 'true') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    loadOrdersAndShowApp(); // Carga órdenes con password guardado
}
```

**Persistencia**: 
- `sessionStorage` mantiene sesión mientras el navegador esté abierto
- Se pierde al cerrar navegador completamente
- Logout limpia sessionStorage explícitamente

### Flujo de Creación de Órdenes (Chat)

```
Usuario → "david cordero toyota rav4 1998 necesita llanta"
   ↓
Aria (admin-chat.js)
   ↓
Parsing del SYSTEM_PROMPT (líneas 99-143)
   ↓
Genera: [CREATE_ORDER:David Cordero|Toyota|Rav4|1998|Llanta]
   ↓
executeCreateOrder() (línea 314)
   ↓
Llama a /api/create-order con datos estructurados
   ↓
create-order.js:
  1. Busca/crea cliente en tabla `customers`
  2. Prepara array de ítems
  3. Inserta en `orders` con `items_json`
  4. Inicializa registro en `financials`
  5. Inserta ítems en `order_items`
   ↓
Devuelve orderId → Frontend hace refresh automático
```

### Flujo de Actualización de Ítems (Fix #1)

```javascript
// admin.html (líneas 2516-2527)
if (data.refreshOrders === true) {
    console.log('Orden actualizada, refrescando lista...');
    await loadData(); // Recarga allOrders desde API
    
    // NUEVO: Refresh del panel de detalle
    if (selectedOrder) {
        const updatedOrder = allOrders.find(o => o.id === selectedOrder.id);
        if (updatedOrder) {
            selectedOrder = { ...updatedOrder };
            renderDetail(selectedOrder); // Re-renderiza el detalle
        }
    }
}
```

**Problema resuelto**: Antes solo actualizaba la lista de órdenes, pero el panel de detalle mostraba datos viejos hasta hacer F5.

### Cálculos Financieros

```javascript
// api/create-order.js (líneas 6-19)
const calculatePriceFromCostAndMargin = (cost, marginPercent) => {
    if (marginPercent >= 100) return 0;
    return cost / (1 - marginPercent / 100); // Markdown margin
};

const calculateMarginFromCostAndPrice = (cost, price) => {
    if (cost <= 0) return 0;
    return ((price - cost) / price) * 100;
};

const calculatePriceWithVAT = (price) => {
    return price * 1.15; // IVA 15% hardcoded
};
```

**Landed Cost por ítem**:
```
LandedCost = FOB_Cost + Supplier_Freight + Customs_Nationalization + Other_Expenses
Price = LandedCost / (1 - MarginPercent/100)
PriceWithVAT = Price × 1.15
```

### Aria AI - System Prompt

El prompt del sistema (líneas 99-143 en `admin-chat.js`) incluye:

1. **Reglas críticas**:
   - NUNCA usar placeholders genéricos
   - Separar marca/modelo claramente
   - Usar separadores PIPE `|` (no comas)
   - Parsing de typos ortográficos

2. **Acciones soportadas**:
   ```
   [CREATE_ORDER:Cliente|Marca|Modelo|Año|Pieza]
   [UPDATE_STATUS:ORD-XX|NuevoEstado]
   [UPDATE_COST:ORD-XX|45.50]
   [ADD_PART:ORD-XX|Rodillo|25.00]
   [ADD_NOTE:ORD-XX|Nota del cliente]
   [DELETE_ORDER:ORD-XX]
   ```

3. **Ejemplos de parsing**:
   - Input: `"nombr edel cleinte david cordero, toyota rav4 1998 llanta"`
   - Output: `[CREATE_ORDER:David Cordero|Toyota|Rav4|1998|Llanta]`

## 🗄️ Esquema de Base de Datos

### Tablas Principales

```sql
-- Órdenes
orders (
    id UUID PRIMARY KEY,
    readable_id TEXT,        -- ej: "ORD-196"
    customer_id UUID,
    part_name TEXT,          -- legacy (primer ítem)
    vehicle_brand TEXT,
    vehicle_model TEXT,
    vehicle_year TEXT,
    status TEXT,
    items_json JSONB,        -- Array de ítems multi-repuesto
    created_at TIMESTAMP
)

-- Clientes
customers (
    id UUID PRIMARY KEY,
    full_name TEXT,
    phone TEXT,
    email TEXT,
    ruc TEXT,
    cedula TEXT,
    source TEXT              -- 'manual' | 'ai'
)

-- Ítems de orden (desglose relacional)
order_items (
    id UUID PRIMARY KEY,
    order_id UUID,
    part_name TEXT,
    part_number TEXT,
    quantity INT,
    cost_fob DECIMAL,
    fob_cost DECIMAL,
    supplier_freight DECIMAL,
    customs_nationalization DECIMAL,
    sale_price DECIMAL,
    margin_percent DECIMAL,
    item_status TEXT,
    vendor_name TEXT,
    supplier_url TEXT,
    updated_at TIMESTAMP
)

-- Financieros (agregado por orden)
financials (
    id UUID PRIMARY KEY,
    order_id UUID,
    fob_cost DECIMAL,
    supplier_freight DECIMAL,
    customs_nationalization DECIMAL,
    other_expenses DECIMAL,
    margin_percent DECIMAL,
    price DECIMAL,
    price_with_vat DECIMAL
)

-- Notas
order_notes (
    id UUID PRIMARY KEY,
    order_id UUID,
    content TEXT,
    author TEXT,
    created_at TIMESTAMP
)

-- Historial de cambios
order_history (
    id UUID PRIMARY KEY,
    order_id UUID,
    changed_by TEXT,
    field_changed TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP
)

-- Admin users
admin_users (
    id UUID PRIMARY KEY,
    username TEXT,
    password_hash TEXT,      -- hash simple (no bcrypt)
    is_active BOOLEAN
)
```

## 🚀 Deploy

### Configuración en Vercel

1. Conectar repositorio GitHub a Vercel
2. Agregar variables de entorno:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
   SUPABASE_SERVICE_ROLE_KEY=xxx
   PASSWORD_ADMIN=xxx         # Contraseña maestra
   GOOGLE_API_KEY=xxx         # Para Gemini
   OPENROUTER_API_KEY=xxx     # Para modelos OpenRouter
   ```
3. Deploy automático en cada push a `main`

### Deploy Local (desarrollo)

```bash
# Instalar dependencias
npm install

# Variables de entorno (.env.local)
cp .env.example .env.local
# Editar .env.local con tus keys

# Correr localmente
npx vercel dev
```

## 🧪 Testing

### Pruebas Manuales

1. **Login persistente**:
   - Login → F5 → ¿Mantiene sesión?
   - Cerrar navegador → Abrir → ¿Pide login?

2. **Refresh de ítems**:
   - Seleccionar orden → Chat "agrega X" → ¿Detalle se actualiza solo?

3. **Parsing de IA**:
   - Chat: "nombr edel cleinte juan perez toyota corolla 2020 faro"
   - Verificar orden creada con datos completos

### Logs de Depuración

Buscar en consola del navegador:
- `Orden actualizada, refrescando lista...` (Fix #1)
- `Restoring session...` (Fix #2)
- `=== ARIA ACTION DETECTED ===` (AI actions)

Logs de Vercel:
- Dashboard → Project → Deployments → Click en deployment → Logs

## 📝 Convenciones de Código

### Nomenclatura

- **Variables**: `camelCase` (`adminPass`, `allOrders`)
- **Funciones**: `camelCase` (`doLogin`, `renderOrders`)
- **IDs de elementos**: `kebab-case` (`login-screen`, `detail-panel`)
- **Clases CSS**: `kebab-case` (`order-card`, `btn-primary`)

### Estructura de admin.html

```
Líneas 1-1270:     <head> con CSS inline
Líneas 1271-1546:  <body> con HTML (login + app)
Líneas 1547-3176:  <script> con toda la lógica JS
```

### API Endpoints

Todos en `api/` como serverless functions de Vercel:

```javascript
export default async function handler(req, res) {
    // 1. Validar auth (password en header)
    // 2. Extraer datos del body
    // 3. Operación en Supabase
    // 4. Retornar respuesta JSON
}
```

## 🔐 Seguridad

### Autenticación

- Password simple (no hashing bcrypt)
- Header `x-admin-password` en todas las peticiones
- `sessionStorage` para sesión (no persistente entre cierres de navegador)

### Supabase RLS

- Row Level Security habilitado en todas las tablas
- Service role key solo en backend (Vercel env vars)
- Anon key expuesta en frontend (solo lectura según políticas)

### Consideraciones

⚠️ **No usar en producción sin**:
1. Implementar hashing de passwords (bcrypt)
2. Agregar rate limiting en endpoints
3. Validar/sanear todos los inputs del usuario
4. HTTPS forzado (Vercel lo hace automático)

## 📊 Métricas y Monitoreo

### Vercel Analytics

- Tiempos de carga
- Errores de serverless functions
- Usage de bandwidth

### Supabase Logs

- Query performance
- Errores de base de datos
- Usage de API calls

## 🐛 Debugging Común

### Problema: "Ítems no se actualizan"

**Causa**: Fix #1 no está deployado
**Solución**: Verificar versión `V20260620-Fix3` en login

### Problema: "Pide login después de F5"

**Causa**: Fix #2 no está funcionando
**Solución**: 
1. Abrir consola → ¿Dice `Restoring session...`?
2. Verificar sessionStorage → ¿Tiene `agn-admin-logged=true`?
3. Revisar si hay errores de CORS o auth

### Problema: "Aria no crea órdenes"

**Causa**: API keys faltantes o parsing fallido
**Solución**:
1. Revisar logs de Vercel → Buscar `OPENROUTER ERROR` o `GEMINI ERROR`
2. Verificar SYSTEM_PROMPT → ¿Incluye ejemplos de parsing?
3. Probar con mensaje simple → `"juan perez|toyota|hilux|2020|faro"`

## 📚 Recursos Adicionales

- **CHANGELOG.md**: Historial completo de cambios
- **FINANCIAL_LOGIC_MIGRATION_SUMMARY.md**: Detalles de migración financiera
- **AIRULES.md**: Manifiesto de ejecución de agentes (Antigravity)
- **manual_sistema.md**: Documentación de usuario final

---

**Última actualización**: 2026-06-20  
**Versión actual**: `V20260620-Fix3`  
**Commit**: `7124c1c`