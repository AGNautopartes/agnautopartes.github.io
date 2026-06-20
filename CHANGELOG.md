# Changelog - AGN Autopartes ERP

Todos los cambios notables en este proyecto.

## [2026-06-20] - Fix #3: Parsing de Nombres + Fix #2 Login + Fix #1 Refresh

### Agregado
- **Fix #3**: Mejoras en el SYSTEM_PROMPT de Aria para parsing de nombres de cliente con errores ortográficos
  - Ahora detecta nombres aunque el usuario escriba "nombr edel cleinte david cordero"
  - Separa automáticamente marca, modelo y año de vehículos
  - Extrae nombres de piezas de lenguaje natural

### Cambiado
- **Fix #2**: Persistencia de sesión mientras el navegador esté abierto
  - Login persiste al hacer F5 o refresh
  - Sesión se mantiene en múltiples pestañas
  - Sesión se limpia al cerrar navegador completamente
  - Logout manual limpia sessionStorage antes de recargar
- **Fix #1**: Auto-refresh del panel de detalle después de agregar ítems por chat
  - Después de ejecutar acción del AI, el detalle se actualiza automáticamente
  - No requiere recargar la página manualmente

### Técnico
- Versión: `V20260620-Fix3`
- Commits: `d371aa9`, `130639a`, `3f7d2f8`

---

## [2026-05-29] - Campos de Fecha y Alarma

### Agregado
- Campos de fecha por ítem (fecha_pedido, fecha_estimada)
- Switch de alarma por orden para resaltar órdenes críticas
- Estilos CSS para órdenes con alarma activada (fondo rojo claro)

### Técnico
- Commit: `d8c9f5e`
- Versión: `V20260529`

---

## [2026-05-15] - Modo Light y Correcciones UI

### Cambiado
- Interfaz cambiada a modo light (V20260515)
- Corrección de color de texto en campo ITEM a `var(--text)`
- Actualización de versión de login

### Técnico
- Commits: `e387f1f`, `dc541f6`, `6d528be`, `76a4f5e`

---

## [2026-05-XX] - Layout Resizable 30-50-20

### Cambiado
- Layout fijo: 30% (órdenes) | 50% (detalle) | 20% (AI)
- Panel de detalle ampliado a 506px para mejor legibilidad
- Eliminados resizers, layout fijo con porcentajes de viewport

### Técnico
- Commits: `8d32e27`, `c209eb8`, `0222232`, `357d3d1`, `6ecd6b5`, `236782c`, `d93ea55`, `2f55916`

---

## [2026-05-XX] - Sistema Financiero y Landed Cost

### Agregado
- Cálculo de landed cost multi-etapa (FOB + Freight + Customs + Other)
- Margen basado en markdown (Price = Cost / (1 - Margin))
- IVA 15% hardcoded
- Vista `order_financial_summary` para agregados financieros
- Funciones SQL para cálculos financieros

### Cambiado
- Migración de lógica financiera a API endpoints
- Bidirectional calculation protection con flags
- Precisión de 2 decimales en todos los cálculos

### Técnico
- Ver `FINANCIAL_LOGIC_MIGRATION_SUMMARY.md` para detalles completos

---

## [2026-05-XX] - Aria AI Assistant

### Agregado
- Asistente de IA para gestión de órdenes con lenguaje natural
- Acciones soportadas:
  - `CREATE_ORDER`: Crear nuevas órdenes
  - `UPDATE_STATUS`: Cambiar estado de órdenes
  - `UPDATE_COST`: Modificar costos
  - `UPDATE_VEHICLE`: Actualizar datos del vehículo
  - `ADD_PART`: Agregar repuestos a órdenes existentes
  - `ADD_NOTE`: Agregar notas
  - `DELETE_ORDER`: Eliminar órdenes
- Integración con Google Gemini y OpenRouter
- Soporte para múltiples modelos (free y pagados)
- Voice input/output con Web Speech API

### Técnico
- Archivo: `api/admin-chat.js`
- System prompt en español con ejemplos estructurados
- Routing automático: Google models → Gemini API, otros → OpenRouter

---

## [2026-05-XX] - Sistema de Reportes

### Agregado
- 3 sub-tabas: Completo, Financiero, Pipeline
- Filtros por rango de fechas, marca, modelo, status, cliente
- Exportación a CSV
- Agregación financiera por orden
- Cálculo de margen ponderado

### Técnico
- Archivo: `admin-reportes.html` (integrado en `admin.html`)

---

## Versiones Anteriores

- **V202600515**: Versión inicial de login
- **V20260503**: Restauración de admin.html
- **V202605XX**: Implementación de multi-repuesto (items_json)
- **V202605XX**: Migración a Supabase

---

## Notas de Versión

### Convención de Nombres
- Formato: `VYYYYMMDD-FixN`
- Ejemplo: `V20260620-Fix3` = 20 de junio 2026, Fix #3

### Deploy
- Todos los cambios se deployan automáticamente vía Vercel
- Tiempo estimado de deploy: 30-60 segundos después del push
- URL de producción: https://agnautopartes.vercel.app