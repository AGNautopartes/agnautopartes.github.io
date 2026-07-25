# Aria 2: arquitectura modular para ERP

## Objetivo

Aria traduce lenguaje natural a comandos existentes del ERP. No pulsa elementos
visuales, no genera código y no accede directamente a la base de datos.

Los botones, formularios y Aria terminan utilizando los mismos handlers del ERP:

```text
Botón o formulario ──> API del ERP ──> reglas actuales
Aria ──> registro de comandos ──> mismo handler del ERP ──> reglas actuales
```

La invocación de Aria ocurre dentro del proceso. No utiliza `VERCEL_URL` ni crea
peticiones HTTP hacia el propio despliegue.

## Módulos

- `lib/agent-core/command-registry.js`: registra, describe y valida comandos.
- `lib/agent-core/handler-adapter.js`: ejecuta handlers existentes sin HTTP.
- `lib/agent-core/model-policy.js`: permite únicamente modelos aptos.
- `lib/agn-erp/command-catalog.js`: comandos específicos de AGN.
- `lib/aria/aria-agent.js`: comunicación con el proveedor de IA.
- `lib/aria/aria-prompt.js`: comportamiento y versión del prompt.
- `api/admin-chat.js`: autenticación y coordinación.

## Contrato de un comando

Cada comando declara:

- `name`: identificador estable.
- `description`: cuándo debe utilizarlo la IA.
- `parameters`: JSON Schema de los argumentos.
- `risk`: nivel de riesgo.
- `requiresConfirmation`: confirmación humana para acciones destructivas.
- `execute`: función que activa el comportamiento existente del ERP.

La descripción y el esquema se convierten automáticamente en herramientas para
el modelo. No se mantienen formatos paralelos como `[ACTION:...]`.

## Comandos AGN

- `create_order`
- `open_order`
- `set_order_status`
- `set_order_alarm`
- `update_order_customer`
- `add_order_part`
- `add_order_note`

Aria no puede eliminar órdenes. Esa operación permanece exclusivamente en el
control manual del panel ERP.

Aria no precarga órdenes. Una búsqueda por número consulta una sola orden; una
búsqueda por nombre confirmado recupera como máximo dos filas para detectar
ambigüedad.

## Adaptación a otro ERP

1. Conservar `lib/agent-core` y `lib/aria`.
2. Crear un catálogo específico de la aplicación.
3. Registrar cada handler existente con nombre, descripción y parámetros.
4. Configurar el modelo aprobado.
5. Integrar el cliente de chat con el único endpoint del agente.

El motor no depende de Supabase. El ERP puede usar Supabase, PostgreSQL, una API
externa u otra persistencia sin modificar el agente.
