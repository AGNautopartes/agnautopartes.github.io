# Plan de Arreglos - AGN Autopartes

## Problemas Reportados

| # | Problema | Estado |
|---|----------|--------|
| 1 | Accordion siempre cerrado – Al agregar nuevo ítem, no se expande automáticamente | ✅ PARCIAL (edit anterior ya aplicado) |
| 2 | Click en input colapsa panel – Al hacer clic en los campos del header (nombre, precio, estado), el accordion se cierra | ✅ COMPLETADO |
| 3 | Estado del ítem no visible – No se muestra el dropdown de estado en el header del ítem | ✅ COMPLETADO (fix 2 incluye estados completos) |
| 4 | Estado no se guarda – Al crear/editar orden, el estado del ítem no se persiste en la base de datos | ✅ PARCIAL (edit anterior aplicado) |
| 5 | Ítems faltantes – Alguns ítems no aparecen al abrir una orden guardada | ✅ OK (ya implementado) |
| 6 | Error tras eliminar – Después de eliminar una orden, la lista no se actualiza | ✅ OK (ya implementado) |
| 7 | Panel muy estrecho – El panel de detalle es angosto para ver información | ✅ OK (506px) |

---

## Plan de Ejecución

### Fix 1: Accordion auto-expand
**YA APLICADO** en Línea ~1986-2026
- Nuevo item siempre expandido (`isExpanded = 'block'`)
- Indicator siempre '-'

### Fix 2: stopPropagation en inputs header
**PENDIENTE** - Línea ~1881-1895
```
Agregar onclick="event.stopPropagation()" a:
- .dyn-part-name
- .dyn-sale
- .dyn-status
```

### Fix 3: Estados consistentes
**PENDIENTE** - Línea ~1886-1892
```
Opciones deben coincidir con saveNewOrderPart():
- Solicitado
- Cotizado
- Comprado
- Trnsito 1
- Trnsito 2
- En Aduana
- Entregado
- Recogido
- Cancelado
```

### Fix 4: item_status persistence
**YA APLICADO** en updateManualOrder() - Línea ~2226-2239
- Ya incluye: item_status, tracking_number, margin_percent, supplier_name

---

## Archivos Afectados
- admin.html (único)

---

## Orden de Ejecución Sugerida
1. Fix 2 (stopPropagation)
2. Fix 3 (estados consistentes)
3. Verificar Fix 1 y Fix 4 aplicados
4. Test funcional