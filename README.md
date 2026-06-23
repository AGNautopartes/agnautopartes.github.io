# AGN Autopartes ERP

**Sistema de Gestión de Órdenes de Repuestos Automotrices**

[🔗 Acceder al Panel de Administración](https://agnautopartes.vercel.app)

---

## 🏎️ ¿Qué es AGN Autopartes?

AGN Autopartes es un sistema ERP diseñado para gestionar el ciclo completo de órdenes de repuestos automotrices, desde la solicitud del cliente hasta la entrega final.

El núcleo del sistema es su **Panel de Administración**, donde se centraliza toda la operatividad: creación de órdenes, tracking de estados, cálculos financieros y comunicación con proveedores.

---

## 📦 Funcionalidades Principales

### 1. Gestión de Órdenes
- **Identificadores únicos** (ej: ORD-196) para trazabilidad completa
- **Datos del vehículo**: Marca, modelo, año, VIN
- **Tracking**: Números de seguimiento y estado en tiempo real
- **Multi-repuesto**: Múltiples ítems por orden
- **Estados del flujo**: Solicitado → Cotizado → Comprado → Tránsito → Aduana → Entregado

### 2. Control Financiero
- Cálculo de **landed cost** (FOB + fletes + aduanas + otros)
- Márgenes de ganancia configurables
- IVA automático (15%)
- Reportes de rentabilidad por orden

### 3. Aria - Asistente de IA 🤖
- Comandos por **lenguaje natural** en español
- Creación y actualización de órdenes por chat
- Voice input/output (dictado por voz)
- Detección inteligente de typos y variaciones

### 4. Reportes y Analytics
- Filtros por fecha, marca, modelo, estado, cliente
- Exportación a CSV compatible con Excel
- Pipeline de órdenes en curso
- Análisis financiero consolidado

### 5. Seguridad y Auditoría
- Login con autenticación
- Bitácora de cambios (quién hizo qué y cuándo)
- Sesión persistente mientras el navegador esté abierto

---

## 🖥️ Capturas

*(Espacio para screenshots del sistema)*

---

## 📞 Soporte

Para acceso o soporte técnico, contactar al administrador del sistema.

---

## 📚 Documentación Técnica

- [**CHANGELOG**](CHANGELOG.md) - Historial de versiones y cambios
- [**README para Desarrolladores**](README_DEV.md) - Arquitectura, deploy y código

---

**Última versión**: V20260620-Fix3  
**Deploy automático**: Vercel  
**Base de datos**: Supabase (PostgreSQL)