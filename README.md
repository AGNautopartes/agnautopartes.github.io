# AGNautopartes

\u00a1Bienvenido a la aplicación AGNautopartes!


🏎️ AGN Autopartes — Plataforma Integral de Gestión ERP
AGN Autopartes es una solución robusta diseñada para centralizar la operatividad de repuestos automotrices. Aunque el sistema cuenta con una Landing Page para la captación de clientes, el núcleo del proyecto reside en su Panel de Administración (ERP), un entorno diseñado para el control total sobre el ciclo de vida de las órdenes y la cadena de suministro.

📦 1. Gestión de Órdenes: El Núcleo Operativo
La funcionalidad principal del sistema es la administración manual y granular de cada pedido, garantizando que cada pieza sea rastreable desde la solicitud hasta la entrega final.

🛠️ Creación e Ingreso Manual
Identificadores Únicos (ORD-X): Cada orden generada posee un ID legible que facilita la trazabilidad y comunicación interna.

Control de Datos Críticos: El sistema permite el ingreso manual de información vital como el VIN (Vehicle Identification Number), números de Tracking y datos financieros (Precio de Venta y Costo FOB).

Asignación de Responsabilidades: Las órdenes pueden ser asignadas a empleados específicos para un seguimiento personalizado.

📝 Edición y Control en Tiempo Real
Persistencia Instantánea: Todos los campos del panel son editables manualmente con guardado instantáneo a través de Supabase.

Estados de Flujo (Ciclo de Vida): Las órdenes atraviesan un flujo dinámico que incluye:

Solicitado: Recepción del pedido inicial.

Cotizado: Definición de precios y costos.

Comprado: Adquisición de la pieza con el proveedor.

Tránsito 1 (Prov a Log): Traslado del proveedor a la central logística.

Tránsito 2 (Log a EC): Envío hacia el centro de distribución.

Aduana: Proceso de nacionalización y trámites legales.

Entregado: Cierre exitoso de la operación.

Cancelación: Opción de invalidar órdenes en cualquier etapa del proceso.

🖥️ 2. Arquitectura de Interfaz (Layout Premium)
La interfaz administrativa está diseñada para maximizar la productividad mediante un manejo inteligente del espacio:

Área Central de Lista de Órdenes: Presenta el inventario de todas las solicitudes con filtros de estado.

Panel de Detalles Colapsable: Un sistema de "toggle" lateral que permite abrir la información técnica y financiera de una orden sin abandonar la lista principal, optimizando la multitarea.

Ventana de Reportes: Una sección dedicada a la inteligencia de negocio que permite:

Filtros Multidimensionales: Cruce de datos por fechas, marcas de vehículos y modelos.

Análisis de Rentabilidad: Cálculo automático de ganancias basado en la diferencia entre la venta y el costo FOB ingresado.

Exportación Premium: Generación de archivos CSV con codificación BOM para compatibilidad total con Microsoft Excel, respetando caracteres especiales y tildes.

🤖 3. Aria: Asistente de IA (Soporte y Ejecución)
Aria actúa como una capa de inteligencia secundaria que asiste en la gestión de las órdenes mencionadas anteriormente:

Lectura de Contexto: Aria analiza el estado de las órdenes en la base de datos para responder consultas o realizar actualizaciones precisas.

Operación Manos Libres: Integración con Web Speech API para el dictado de órdenes y síntesis de voz (TTS) para vocalizar respuestas.

Ejecución de Acciones: Capacidad de realizar comandos de creación (CREATE), actualización (UPDATE) o borrado (DELETE) mediante lenguaje natural.

⚙️ 4. Control de Inventario y Seguridad
Reposiciones de Repuestos: Control de stock actual, gestión de pedidos con proveedores y alertas automáticas de bajo inventario.

Gestión de Usuarios: Sistema basado en roles y permisos para delimitar el acceso a RRHH y administradores.

Bitácora de Acciones: Registro histórico de todos los movimientos realizados en el sistema para auditoría y seguridad.

💻 5. Especificaciones Técnicas
Frontend: React.

Backend: Node.js/Express.

Base de Datos: PostgreSQL / Supabase para almacenamiento y tiempo real.

Despliegue: Vercel.

🚀 6. Instalación y Despliegue
Configuración: Requiere autenticación de administrador.

Instalación: npm install.

Build: npm run build.

Despliegue: vercel para entornos de producción.