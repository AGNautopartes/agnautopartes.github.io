document.addEventListener('DOMContentLoaded', function() {

    // ==================================================================
    // == LÓGICA CORE (FUNCIONALIDAD INTACTA) ==
    // ==================================================================
    const GOOGLE_API_KEY = 'AIzaSyCoSJrU2POi_8pFHzgro5XlCIIPsa1lt5M';
    const AI_MODEL = 'gemini-1.5-flash-latest';
    const makeWebhookLoggerUrl = 'https://hook.us2.make.com/2jlo910w1h103zmelro36zbqeqadvg10';

    const chatWidget = document.getElementById('chat-widget');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const assistantButtonHeader = document.getElementById('btn-assistant-header');
    const assistantButtonForm = document.getElementById('btn-assistant-form');

    let conversationHistory = [
        { role: "user", parts: [{ text: `
          REGLAS ESTRICTAS DEL SISTEMA:
          1.  **Rol y Tono:** Eres "Alex", un asistente de "Autopartes Express Cuenca". Tu tono es profesional y siempre usas "usted".
          2.  **Misión Principal:** Tu único objetivo es recopilar la información para una cotización. Eres un bot recolector de datos.
          3.  **Datos Obligatorios:** Debes conseguir sí o sí:
              - Marca del vehículo.
              - Modelo del vehículo.
              - Año del vehículo.
              - Repuesto necesitado.
              - Número de teléfono del cliente.
          4.  **Datos Opcionales pero importantes:** Intenta obtener de forma conversacional si el cliente los menciona:
              - Nombre del cliente.
              - Ciudad y Provincia del cliente.
          5.  **Flujo de Conversación:**
              - Saluda cortamente y pregunta inmediatamente por la información del vehículo y el repuesto.
              - A medida que conversas, intenta obtener los datos opcionales.
              - Una vez tengas los 5 datos obligatorios, tu trabajo está hecho.
          6.  **Regla de Salida de Emergencia:** Si el cliente quiere hablar con un humano, tu ÚNICA respuesta posible es: "Con mucho gusto. Para atención personalizada, puede contactar directamente a nuestro gerente, Pedro, al número 0999115626.". Después de eso, no digas nada más.
          
          7.  **REGLA DE ORO - ACCIÓN FINAL:**
              - **CUANDO TENGAS LOS 5 DATOS OBLIGATORIOS**, tu siguiente y ÚLTIMA respuesta debe ser NADA MÁS QUE EL OBJETO JSON.
              - **NO ESCRIBAS TEXTO INTRODUCTORIO NI USES BLOQUES DE CÓDIGO.**
              - Tu respuesta debe empezar con "{" y terminar con "}".
              - **Utiliza la siguiente estructura EXACTA para el JSON:**
                {
                  "accion": "registrar_cotizacion",
                  "datos": {
                    "nombre_cliente": "El nombre que recopilaste, o 'No proporcionado'",
                    "contacto_cliente": "El teléfono que recopilaste",
                    "marca_vehiculo": "La marca que recopilaste",
                    "modelo_vehiculo": "El modelo que recopilaste",
                    "año_vehiculo": "El año que recopilaste",
                    "repuesto_solicitado": "El nombre específico de la pieza que el cliente necesita (Ej: 'Faro delantero derecho')",
                    "numero_de_parte": "El número si lo dieron, o 'No proporcionado'",
                    "ciudad": "La ciudad si la mencionaron, o 'No proporcionado'",
                    "provincia": "La provincia si la mencionaron, o 'No proporcionado'",
                    "observaciones_resumen": "Un resumen muy breve y profesional de la solicitud completa del cliente, incluyendo detalles adicionales que haya mencionado. Ej: 'Cliente busca pastillas de freno cerámicas para el eje delantero, mencionó que prefiere marca Brembo si es posible.'",
                    "texto_chat_completo": "TODO el historial de la conversación entre el usuario y tú, formateado como un solo bloque de texto con saltos de línea \\n."
                  }
                }
              - **El mensaje de "Excelente, he registrado su solicitud..." NO lo generas tú. El sistema lo hará automáticamente.** Tu trabajo termina al enviar el JSON puro.
        `}]},
        { role: "model", parts: [{ text: "Entendido. Soy Alex. Para iniciar su cotización, por favor, indíqueme la marca, modelo y año de su vehículo, y el repuesto que necesita." }]}
    ];

    function addMessage(sender, text, isThinking = false) { if (!chatMessages) return; const existingThinkingMessage = document.getElementById('thinking-message'); if (existingThinkingMessage) existingThinkingMessage.remove(); const messageElement = document.createElement('div'); messageElement.classList.add('chat-message', `${sender}-message`); if (isThinking) { messageElement.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>'; messageElement.id = 'thinking-message'; } else { messageElement.textContent = text; } chatMessages.appendChild(messageElement); chatMessages.scrollTop = chatMessages.scrollHeight; return messageElement; }
    function typeMessage(sender, text) { const messageElement = addMessage(sender, ''); let i = 0; const speed = 30; function type() { if (i < text.length) { messageElement.textContent += text.charAt(i); i++; chatMessages.scrollTop = chatMessages.scrollHeight; setTimeout(type, speed); } } type(); }
    
    async function handleSendMessage() {
        if (!chatInput || chatInput.value.trim() === '' || chatSendBtn.disabled) return;
        if (GOOGLE_API_KEY.includes('PEGA_AQUI')) { addMessage('assistant', 'Error: La clave de API de Google no ha sido configurada.'); return; }
        const messageText = chatInput.value.trim();
        addMessage('user', messageText);
        conversationHistory.push({ role: 'user', parts: [{ text: messageText }] });
        chatInput.value = '';
        chatSendBtn.disabled = true;
        addMessage('assistant', '', true);
        
        setTimeout(async () => {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: conversationHistory }), });
                const existingThinkingMessage = document.getElementById('thinking-message');
                if (existingThinkingMessage) existingThinkingMessage.remove();
                if (!response.ok) throw new Error(`Error de API: ${response.statusText}`);
                const data = await response.json();
                if (!data.candidates || data.candidates.length === 0) throw new Error("Respuesta de API inválida.");
                const aiResponseText = data.candidates[0].content.parts[0].text;
                try {
                    const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const responseObject = JSON.parse(jsonMatch[0]);
                        if (responseObject.accion === 'registrar_cotizacion' && responseObject.datos) {
                            const confirmationMessage = "¡Excelente! He rellenado los datos en el formulario principal. Por favor, revísalos, completa tu nombre si falta, y presiona el botón de WhatsApp para finalizar.";
                            await logDataToMake(responseObject.datos);
                            populateFormFromAI(responseObject.datos);
                            conversationHistory.push({ role: 'model', parts: [{ text: confirmationMessage }] });
                            typeMessage('assistant', confirmationMessage);
                            setTimeout(() => chatWidget.classList.add('hidden'), 6000);
                            return;
                        }
                    }
                } catch (e) { console.warn("Respuesta no era JSON. Tratando como texto normal.", e); }
                conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
                typeMessage('assistant', aiResponseText);
            } catch (error) {
                console.error('Error al llamar a la API de Gemini:', error);
                const existingThinkingMessage = document.getElementById('thinking-message');
                if (existingThinkingMessage) existingThinkingMessage.remove();
                typeMessage('assistant', 'Lo siento, no puedo responder en este momento.');
            } finally {
                chatSendBtn.disabled = false;
                if(chatInput) chatInput.focus();
            }
        }, 1200);
    }

    async function logDataToMake(data) { if (!makeWebhookLoggerUrl) { console.error("URL del webhook de Make.com no configurada."); return; } try { const now = new Date(); const fullData = { ...data, fecha: now.toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' }), hora: now.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' }) }; await fetch(makeWebhookLoggerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullData) }); console.log("Datos enviados a Make.com."); } catch (error) { console.error("Error al enviar datos a Make.com:", error); } }
    let chatListenersAdded = false; function addChatListeners() { if (chatListenersAdded || !chatSendBtn || !chatInput) return; chatSendBtn.addEventListener('click', handleSendMessage); chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); } }); chatListenersAdded = true; }
    
    const form = document.getElementById('sparePartsForm');
    const submitButton = document.getElementById('submit-button-whatsapp');
    const submitHelper = document.getElementById('submit-helper-text');
    const marcaInput = document.getElementById('marca');
    const modeloSelect = document.getElementById('modelo');
    const anioSelect = document.getElementById('anio');
    const logosContainer = document.getElementById('logos-container');
    const descripcionTextarea = document.getElementById('descripcion');
    const vinInput = document.getElementById('vin');
    const nombreInput = document.getElementById('nombre');
    const telefonoInput = document.getElementById('telefono');
    const brandDisplayName = document.getElementById('selected-brand-name');
    const brandDisplayLogo = document.getElementById('selected-brand-display-logo');
    
    const marcasPopulares = ["Chevrolet", "Kia", "Toyota", "Hyundai", "Suzuki", "Renault", "Great Wall", "Mazda", "Nissan", "Ford", "Volkswagen", "Mitsubishi"];
    const marcasFullList = { "Chevrolet": ["Onix", "Onix RS", "Onix Turbo Sedán", "Joy HB", "Joy Sedán", "Aveo", "Spark GT", "Spark Life", "Beat", "Sail", "Cavalier", "Cruze", "Bolt", "Bolt-EUV", "Groove", "Tracker", "Captiva", "Captiva XL", "Equinox-EV", "Blazer-RS-EV", "Tahoe", "Trailblazer", "Montana", "D-Max (varias gen.)", "Colorado", "Silverado", "Blazer (hist.)", "Trooper", "LUV", "Luv-D-Max", "Rodeo", "Gemini", "Corsa", "Esteem", "Forsa", "Vitara (3 puertas)", "Vitara (5 puertas)", "Grand Vitara", "Blue-Bird", "chasis MR-buses"], "Kia": ["Picanto", "Rio", "Rio-5", "Soluto", "Cerato", "K3", "Carens", "Carnival", "Stonic", "Stonic Hybrid", "Seltos", "Sonet", "Sportage", "Sorento", "Niro", "Niro-EV", "EV6", "EV5", "EV9", "Soul-EV"], "Toyota": ["Agya", "Yaris", "Yaris Sport", "Yaris Cross", "Corolla", "Corolla Híbrido", "Corolla Cross Híbrido", "C-HR", "Raize", "RAV4", "Rush", "Prius", "Prius-C", "Innova", "Hilux", "Tacoma", "Fortuner", "Land Cruiser Prado", "Land Cruiser 200", "Land Cruiser 300", "4Runner", "FJ Cruiser", "Starlet", "Tercel", "Celica"], "Hyundai": ["Accent", "Grand i10", "Elantra", "Sonata", "Venue", "Kona", "Kona Hybrid", "Tucson", "Santa Fe", "Creta", "Staria"], "Chery": ["QQ3", "QQ6", "Nice-A1", "Van-Pass", "XCross", "Arrizo-3", "Arrizo-5", "Tiggo", "Tiggo-2", "Tiggo-2 Pro", "Tiggo-3", "Tiggo-4", "Tiggo-5", "Tiggo-7", "Tiggo-7 Pro", "Tiggo-8", "Tiggo-8 Pro"], "Suzuki": ["Swift", "Baleno", "Celerio", "Ignis", "Vitara", "Grand Vitara", "Jimny", "XL7", "Ertiga", "S-Cross", "SX4"], "Renault": ["Kwid", "Sandero", "Logan", "Stepway", "Duster", "Captur", "Koleos", "Oroch", "Kangoo", "Symbol", "Megane", "Fluence"], "Great Wall": ["Wingle-1", "Wingle-2", "Wingle-3", "Poer", "Haval H2", "Haval H6", "Haval H9", "Haval Jolion", "Haval F7", "M4", "ORA Good-Cat", "Tank-300"], "JAC": ["J2", "J4", "J5", "S2", "S3", "S5", "S7", "T40", "T60", "V7", "HFC-1037"], "DFSK": ["Glory-500", "Glory-560", "Glory-580", "F5", "Mini Truck", "C31", "C52", "EC35", "K05", "K07"], "Volkswagen": ["Gol", "Escarabajo (Tipo-1)", "Voyage", "Polo", "Virtus", "T-Cross", "Tiguan", "Taigo", "Jetta", "Passat", "Amarok"], "Nissan": ["March", "Versa", "Sentra", "Kicks", "X-Trail", "Frontier", "NV350", "Pathfinder", "Note", "Micra"], "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-9", "CX-50", "CX-90", "BT-50"], "Dongfeng": ["Rich-6", "Rich-7", "Rich-12", "S30", "Husky", "EQ2030", "EQ2050", "580", "580 Pro", "mini-van Q30"], "Sinotruk": ["Howo-7", "Howo-9", "A7", "G7", "T5G", "ZZ1257", "ZZ1325", "ZZ1507", "ZZ3317", "ZZ4251"], "Jetour": ["X70", "X90", "X95", "T1", "T5", "T8", "Dasheng", "Cruiser", "XC", "Cooler"], "Ford": ["Fiesta", "EcoSport", "Ranger", "Explorer", "Mustang", "Transit", "Everest", "Bronco", "F-150", "Edge"], "Changan": ["CS35", "CS55", "CS75", "CS85", "Alsvin", "UNI-T", "Eado", "Eado Xt", "Benni", "CS15"], "BYD": ["Atto-3", "Dolphin", "Seal", "Song-Plus", "Tang", "Yuan-EV", "Qin", "e1", "e2", "Han"], "Subaru": ["Impreza", "XV", "Forester", "Outback", "WRX", "Crosstrek", "Legacy", "BRZ", "Solterra", "Ascent"], "Citroen": ["C3", "C3 Aircross", "C4", "C5 Aircross", "Berlingo", "C-Elysée", "C4 Cactus", "Spacetourer", "Jumpy", "Jumper"], "Fiat": ["500", "Panda", "Punto", "Tipo", "Toro", "Strada", "Argo", "Uno", "Ducato", "Fiorino"], "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Avenger", "Commander", "Wagoneer", "Patriot"], "Honda": ["Fit", "City", "Civic", "Accord", "CR-V", "HR-V", "Pilot", "BR-V", "Ridgeline", "Insight"], "BMW": ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "Serie 7", "X1", "X3", "X5", "Z4"], "Audi": ["A3", "A4", "A6", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT"], "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "CLA", "G-Class"], "Porsche": ["911", "Cayman", "Boxster", "Macan", "Cayenne", "Taycan", "Panamera", "718", "924", "928"] };
    const marcasOtras = Object.keys(marcasFullList).filter(m => !marcasPopulares.includes(m));
    const marcasOrdenadas = [...marcasPopulares, ...marcasOtras];

    function checkFormCompleteness() {
        if (!form || !submitButton) return;
        const requiredFields = form.querySelectorAll('[required]');
        let allValid = true;
        requiredFields.forEach(input => {
            const container = input.closest('.otro-input-container');
            if (container && container.style.display !== 'block') return;
            if (!input.value) allValid = false;
        });
        submitButton.disabled = !allValid;
        if(submitHelper) {
            submitHelper.textContent = allValid ? "" : "Complete los campos requeridos para enviar.";
        }
    }

    function updateLiveData(field, value) {
        const displayElement = document.getElementById(`display-${field}`);
        if (!displayElement) return;
        const span = displayElement.querySelector('span');
        if (value) { span.textContent = value; displayElement.style.display = 'block'; }
        else { displayElement.style.display = 'none'; }
        checkFormCompleteness();
    }
    
    function populateAnios() { if (!anioSelect) return; anioSelect.innerHTML = '<option value="">Selecciona el año</option>'; for (let y = new Date().getFullYear() + 1; y >= 1990; y--) anioSelect.add(new Option(y, y)); anioSelect.add(new Option("Otro", "Otro")); }

    function handleMarcaSelection(marca, wrapper) {
        if (!brandDisplayLogo || !modeloSelect || !anioSelect) return;
        const logoSrc = wrapper.querySelector('img')?.src || 'images/logos/otra.png';
        brandDisplayLogo.src = logoSrc;
        brandDisplayName.textContent = marca.toUpperCase();
        
        const otroMarcaContainer = document.getElementById('otra-marca-container');
        const otraMarcaInput = document.getElementById('otra-marca');
        if(otroMarcaContainer) { otroMarcaContainer.style.display = 'none'; if(otraMarcaInput) otraMarcaInput.required = false; }
        
        modeloSelect.innerHTML = '<option value="">Selecciona un modelo</option>';
        anioSelect.innerHTML = '<option value="">Primero selecciona un modelo</option>';
        anioSelect.disabled = true;
        
        document.getElementById('otro-modelo-container').style.display = 'none';
        document.getElementById('otro-modelo').required = false;
        document.getElementById('otro-anio-container').style.display = 'none';
        document.getElementById('otro-anio').required = false;

        updateLiveData('modelo', ''); updateLiveData('anio', '');
        
        if (marca === "Otro") {
            marcaInput.value = "Otro"; anioSelect.disabled = false; populateAnios();
            modeloSelect.disabled = false; modeloSelect.innerHTML = '<option value="Otro" selected>Otro (Especifique)</option>';
            modeloSelect.dispatchEvent(new Event('change'));
        } else {
            marcaInput.value = marca;
            if (marcasFullList[marca]) { marcasFullList[marca].forEach(modelo => modeloSelect.add(new Option(modelo, modelo))); }
            modeloSelect.add(new Option("Otro", "Otro"));
            modeloSelect.disabled = false;
        }
        checkFormCompleteness();
    }

    function populateLogos() {
        if (!logosContainer) return;
        marcasOrdenadas.forEach(marca => {
            const wrapper = document.createElement('div'); wrapper.className = 'logo-wrapper fade-in';
            const img = document.createElement('img'); const span = document.createElement('span');
            const fileName = marca.toLowerCase().replace(/[\s-.'&]/g, '');
            img.src = `images/logos/${fileName}.png`; img.alt = marca;
            img.onerror = () => { img.style.display = 'none'; span.style.marginTop = '10px'; };
            wrapper.appendChild(img); span.textContent = marca; wrapper.appendChild(span);
            logosContainer.appendChild(wrapper);
            wrapper.onclick = () => { document.querySelectorAll('.logo-wrapper.selected').forEach(w => w.classList.remove('selected')); wrapper.classList.add('selected'); handleMarcaSelection(marca, wrapper); };
        });
        const otroWrapper = document.createElement('div'); otroWrapper.className = 'logo-wrapper fade-in';
        otroWrapper.innerHTML = '<img src="images/logos/otra.png" alt="Otra Marca"><span>Otra</span>';
        logosContainer.appendChild(otroWrapper);
        otroWrapper.onclick = () => { document.querySelectorAll('.logo-wrapper.selected').forEach(w => w.classList.remove('selected')); otroWrapper.classList.add('selected'); handleMarcaSelection("Otro", otroWrapper); };
    }
    
    function populateFormFromAI(data) {
        if (!data) return;
        const marca = data.marca_vehiculo;
        const logoWrappers = document.querySelectorAll('.logo-wrapper');
        let brandWrapper = Array.from(logoWrappers).find(w => w.querySelector('span')?.textContent.toLowerCase() === marca.toLowerCase());
        if (brandWrapper) { brandWrapper.click(); } else { const otroWrapper = Array.from(logoWrappers).find(w => w.querySelector('span')?.textContent.toLowerCase() === 'otra'); if (otroWrapper) { otroWrapper.click(); document.getElementById('otra-marca').value = marca; if(brandDisplayName) brandDisplayName.textContent = marca.toUpperCase(); } }
        setTimeout(() => {
            modeloSelect.value = data.modelo_vehiculo;
            if (modeloSelect.value === data.modelo_vehiculo) { modeloSelect.dispatchEvent(new Event('change')); } else { modeloSelect.value = "Otro"; modeloSelect.dispatchEvent(new Event('change')); document.getElementById('otro-modelo').value = data.modelo_vehiculo; updateLiveData('modelo', data.modelo_vehiculo); }
            setTimeout(() => {
                anioSelect.value = data.año_vehiculo;
                 if (anioSelect.value === data.año_vehiculo) { anioSelect.dispatchEvent(new Event('change')); } else { anioSelect.value = "Otro"; anioSelect.dispatchEvent(new Event('change')); document.getElementById('otro-anio').value = data.año_vehiculo; updateLiveData('anio', data.año_vehiculo); }
            }, 300);
        }, 300);
        const fullDescription = `Repuesto solicitado: ${data.repuesto_solicitado}\n\nObservaciones/Resumen:\n${data.observaciones_resumen}`;
        descripcionTextarea.value = fullDescription;
        updateLiveData('descripcion', fullDescription);
        telefonoInput.value = data.contacto_cliente.replace(/\D/g, ''); updateLiveData('telefono', telefonoInput.value);
        if (data.nombre_cliente && data.nombre_cliente !== 'No proporcionado') { nombreInput.value = data.nombre_cliente; updateLiveData('nombre', data.nombre_cliente); }
        nombreInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nombreInput.focus();
        checkFormCompleteness();
    }
    
    function openChat() { if (!chatWidget) return; chatWidget.classList.remove('hidden'); addChatListeners(); if(chatInput) chatInput.focus(); }
    if (assistantButtonHeader) assistantButtonHeader.addEventListener('click', openChat);
    if (assistantButtonForm) assistantButtonForm.addEventListener('click', openChat);
    if (chatCloseBtn) chatCloseBtn.addEventListener('click', () => { if (chatWidget) chatWidget.classList.add('hidden'); });
    if(form) { form.addEventListener('input', checkFormCompleteness); form.addEventListener('change', checkFormCompleteness); }
    if (submitButton) {
        submitButton.addEventListener('click', function() {
            if (this.disabled) return;
            const formData = new FormData(form);
            let message = `*SOLICITUD DE REPUESTO*\n\n`;
            message += `*VEHÍCULO:*\n`;
            message += `  - Marca: ${formData.get('marca') === 'Otro' ? formData.get('otra-marca') : formData.get('marca')}\n`;
            message += `  - Modelo: ${formData.get('modelo') === 'Otro' ? formData.get('otro-modelo') : formData.get('modelo')}\n`;
            message += `  - Año: ${formData.get('anio') === 'Otro' ? formData.get('otro-anio') : formData.get('anio')}\n\n`;
            message += `*SOLICITUD DETALLADA:*\n${formData.get('descripcion')}\n\n`;
            message += `*VIN:* ${formData.get('vin') || 'No proporcionado'}\n\n`;
            message += `*DATOS DE CONTACTO:*\n`;
            message += `  - Nombre: ${formData.get('nombre')}\n`;
            message += `  - Teléfono: ${formData.get('telefono')}\n`;
            message += `  - Ubicación: ${formData.get('ubicacion') || 'No proporcionada'}\n`;
            const whatsappURL = `https://wa.me/593999115626?text=${encodeURIComponent(message)}`;
            window.open(whatsappURL, '_blank');
        });
    }
    
    if(modeloSelect) modeloSelect.addEventListener('change', () => { const otroModeloContainer = document.getElementById('otro-modelo-container'); const otroModeloInput = document.getElementById('otro-modelo'); if (modeloSelect.value === "Otro") { if(otroModeloContainer) { otroModeloContainer.style.display = 'block'; if(otroModeloInput) otroModeloInput.required = true; } updateLiveData('modelo', otroModeloInput.value); } else { if(otroModeloContainer) { otroModeloContainer.style.display = 'none'; if(otroModeloInput) otroModeloInput.required = false; } updateLiveData('modelo', modeloSelect.value); } anioSelect.disabled = false; populateAnios(); });
    if(anioSelect) anioSelect.addEventListener('change', () => { const otroAnioContainer = document.getElementById('otro-anio-container'); const otroAnioInput = document.getElementById('otro-anio'); if (anioSelect.value === "Otro") { if(otroAnioContainer){ otroAnioContainer.style.display = 'block'; if(otroAnioInput) otroAnioInput.required = true; } updateLiveData('anio', otroAnioInput.value); } else { if(otroAnioContainer) { otroAnioContainer.style.display = 'none'; if(otroAnioInput) otroAnioInput.required = false; } updateLiveData('anio', anioSelect.value); } });
    
    const otraMarcaInput = document.getElementById('otra-marca'); if(otraMarcaInput) otraMarcaInput.addEventListener('input', () => { if(brandDisplayName) brandDisplayName.textContent = (otraMarcaInput.value || 'OTRA MARCA').toUpperCase(); });
    const otroModeloInput = document.getElementById('otro-modelo'); if(otroModeloInput) otroModeloInput.addEventListener('input', () => updateLiveData('modelo', otroModeloInput.value));
    const otroAnioInput = document.getElementById('otro-anio'); if(otroAnioInput) otroAnioInput.addEventListener('input', () => updateLiveData('anio', otroAnioInput.value));
    
    if(descripcionTextarea) descripcionTextarea.addEventListener('input', () => updateLiveData('descripcion', descripcionTextarea.value));
    if(vinInput) vinInput.addEventListener('input', () => updateLiveData('vin', vinInput.value));
    if(nombreInput) nombreInput.addEventListener('input', () => updateLiveData('nombre', nombreInput.value));
    if(telefonoInput) telefonoInput.addEventListener('input', () => updateLiveData('telefono', telefonoInput.value));
    
    function populateVerticalCarousel() {
        const track = document.querySelector('#vertical-carousel .carousel-track');
        if (!track) return;
        const publiLogos = ['publi.png', 'publi2.png', 'publi3.png', 'publi4.png', 'publi5.png', 'publi6.png'];
        const brandLogos = marcasOrdenadas.map(marca => `images/logos/${marca.toLowerCase().replace(/[\s-.'&]/g, '')}.png`);
        const publiImagePaths = publiLogos.map(file => `images/publi/${file}`);
        let allLogos = [...publiImagePaths, ...brandLogos];
        for (let i = allLogos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [allLogos[i], allLogos[j]] = [allLogos[j], allLogos[i]]; }
        const fragment = document.createDocumentFragment();
        allLogos.forEach(src => { const img = new Image(); img.src = src; img.loading = 'lazy'; fragment.appendChild(img); });
        track.appendChild(fragment.cloneNode(true));
        track.appendChild(fragment.cloneNode(true));
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } });
    }, { threshold: 0.1 });

    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
    
    const logoObserver = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const logoWrappers = entry.target.querySelectorAll('.logo-wrapper');
                logoWrappers.forEach((wrapper, index) => {
                    wrapper.style.transitionDelay = `${index * 30}ms`;
                    observer.observe(wrapper);
                });
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    if(logosContainer) logoObserver.observe(logosContainer);

    const bgVideo = document.getElementById('bg-video');
    if (bgVideo) {
        const videos = ['images/videos/1.mp4', 'images/videos/2.mp4', 'images/videos/3.mp4', 'images/videos/4.mp4'];
        let currentVideoIndex = 0;
        bgVideo.playbackRate = 0.7;
        const playNextVideo = () => {
            currentVideoIndex = (currentVideoIndex + 1) % videos.length;
            const source = bgVideo.querySelector('source');
            if(source) {
                source.src = videos[currentVideoIndex];
                bgVideo.load();
                bgVideo.play().catch(error => console.log('Autoplay para el siguiente video fue prevenido:', error));
            }
        };
        bgVideo.addEventListener('ended', playNextVideo);
    }

    populateLogos();
    populateAnios();
    checkFormCompleteness();
    populateVerticalCarousel();
});