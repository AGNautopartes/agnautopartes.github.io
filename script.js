document.addEventListener('DOMContentLoaded', function() {

    // ==================================================================
    // == 1. CONFIGURACIÓN Y DECLARACIONES GLOBALES ==
    // ==================================================================
    const GOOGLE_API_KEY = 'AIzaSyCoSJrU2POi_8pFHzgro5XlCIIPsa1lt5M';
    const AI_MODEL = 'gemini-1.5-flash-latest';
    const makeWebhookLoggerUrl = 'https://hook.us2.make.com/2jlo910w1h103zmelro36zbqeqadvg10';

    const chatWidget = document.getElementById('chat-widget');
    // ... (El resto de las declaraciones de constantes del DOM no cambian)
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatMuteBtn = document.getElementById('chat-mute-btn');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatMicBtn = document.getElementById('chat-mic-btn');
    const assistantButtonHeader = document.getElementById('btn-assistant-header');
    const assistantButtonForm = document.getElementById('btn-assistant-form');
    
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
    const bgVideo = document.getElementById('bg-video');

    let conversationHistory = [
        { role: "user", parts: [{ text: `
          REGLAS ESTRICTAS DEL SISTEMA:
          
            1. Rol y Personalidad:
            Eres “Alex”, asistente virtual de AGN AutoRepuestos Cuenca.
            Tono: amable, empático y profesional, con toques de humor ligero para generar confianza.
            Regla clave: Habla como un amigo experto en autos, pero con respeto y uso constante de “usted”.

            2. Misión Principal:
            Tu objetivo es ayudar al cliente a cotizar un repuesto consiguiendo los datos necesarios, sin sonar mecánico ni insistente.
            Si el cliente no da toda la información, la obtienes con preguntas suaves y conversacionales.

            3. Datos Necesarios para Cotizar:
            Nombre del cliente.
            Marca del vehículo.
            Modelo.
            Año.
            Repuesto solicitado.
            Número de teléfono.
            VIN (opcional si no lo tiene).

            4. Flujo Conversacional Inteligente:
            Inicio:
            “¡Hola! Soy Alex, su asistente de AGN AutoRepuestos. Con gusto le ayudo con su repuesto. ¿Podría indicarme su nombre, el vehículo que tiene y qué pieza necesita?”
            Si falta información:
            “Perfecto, tenemos un Toyota Hilux 2017. ¿Me comparte su número de teléfono para continuar con la cotización?”
            Redirección Suave:
            Si el cliente habla de otra cosa:
            “¡Sí, el clima está raro! Volviendo a su auto, ¿me dice el modelo exacto?”

            5. Identificación de Repuestos:
            Si el cliente no sabe el nombre:
            “No se preocupe, lo resolvemos juntos. ¿Está en la parte delantera o trasera del auto?”
            “¿Es del motor, frenos, luces o interior?”
            “¿Qué dejó de funcionar o qué ruido escucha?”
            Luego confirmas:
            “Por lo que me dice, parece que es la bomba de agua. ¿Es correcto?”

            6. Manejo de Estados de Ánimo:
            Cliente apurado:
            “Para hacerlo rápido, ¿marca, modelo y año del auto?”

            Cliente molesto:
            “Entiendo su frustración, conseguir repuestos puede ser un lío… pero yo lo haré fácil. ¿Qué pieza buscamos?”

            Cliente indeciso:
            “No pasa nada, lo hacemos paso a paso. Dígame lo que sabe y le guío.”

            7. Uso de Humor Natural:
            Pequeñas frases para relajar:

                “Esto no es una carrera de Fórmula 1, pero vamos a conseguir su pieza rápido.”
                “¡Buscar repuestos no tiene que ser una misión imposible, para eso estoy yo!”

                Nunca uses humor si el cliente está molesto, salvo algo empático como:

                “Sí, entiendo, buscar repuestos a veces es tan complicado como encontrar un tornillo en el piso… ¡pero lo haremos fácil!”

            8. Regla RESUMEN:
                Si el cliente pide hablar con un humano:

                “Por supuesto. Puede contactar directamente a nuestro experto Pedro al 0999115626.” (No digas nada más después de esto).

                    3 GUIONES DE EJEMPLO
                    1. Cliente Apurado
                    Cliente: “Hola, necesito un repuesto pero tengo prisa.”
                    Alex: “¡Hola! Tranquilo, voy al grano. ¿Marca, modelo y año del auto?”
                    Cliente: “Toyota Hilux 2017.”
                    Alex: “Perfecto. ¿Qué pieza necesita?”
                    Cliente: “Las pastillas de freno delanteras.”
                    Alex: “Anotado. Solo me confirma su nombre y número para enviarle la cotización. ¡Prometo que no tardo más que un semáforo en verde!”

                    2. Cliente Indeciso
                    Cliente: “No sé bien qué pieza es, suena algo raro.”
                    Alex: “¡No pasa nada! Para eso estoy. ¿El ruido es adelante o atrás?”
                    Cliente: “Adelante.”
                    Alex: “¿Se siente cuando frena o cuando arranca?”
                    Cliente: “Cuando frena.”
                    Alex: “Entonces parece que son pastillas de freno. ¿Le suena correcto?”
                    Cliente: “Sí, creo que sí.”
                    Alex: “¡Perfecto! ¿Marca, modelo y año de su auto para armar la cotización?”

                    3. Cliente Conversador
                    Cliente: “Qué calor hace hoy.”
                    Alex: “¡Ni que lo diga! Los autos deben sentirlo también. Hablando de su auto, ¿me dice qué modelo tiene para su repuesto?”
                    Cliente: “Es un Chevrolet Spark.”
                    Alex: “¡Un clásico! ¿Qué año es y qué pieza busca?”




          9.  **REGLA DE ORO - ACCIÓN FINAL:**
              - **CUANDO TENGAS LOS 6 DATOS OBLIGATORIOS**, tu siguiente y ÚLTIMA respuesta debe ser NADA MÁS QUE EL OBJETO JSON.
              - **NO ESCRIBAS TEXTO INTRODUCTORIO NI USES BLOQUES DE CÓDIGO.**
              - Tu respuesta debe empezar con "{" y terminar con "}".
              - **Utiliza la siguiente estructura EXACTA para el JSON:**
                {
                  "accion": "registrar_cotizacion",
                  "datos": {
                    "nombre_cliente": "El nombre que recopilaste",
                    "contacto_cliente": "El teléfono que recopilaste",
                    "marca_vehiculo": "La marca que recopilaste",
                    "modelo_vehiculo": "El modelo que recopilaste",
                    "año_vehiculo": "El año que recopilaste",
                    "vin_vehiculo": "El VIN que recopilaste, o 'No proporcionado'",
                    "repuesto_solicitado": "El nombre específico de la pieza que el cliente necesita",
                    "observaciones_resumen": "Un resumen muy breve y profesional de la solicitud, incluyendo la descripción del problema si el cliente necesitó ayuda para identificar la pieza.",
                    "texto_chat_completo": "TODO el historial de la conversación entre el usuario y tú, formateado como un solo bloque de texto."
                  }
                }
        `}]},
        { role: "model", parts: [{ text: "¡Hola! Soy Alex, su asistente de AGN AutoRepuestos. Con gusto le ayudaré a cotizar su repuesto. ¿Podría indicarme su nombre, el vehículo que tiene y qué pieza necesita?" }]}
    ];
    
    // ... (El resto del código: constantes de marcas, clase VoiceAssistant, y todas las funciones permanecen sin cambios)
    
    const marcasPopulares = ["Chevrolet", "Kia", "Toyota", "Hyundai", "Suzuki", "Renault", "Great Wall", "Mazda", "Nissan", "Ford", "Volkswagen", "Mitsubishi"];
    const marcasFullList = { "Chevrolet": ["Onix", "Onix RS", "Onix Turbo Sedán", "Joy HB", "Joy Sedán", "Aveo", "Spark GT", "Spark Life", "Beat", "Sail", "Cavalier", "Cruze", "Bolt", "Bolt-EUV", "Groove", "Tracker", "Captiva", "Captiva XL", "Equinox-EV", "Blazer-RS-EV", "Tahoe", "Trailblazer", "Montana", "D-Max (varias gen.)", "Colorado", "Silverado", "Blazer (hist.)", "Trooper", "LUV", "Luv-D-Max", "Rodeo", "Gemini", "Corsa", "Esteem", "Forsa", "Vitara (3 puertas)", "Vitara (5 puertas)", "Grand Vitara", "Blue-Bird", "chasis MR-buses"], "Kia": ["Picanto", "Rio", "Rio-5", "Soluto", "Cerato", "K3", "Carens", "Carnival", "Stonic", "Stonic Hybrid", "Seltos", "Sonet", "Sportage", "Sorento", "Niro", "Niro-EV", "EV6", "EV5", "EV9", "Soul-EV"], "Toyota": ["Agya", "Yaris", "Yaris Sport", "Yaris Cross", "Corolla", "Corolla Híbrido", "Corolla Cross Híbrido", "C-HR", "Raize", "RAV4", "Rush", "Prius", "Prius-C", "Innova", "Hilux", "Tacoma", "Fortuner", "Land Cruiser Prado", "Land Cruiser 200", "Land Cruiser 300", "4Runner", "FJ Cruiser", "Starlet", "Tercel", "Celica"], "Hyundai": ["Accent", "Grand i10", "Elantra", "Sonata", "Venue", "Kona", "Kona Hybrid", "Tucson", "Santa Fe", "Creta", "Staria"], "Chery": ["QQ3", "QQ6", "Nice-A1", "Van-Pass", "XCross", "Arrizo-3", "Arrizo-5", "Tiggo", "Tiggo-2", "Tiggo-2 Pro", "Tiggo-3", "Tiggo-4", "Tiggo-5", "Tiggo-7", "Tiggo-7 Pro", "Tiggo-8", "Tiggo-8 Pro"], "Suzuki": ["Swift", "Baleno", "Celerio", "Ignis", "Vitara", "Grand Vitara", "Jimny", "XL7", "Ertiga", "S-Cross", "SX4"], "Renault": ["Kwid", "Sandero", "Logan", "Stepway", "Duster", "Captur", "Koleos", "Oroch", "Kangoo", "Symbol", "Megane", "Fluence"], "Great Wall": ["Wingle-1", "Wingle-2", "Wingle-3", "Poer", "Haval H2", "Haval H6", "Haval H9", "Haval Jolion", "Haval F7", "M4", "ORA Good-Cat", "Tank-300"], "JAC": ["J2", "J4", "J5", "S2", "S3", "S5", "S7", "T40", "T60", "V7", "HFC-1037"], "DFSK": ["Glory-500", "Glory-560", "Glory-580", "F5", "Mini Truck", "C31", "C52", "EC35", "K05", "K07"], "Volkswagen": ["Gol", "Escarabajo (Tipo-1)", "Voyage", "Polo", "Virtus", "T-Cross", "Tiguan", "Taigo", "Jetta", "Passat", "Amarok"], "Nissan": ["March", "Versa", "Sentra", "Kicks", "X-Trail", "Frontier", "NV350", "Pathfinder", "Note", "Micra"], "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-9", "CX-50", "CX-90", "BT-50"], "Dongfeng": ["Rich-6", "Rich-7", "Rich-12", "S30", "Husky", "EQ2030", "EQ2050", "580", "580 Pro", "mini-van Q30"], "Sinotruk": ["Howo-7", "Howo-9", "A7", "G7", "T5G", "ZZ1257", "ZZ1325", "ZZ1507", "ZZ3317", "ZZ4251"], "Jetour": ["X70", "X90", "X95", "T1", "T5", "T8", "Dasheng", "Cruiser", "XC", "Cooler"], "Ford": ["Fiesta", "EcoSport", "Ranger", "Explorer", "Mustang", "Transit", "Everest", "Bronco", "F-150", "Edge"], "Changan": ["CS35", "CS55", "CS75", "CS85", "Alsvin", "UNI-T", "Eado", "Eado Xt", "Benni", "CS15"], "BYD": ["Atto-3", "Dolphin", "Seal", "Song-Plus", "Tang", "Yuan-EV", "Qin", "e1", "e2", "Han"], "Subaru": ["Impreza", "XV", "Forester", "Outback", "WRX", "Crosstrek", "Legacy", "BRZ", "Solterra", "Ascent"], "Citroen": ["C3", "C3 Aircross", "C4", "C5 Aircross", "Berlingo", "C-Elysée", "C4 Cactus", "Spacetourer", "Jumpy", "Jumper"], "Fiat": ["500", "Panda", "Punto", "Tipo", "Toro", "Strada", "Argo", "Uno", "Ducato", "Fiorino"], "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Avenger", "Commander", "Wagoneer", "Patriot"], "Honda": ["Fit", "City", "Civic", "Accord", "CR-V", "HR-V", "Pilot", "BR-V", "Ridgeline", "Insight"], "BMW": ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "Serie 7", "X1", "X3", "X5", "Z4"], "Audi": ["A3", "A4", "A6", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT"], "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "CLA", "G-Class"], "Porsche": ["911", "Cayman", "Boxster", "Macan", "Cayenne", "Taycan", "Panamera", "718", "924", "928"] };
    const marcasOtras = Object.keys(marcasFullList).filter(m => !marcasPopulares.includes(m));
    const marcasOrdenadas = [...marcasPopulares, ...marcasOtras];

    // ==================================================================
    // == 2. CLASE ROBUSTA PARA MANEJO DE VOZ (PUSH-TO-TALK) ==
    // ==================================================================
    class VoiceAssistant {
        constructor() {
            this.synth = window.speechSynthesis;
            this.recognition = this.getSpeechRecognition();
            this.isMuted = false;
            this.voices = [];
            
            this.loadVoices();
            if (this.synth && this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = () => this.loadVoices();
            }

            if (this.recognition) {
                this.setupRecognition();
            }
    
            if (chatMuteBtn) {
                chatMuteBtn.addEventListener('click', () => this.toggleMute());
            }
        }

        getSpeechRecognition() {
            const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognitionAPI) {
                if (chatMicBtn) chatMicBtn.style.display = 'flex';
                return new SpeechRecognitionAPI();
            }
            if (chatMicBtn) chatMicBtn.style.display = 'none';
            console.warn("Speech Recognition no es soportado en este navegador.");
            return null;
        }

        loadVoices() {
            this.voices = this.synth.getVoices().filter(voice => voice.lang.startsWith('es'));
        }

        speak(text, onEndCallback = null) {
            if (this.isMuted || !text || !this.synth) {
                if(onEndCallback) onEndCallback();
                return;
            }
            if (this.synth.speaking) this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 1.2;

            let selectedVoice;
            const maleNames = ['jorge', 'diego', 'pablo', 'carlos', 'male', 'hombre'];
            
            selectedVoice = this.voices.find(voice => voice.name.includes('Google') && maleNames.some(name => voice.name.toLowerCase().includes(name)));
            if (!selectedVoice) {
                selectedVoice = this.voices.find(voice => maleNames.some(name => voice.name.toLowerCase().includes(name)));
            }
            if (!selectedVoice) {
                selectedVoice = this.voices.find(voice => voice.lang === 'es-ES') || this.voices[0];
            }
            
            if (selectedVoice) utterance.voice = selectedVoice;
            
            utterance.onend = onEndCallback;
            utterance.onerror = (e) => {
                console.error("Error en la síntesis de voz:", e.error);
                if(onEndCallback) onEndCallback();
            };
            this.synth.speak(utterance);
        }
        
        setupRecognition() {
            this.recognition.lang = 'es-ES';
            this.recognition.continuous = false;
            this.recognition.interimResults = false;

            if(chatMicBtn) {
                chatMicBtn.addEventListener('mousedown', () => {
                    try {
                        this.synth.cancel();
                        this.recognition.start();
                    } catch(e) { console.error("Error al iniciar reconocimiento:", e); }
                });
                chatMicBtn.addEventListener('mouseup', () => {
                    try {
                        this.recognition.stop();
                    } catch(e) { console.error("Error al detener reconocimiento:", e); }
                });
                chatMicBtn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    try {
                        this.synth.cancel();
                        this.recognition.start();
                    } catch(e) { console.error("Error al iniciar reconocimiento táctil:", e); }
                });
                chatMicBtn.addEventListener('touchend', () => {
                    try {
                        this.recognition.stop();
                    } catch(e) { console.error("Error al detener reconocimiento táctil:", e); }
                });
            }

            this.recognition.onstart = () => chatMicBtn.classList.add('is-listening');
            this.recognition.onend = () => chatMicBtn.classList.remove('is-listening');
            this.recognition.onerror = (e) => {
                console.error("Error de reconocimiento de voz:", e.error);
                let errorMessage = "Ocurrió un error con el reconocimiento de voz.";
                if (e.error === 'no-speech') errorMessage = "No pude escucharte. Por favor, mantén presionado y habla.";
                if (e.error === 'not-allowed') errorMessage = "Permiso al micrófono denegado.";
                addMessage('assistant', errorMessage);
                this.speak(errorMessage);
            };

            this.recognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript.trim();
                if(transcript) {
                    chatInput.value = transcript;
                    chatSendBtn.click();
                }
            };
        }

        toggleMute() {
            this.isMuted = !this.isMuted;
            const iconMuted = document.getElementById('icon-muted');
            const iconUnmuted = document.getElementById('icon-unmuted');
            if (iconMuted && iconUnmuted) {
                iconMuted.style.display = this.isMuted ? 'block' : 'none';
                iconUnmuted.style.display = this.isMuted ? 'none' : 'block';
            }
            if (this.isMuted) this.synth.cancel();
            chatMuteBtn.setAttribute('aria-label', this.isMuted ? 'Activar sonido' : 'Silenciar');
        }
    }

    const voiceAssistant = new VoiceAssistant();


    // ==================================================================
    // == 3. LÓGICA DE MENSAJERÍA Y COMUNICACIÓN CON IA ==
    // ==================================================================
    
    function addMessage(sender, text, isThinking = false) { if (!chatMessages) return; const existingThinkingMessage = document.getElementById('thinking-message'); if (existingThinkingMessage) existingThinkingMessage.remove(); const messageElement = document.createElement('div'); messageElement.classList.add('chat-message', `${sender}-message`); if (isThinking) { messageElement.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>'; messageElement.id = 'thinking-message'; } else { messageElement.textContent = text; } chatMessages.appendChild(messageElement); chatMessages.scrollTop = chatMessages.scrollHeight; return messageElement; }
    
    async function handleSendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText || chatSendBtn.disabled) return;
        
        addMessage('user', messageText);
        conversationHistory.push({ role: 'user', parts: [{ text: messageText }] });
        chatInput.value = '';
        chatSendBtn.disabled = true;
        addMessage('assistant', '', true);
        
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: conversationHistory }), });
            const existingThinkingMessage = document.getElementById('thinking-message');
            if (existingThinkingMessage) existingThinkingMessage.remove();
            if (!response.ok) throw new Error(`Error de API: ${response.statusText}`);
            const data = await response.json();
            if (!data.candidates || data.candidates.length === 0) throw new Error("Respuesta de API inválida.");
            const aiResponseText = data.candidates[0].content.parts[0].text;
            
            let isJsonResponse = false;
            try {
                const responseObject = JSON.parse(aiResponseText);
                if (responseObject.accion === 'registrar_cotizacion' && responseObject.datos) {
                    isJsonResponse = true;
                    const confirmationMessage = "¡Excelente! He rellenado los datos en el formulario. Por favor, revísalos y presiona el botón de WhatsApp para finalizar.";
                    await logDataToMake(responseObject.datos);
                    populateFormFromAI(responseObject.datos);
                    addMessage('assistant', confirmationMessage);
                    voiceAssistant.speak(confirmationMessage, () => {
                        setTimeout(() => chatWidget.classList.add('hidden'), 1000);
                    });
                    conversationHistory.push({ role: 'model', parts: [{ text: confirmationMessage }] });
                }
            } catch (e) { /* No es JSON, se maneja abajo */ }

            if (!isJsonResponse) {
                conversationHistory.push({ role: 'model', parts: [{ text: aiResponseText }] });
                addMessage('assistant', aiResponseText);
                voiceAssistant.speak(aiResponseText);
            }

        } catch (error) {
            console.error('Error en handleSendMessage:', error);
            const errorMsg = 'Lo siento, hubo un problema de conexión. Intente de nuevo.';
            addMessage('assistant', errorMsg);
            voiceAssistant.speak(errorMsg);
        } finally {
            chatSendBtn.disabled = false;
            if(chatInput) chatInput.focus();
        }
    }
    
    // ==================================================================
    // == 4. LÓGICA DE FORMULARIO Y DOM ==
    // ==================================================================
    
    async function logDataToMake(data) { if (!makeWebhookLoggerUrl) { console.error("URL del webhook de Make.com no configurada."); return; } try { const now = new Date(); const fullData = { ...data, fecha: now.toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' }), hora: now.toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil' }) }; await fetch(makeWebhookLoggerUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullData) }); console.log("Datos enviados a Make.com."); } catch (error) { console.error("Error al enviar datos a Make.com:", error); } }
    let chatListenersAdded = false; function addChatListeners() { if (chatListenersAdded || !chatSendBtn || !chatInput) return; chatSendBtn.addEventListener('click', handleSendMessage); chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendMessage(); } }); chatListenersAdded = true; }
    
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
        if(document.getElementById('otro-modelo')) document.getElementById('otro-modelo').required = false;
        document.getElementById('otro-anio-container').style.display = 'none';
        if(document.getElementById('otro-anio')) document.getElementById('otro-anio').required = false;

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
        
        vinInput.value = data.vin_vehiculo;
        updateLiveData('vin', vinInput.value);

        telefonoInput.value = data.contacto_cliente.replace(/\D/g, ''); 
        updateLiveData('telefono', telefonoInput.value);
        
        if (data.nombre_cliente && data.nombre_cliente !== 'No proporcionado') { 
            nombreInput.value = data.nombre_cliente; 
            updateLiveData('nombre', data.nombre_cliente); 
        }

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