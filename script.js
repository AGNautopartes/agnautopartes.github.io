document.addEventListener('DOMContentLoaded', function () {

    // ==================================================================
    // == 1. CONFIGURACIÓN Y DECLARACIONES GLOBALES ==
    // ==================================================================
    // La clave de API ya no se guarda aquí, se usa el backend seguro de Vercel.

    const makeWebhookLoggerUrl = 'https://hook.us2.make.com/2jlo910w1h103zmelro36zbqeqadvg10';

    // URL base de la API: si estamos en GitHub Pages, usamos Vercel. Si estamos en Vercel, usamos rutas relativas.
    const API_BASE_URL = window.location.hostname === 'agnautopartes.github.io'
        ? 'https://agnautopartes.vercel.app'
        : '';


    const chatWidget = document.getElementById('chat-widget');
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

     // --- ESTRATEGIA DE ROLES ---
    // 1. Guardamos cada personalidad de la IA en su propia constante.

    const ASSISTANT_ALEX_PROMPT = `
      STRICT SYSTEM RULES:
      1. Role: You are “Alex,” a friendly, professional virtual assistant and an expert in spare parts for AGN AutoRepuestos Cuenca. Always address customers formally using “usted” style in neutral Ecuadorian Spanish. Your goal is to help identify the spare part without making mechanical diagnoses.
      2. Main Mission: Collect exactly 6 pieces of information to provide a quotation: Name, Phone (WhatsApp), Brand, Model, Year (4 digits), and Requested Spare Part. Do not provide prices or stock availability until all 6 data points are collected.
      3. Response Format: Plain text only. Never use markdown, JSON, or special formats. Keep messages short, ending with a question to gather missing information.
      4. Conversation Flow: Start with "¡Hola! Soy Alex, su asistente de AGN AutoRepuestos. Con gusto le ayudo. ¿Podría indicarme su nombre, el vehículo que tiene (marca, modelo, año), y la pieza que necesita?". Confirm provided data and ask for what's missing. If the client doesn't know the part name, ask for mechanic's advice, part number, VIN, or photo, but DO NOT diagnose based on symptoms.
      5. Tone Management: If the client is in a hurry, be quick: "¡Hola! Tranquilo, voy al grano. ¿Marca, modelo y año del auto?". If upset: "Entiendo su frustración. Lo haré fácil para usted. ¿Qué pieza buscamos?".
      6. Human Escalation: If asked to speak with a person, your ONLY reply is: “Of course. You can contact Pedro, Regional Manager, directly at 0999115626.”
      7. FINAL AND ABSOLUTE RULE: Once you have the 6 mandatory data points, your ONLY and EXCLUSIVE response will be the JSON object. NO GREETINGS. NO EXPLANATIONS. NO INTRODUCTORY TEXT. Your response MUST start with “{” and end with “}”. ANY TEXT OUTSIDE THE JSON IS A SERIOUS ERROR AND STRICTLY FORBIDDEN. Use this EXACT structure:
      { "accion": "registrar_cotizacion", "datos": { "nombre_cliente": "The name you collected", "contacto_cliente": "The phone you collected", "marca_vehiculo": "The brand you collected", "modelo_vehiculo": "The model you collected", "año_vehiculo": "The year you collected", "repuesto_solicitado": "The specific part name you collected", "numero_de_parte": "The part number if provided, or 'No proporcionado'", "ciudad": "The city if mentioned, or 'No proporcionado'", "provincia": "The province if mentioned, or 'No proporcionado'", "observaciones_resumen": "A brief professional summary of the request.", "texto_chat_completo": "The entire conversation history." } }
    `;

    const PRODUCT_ANALYST_PROMPT = `
      STRICT SYSTEM RULES - ROLE: Product Analyst
      1. Activation: This role is now active. Your previous persona is gone.
      2. Mission: Search globally for the requested spare part based on the user's request. Deliver: Part number (Spanish/English), two purchase options (one premium, one alternative), direct product links, lead time (2-4 weeks), and final calculated price for Ecuador (VAT included).
      3. Input Analysis: Extract part name, make, model, year, VIN, and OEM from the user's last message and the conversation history.
      4. Part Number Search: Use online catalogs like Partsouq, Nemiga, SSG Asia, RockAuto to find the OEM number if not provided.
      5. Price Search: Use marketplaces like eBay, Amazon, RockAuto, and Autodoc to find pricing. Search by OEM number first.
      6. Price Calculation for Ecuador: If origin=USA, weight(lbs)×10. If origin=Asia, weight(lbs)×15. If origin=Europe, weight(lbs)×13. If weight>4kg OR FOB>$400, add $30. Multiply subtotal × 1.105. Add 25% markup. Final result is "Final Price + VAT".
      7. Output Format: Provide only 2 options. Each must include: Part number, OEM, Direct link, Final price in Ecuador (+ VAT), Lead time (2-4 weeks). End with: “Are you interested in buying this part?”
      8. Tone and Rules: Professional, concise, no greetings, no calculation explanations. If the part isn't found, request more specific info like VIN or engine code. Never invent data.
    `;

    // 2. La conversación se inicia con el rol de "Alex" por defecto.
    let conversationHistory = [
        {
            role: "system",
            content: ASSISTANT_ALEX_PROMPT
        },
        {
            role: "assistant",
            content: "¡Hola! Soy Alex, su asistente de AGN AutoRepuestos. Con gusto le ayudo. ¿Podría indicarme su nombre, el vehículo que tiene (marca, modelo, año), y la pieza que necesita?"
        }
    ];

    const marcasPopulares = ["Chevrolet", "Kia", "Toyota", "Hyundai", "Suzuki", "Renault", "Great Wall", "Mazda", "Nissan", "Ford", "Volkswagen", "Mitsubishi"];
    const marcasFullList = { "Chevrolet": ["Onix", "Onix RS", "Onix Turbo Sedán", "Joy HB", "Joy Sedán", "Aveo", "Spark GT", "Spark Life", "Beat", "Sail", "Cavalier", "Cruze", "Bolt", "Bolt-EUV", "Groove", "Tracker", "Captiva", "Captiva XL", "Equinox-EV", "Blazer-RS-EV", "Tahoe", "Trailblazer", "Montana", "D-Max (varias gen.)", "Colorado", "Silverado", "Blazer (hist.)", "Trooper", "LUV", "Luv-D-Max", "Rodeo", "Gemini", "Corsa", "Esteem", "Forsa", "Vitara (3 puertas)", "Vitara (5 puertas)", "Grand Vitara", "Blue-Bird", "chasis MR-buses"], "Kia": ["Picanto", "Rio", "Rio-5", "Soluto", "Cerato", "K3", "Carens", "Carnival", "Stonic", "Stonic Hybrid", "Seltos", "Sonet", "Sportage", "Sorento", "Niro", "Niro-EV", "EV6", "EV5", "EV9", "Soul-EV"], "Toyota": ["Agya", "Yaris", "Yaris Sport", "Yaris Cross", "Corolla", "Corolla Híbrido", "Corolla Cross Híbrido", "C-HR", "Raize", "RAV4", "Rush", "Prius", "Prius-C", "Innova", "Hilux", "Tacoma", "Fortuner", "Land Cruiser Prado", "Land Cruiser 200", "Land Cruiser 300", "4Runner", "FJ Cruiser", "Starlet", "Tercel", "Celica"], "Hyundai": ["Accent", "Grand i10", "Elantra", "Sonata", "Venue", "Kona", "Kona Hybrid", "Tucson", "Santa Fe", "Creta", "Staria"], "Chery": ["QQ3", "QQ6", "Nice-A1", "Van-Pass", "XCross", "Arrizo-3", "Arrizo-5", "Tiggo", "Tiggo-2", "Tiggo-2 Pro", "Tiggo-3", "Tiggo-4", "Tiggo-5", "Tiggo-7", "Tiggo-7 Pro", "Tiggo-8", "Tiggo-8 Pro"], "Suzuki": ["Swift", "Baleno", "Celerio", "Ignis", "Vitara", "Grand Vitara", "Jimny", "XL7", "Ertiga", "S-Cross", "SX4"], "Renault": ["Kwid", "Sandero", "Logan", "Stepway", "Duster", "Captur", "Koleos", "Oroch", "Kangoo", "Symbol", "Megane", "Fluence"], "Great Wall": ["Wingle-1", "Wingle-2", "Wingle-3", "Poer", "Haval H2", "Haval H6", "Haval H9", "Haval Jolion", "Haval F7", "M4", "ORA Good-Cat", "Tank-300"], "JAC": ["J2", "J4", "J5", "S2", "S3", "S5", "S7", "T40", "T60", "V7", "HFC-1037"], "DFSK": ["Glory-500", "Glory-560", "Glory-580", "F5", "Mini Truck", "C31", "C52", "EC35", "K05", "K07"], "Volkswagen": ["Gol", "Escarabajo (Tipo-1)", "Voyage", "Polo", "Virtus", "T-Cross", "Tiguan", "Taigo", "Jetta", "Passat", "Amarok"], "Nissan": ["March", "Versa", "Sentra", "Kicks", "X-Trail", "Frontier", "NV350", "Pathfinder", "Note", "Micra"], "Mazda": ["Mazda2", "Mazda3", "Mazda6", "CX-3", "CX-30", "CX-5", "CX-9", "CX-50", "CX-90", "BT-50"], "Dongfeng": ["Rich-6", "Rich-7", "Rich-12", "S30", "Husky", "EQ2030", "EQ2050", "580", "580 Pro", "mini-van Q30"], "Sinotruk": ["Howo-7", "Howo-9", "A7", "G7", "T5G", "ZZ1257", "ZZ1325", "ZZ1507", "ZZ3317", "ZZ4251"], "Jetour": ["X70", "X90", "X95", "T1", "T5", "T8", "Dasheng", "Cruiser", "XC", "Cooler"], "Ford": ["Fiesta", "EcoSport", "Ranger", "Explorer", "Mustang", "Transit", "Everest", "Bronco", "F-150", "Edge"], "Changan": ["CS35", "CS55", "CS75", "CS85", "Alsvin", "UNI-T", "Eado", "Eado Xt", "Benni", "CS15"], "BYD": ["Atto-3", "Dolphin", "Seal", "Song-Plus", "Tang", "Yuan-EV", "Qin", "e1", "e2", "Han"], "Subaru": ["Impreza", "XV", "Forester", "Outback", "WRX", "Crosstrek", "Legacy", "BRZ", "Solterra", "Ascent"], "Citroen": ["C3", "C3 Aircross", "C4", "C5 Aircross", "Berlingo", "C-Elysée", "C4 Cactus", "Spacetourer", "Jumpy", "Jumper"], "Fiat": ["500", "Panda", "Punto", "Tipo", "Toro", "Strada", "Argo", "Uno", "Ducato", "Fiorino"], "Jeep": ["Renegade", "Compass", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Avenger", "Commander", "Wagoneer", "Patriot"], "Honda": ["Fit", "City", "Civic", "Accord", "CR-V", "HR-V", "Pilot", "BR-V", "Ridgeline", "Insight"], "BMW": ["Serie 1", "Serie 2", "Serie 3", "Serie 4", "Serie 5", "Serie 7", "X1", "X3", "X5", "Z4"], "Audi": ["A3", "A4", "A6", "A8", "Q2", "Q3", "Q5", "Q7", "Q8", "TT"], "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "GLA", "GLC", "GLE", "GLS", "CLA", "G-Class"], "Porsche": ["911", "Cayman", "Boxster", "Macan", "Cayenne", "Taycan", "Panamera", "718", "924", "928"] };
    const marcasOtras = Object.keys(marcasFullList).filter(m => !marcasPopulares.includes(m));
    const marcasOrdenadas = [...marcasPopulares, ...marcasOtras];

    // ==================================================================
    // == 2. CLASE ROBUSTA PARA MANEJO DE VOZ ==
    // ==================================================================
    class VoiceAssistant {
        constructor() {
            this.synth = window.speechSynthesis;
            this.recognition = this.getSpeechRecognition();
            this.isMuted = false;
            this.voices = [];
            this.finalTranscript = '';

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
                if (onEndCallback) onEndCallback();
                return;
            }
            if (this.synth.speaking) this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-ES';
            utterance.rate = 1.2;

            let selectedVoice;
            const maleNames = ['jorge', 'diego', 'pablo', 'carlos', 'male', 'hombre'];

            selectedVoice = this.voices.find(voice => voice.name.includes('Google') && maleNames.some(name => voice.name.toLowerCase().includes(name)));
            if (!selectedVoice) selectedVoice = this.voices.find(voice => maleNames.some(name => voice.name.toLowerCase().includes(name)));
            if (!selectedVoice) selectedVoice = this.voices.find(voice => voice.lang === 'es-ES') || this.voices[0];

            if (selectedVoice) utterance.voice = selectedVoice;

            utterance.onend = onEndCallback;
            utterance.onerror = (e) => {
                console.error("Error en la síntesis de voz:", e.error);
                if (onEndCallback) onEndCallback();
            };
            this.synth.speak(utterance);
        }

        setupRecognition() {
            this.recognition.lang = 'es-ES';
            this.recognition.continuous = true;
            this.recognition.interimResults = true;

            const startRecognition = (e) => {
                e.preventDefault();
                if (chatMicBtn.classList.contains('is-listening')) return;
                this.synth.cancel();
                this.finalTranscript = '';
                chatInput.value = '';
                try {
                    this.recognition.start();
                } catch (err) {
                    console.error("Error al iniciar reconocimiento:", err);
                }
            };

            const stopRecognition = () => {
                if (chatMicBtn.classList.contains('is-listening')) {
                    this.recognition.stop();
                }
            };

            if (chatMicBtn) {
                chatMicBtn.addEventListener('mousedown', startRecognition);
                chatMicBtn.addEventListener('mouseup', stopRecognition);
                chatMicBtn.addEventListener('mouseleave', stopRecognition);
                chatMicBtn.addEventListener('touchstart', startRecognition, { passive: false });
                chatMicBtn.addEventListener('touchend', stopRecognition);
            }

            this.recognition.onstart = () => chatMicBtn.classList.add('is-listening');

            this.recognition.onend = () => {
                chatMicBtn.classList.remove('is-listening');
                if (this.finalTranscript.trim()) {
                    chatInput.value = this.finalTranscript.trim();
                    chatSendBtn.click();
                }
            };

            this.recognition.onerror = (e) => {
                console.error("Error de reconocimiento de voz:", e.error);
                let errorMessage = "Ocurrió un error con el reconocimiento de voz.";
                if (e.error === 'no-speech') errorMessage = "No pude escucharte. Por favor, mantén presionado y habla.";
                if (e.error === 'not-allowed') errorMessage = "Permiso al micrófono denegado.";
                addMessage('assistant', errorMessage);
                this.speak(errorMessage);
            };

            this.recognition.onresult = (event) => {
                let interim_transcript = '';
                let final_transcript = '';
                for (let i = 0; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final_transcript += event.results[i][0].transcript;
                    } else {
                        interim_transcript += event.results[i][0].transcript;
                    }
                }
                this.finalTranscript = final_transcript;
                chatInput.value = final_transcript + interim_transcript;
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

    function addMessage(sender, text, isThinking = false) {
        if (!chatMessages) return;
        const existingThinkingMessage = document.getElementById('thinking-message');
        if (existingThinkingMessage) existingThinkingMessage.remove();
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        if (isThinking) {
            messageElement.innerHTML = '<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span>';
            messageElement.id = 'thinking-message';
        } else {
            messageElement.textContent = text;
        }
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageElement;
    }

    async function handleSendMessage() {
        const messageText = chatInput.value.trim();
        if (!messageText || chatSendBtn.disabled) return;

        addMessage('user', messageText);

        const triggerPhrase = 'véndeme la parte';
        if (messageText.toLowerCase().includes(triggerPhrase)) {
            conversationHistory[0].content = PRODUCT_ANALYST_PROMPT;
            conversationHistory.push({ role: 'user', content: messageText });
            const modeChangeMessage = "Entendido. Cambiando a modo de análisis de producto para buscar su repuesto. Un momento por favor...";
            addMessage('assistant', modeChangeMessage);
            conversationHistory.push({ role: 'assistant', content: modeChangeMessage });
        } else {
            conversationHistory.push({ role: 'user', content: messageText });
        }

        chatInput.value = '';
        chatSendBtn.disabled = true;
        addMessage('assistant', '', true);

         try {
             const response = await fetch(`${API_BASE_URL}/api/generate`, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ conversationHistory }),
             });

            const existingThinkingMessage = document.getElementById('thinking-message');
            if (existingThinkingMessage) existingThinkingMessage.remove();

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error de API: ${errorData.error.message || response.statusText}`);
            }

            const data = await response.json();

            if (!data.candidates || data.candidates.length === 0) {
                throw new Error("Respuesta de API de Gemini inválida.");
            }

            const aiResponseText = data.candidates[0].content.parts[0].text;

            let isJsonResponse = false;
            if (conversationHistory[0].content !== PRODUCT_ANALYST_PROMPT) {
                const jsonRegex = /\{[\s\S]*\}/;
                const jsonMatch = aiResponseText.match(jsonRegex);

                if (jsonMatch) {
                    try {
                        const jsonObject = JSON.parse(jsonMatch[0]);
                        if (jsonObject.accion === 'registrar_cotizacion' && jsonObject.datos) {
                            isJsonResponse = true;
                            const confirmationMessage = "¡Excelente! He rellenado los datos en el formulario. Por favor, revísalos y presiona el botón de WhatsApp para finalizar.";
                            await logDataToMake(jsonObject.datos);
                            await saveQuotationToSupabase({ ...jsonObject.datos, source: 'alex_assistant' });
                            populateFormFromAI(jsonObject.datos);
                            addMessage('assistant', confirmationMessage);

                            voiceAssistant.speak(confirmationMessage, () => {
                                setTimeout(() => chatWidget.classList.add('hidden'), 1000);
                            });
                            conversationHistory.push({ role: 'assistant', content: confirmationMessage });
                        }
                    } catch (e) {
                        isJsonResponse = false;
                    }
                }
            }

            if (!isJsonResponse) {
                conversationHistory.push({ role: 'assistant', content: aiResponseText });
                addMessage('assistant', aiResponseText);
                voiceAssistant.speak(aiResponseText);
            }

        } catch (error) {
            console.error('Error en handleSendMessage:', error);
            const errorMsg = 'Lo siento, hubo un problema de conexión. Por favor, intente de nuevo.';
            addMessage('assistant', errorMsg);
            voiceAssistant.speak(errorMsg);
        } finally {
            chatSendBtn.disabled = false;
            if (chatInput) chatInput.focus();
        }
    }

    async function saveQuotationToSupabase(data) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/save-quotation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    console.error('Error al guardar en Supabase:', errorData.message);
                } catch (e) {
                    console.error('Error al guardar en Supabase (respuesta no JSON):', errorText);
                }
            } else {
                console.log('Cotización persistida en Supabase.');
            }
        } catch (error) {
            console.error('Error de red al conectar con la API de guardado:', error);
        }
    }


    // ==================================================================
    // == 4. LÓGICA DE FORMULARIO Y DOM (COMPLETO) ==
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
        if (submitHelper) {
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
        if (otroMarcaContainer) { otroMarcaContainer.style.display = 'none'; if (otraMarcaInput) otraMarcaInput.required = false; }

        modeloSelect.innerHTML = '<option value="">Selecciona un modelo</option>';
        anioSelect.innerHTML = '<option value="">Primero selecciona un modelo</option>';
        anioSelect.disabled = true;

        document.getElementById('otro-modelo-container').style.display = 'none';
        if (document.getElementById('otro-modelo')) document.getElementById('otro-modelo').required = false;
        document.getElementById('otro-anio-container').style.display = 'none';
        if (document.getElementById('otro-anio')) document.getElementById('otro-anio').required = false;

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
        if (brandWrapper) { brandWrapper.click(); } else { const otroWrapper = Array.from(logoWrappers).find(w => w.querySelector('span')?.textContent.toLowerCase() === 'otra'); if (otroWrapper) { otroWrapper.click(); document.getElementById('otra-marca').value = marca; if (brandDisplayName) brandDisplayName.textContent = marca.toUpperCase(); } }
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

        vinInput.value = data.numero_de_parte;
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

     function openChat() {
         if (!chatWidget) return;
         chatWidget.classList.remove('hidden');
         addChatListeners();
         if (chatInput) chatInput.focus();
     }
    if (assistantButtonHeader) assistantButtonHeader.addEventListener('click', openChat);
    if (assistantButtonForm) assistantButtonForm.addEventListener('click', openChat);
    if (chatCloseBtn) chatCloseBtn.addEventListener('click', () => { if (chatWidget) chatWidget.classList.add('hidden'); });
    if (form) { form.addEventListener('input', checkFormCompleteness); form.addEventListener('change', checkFormCompleteness); }
    if (submitButton) {
        submitButton.addEventListener('click', function () {
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

            // Guardar en Supabase antes de abrir WhatsApp
            saveQuotationToSupabase({
                nombre_cliente: formData.get('nombre'),
                contacto_cliente: formData.get('telefono'),
                marca_vehiculo: formData.get('marca') === 'Otro' ? formData.get('otra-marca') : formData.get('marca'),
                modelo_vehiculo: formData.get('modelo') === 'Otro' ? formData.get('otro-modelo') : formData.get('modelo'),
                año_vehiculo: formData.get('anio') === 'Otro' ? formData.get('otro-anio') : formData.get('anio'),
                repuesto_solicitado: formData.get('descripcion'),
                vin: formData.get('vin'),
                ubicacion: formData.get('ubicacion'),
                source: 'web_form'
            });

            window.open(whatsappURL, '_blank');
        });
    }


    if (modeloSelect) modeloSelect.addEventListener('change', () => { const otroModeloContainer = document.getElementById('otro-modelo-container'); const otroModeloInput = document.getElementById('otro-modelo'); if (modeloSelect.value === "Otro") { if (otroModeloContainer) { otroModeloContainer.style.display = 'block'; if (otroModeloInput) otroModeloInput.required = true; } updateLiveData('modelo', otroModeloInput.value); } else { if (otroModeloContainer) { otroModeloContainer.style.display = 'none'; if (otroModeloInput) otroModeloInput.required = false; } updateLiveData('modelo', modeloSelect.value); } anioSelect.disabled = false; populateAnios(); });
    if (anioSelect) anioSelect.addEventListener('change', () => { const otroAnioContainer = document.getElementById('otro-anio-container'); const otroAnioInput = document.getElementById('otro-anio'); if (anioSelect.value === "Otro") { if (otroAnioContainer) { otroAnioContainer.style.display = 'block'; if (otroAnioInput) otroAnioInput.required = true; } updateLiveData('anio', otroAnioInput.value); } else { if (otroAnioContainer) { otroAnioContainer.style.display = 'none'; if (otroAnioInput) otroAnioInput.required = false; } updateLiveData('anio', anioSelect.value); } });

    const otraMarcaInput = document.getElementById('otra-marca'); if (otraMarcaInput) otraMarcaInput.addEventListener('input', () => { if (brandDisplayName) brandDisplayName.textContent = (otraMarcaInput.value || 'OTRA MARCA').toUpperCase(); });
    const otroModeloInput = document.getElementById('otro-modelo'); if (otroModeloInput) otroModeloInput.addEventListener('input', () => updateLiveData('modelo', otroModeloInput.value));
    const otroAnioInput = document.getElementById('otro-anio'); if (otroAnioInput) otroAnioInput.addEventListener('input', () => updateLiveData('anio', otroAnioInput.value));

    if (descripcionTextarea) descripcionTextarea.addEventListener('input', () => updateLiveData('descripcion', descripcionTextarea.value));
    if (vinInput) vinInput.addEventListener('input', () => updateLiveData('vin', vinInput.value));
    if (nombreInput) nombreInput.addEventListener('input', () => updateLiveData('nombre', nombreInput.value));
    if (telefonoInput) telefonoInput.addEventListener('input', () => updateLiveData('telefono', telefonoInput.value));

    function populateVerticalCarousel() {
        const track = document.querySelector('#vertical-carousel .carousel-track');
        if (!track) return;
        const publiLogos = ['publi.png', 'publi2.png', 'publi3.png', 'publi4.png', 'publi5.png', 'publi6.png'];
        const brandLogos = marcasOrdenadas.map(marca => `images/logos/${marca.toLowerCase().replace(/[\s-.'&]/g, '')}.png`);
        const publiImagePaths = publiLogos.map(file => `images/publi/${file}`);
        let allLogos = [...publiImagePaths, ...brandLogos];
        for (let i = allLogos.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[allLogos[i], allLogos[j]] = [allLogos[j], allLogos[i]]; }
        const fragment = document.createDocumentFragment();
        allLogos.forEach(src => { const img = new Image(); img.src = src; img.loading = 'lazy'; fragment.appendChild(img); });
        track.appendChild(fragment.cloneNode(true));
        track.appendChild(fragment.cloneNode(true));
    }

    // ==================================================================
    // == 5. LÓGICA DE SEGUIMIENTO DE PEDIDOS ==
    // ==================================================================
    const btnSearchOrder = document.getElementById('btn-search-order');
    const trackingPhoneInput = document.getElementById('tracking-phone');
    const trackingResults = document.getElementById('tracking-results');

    async function handleSearchOrder() {
        const phone = trackingPhoneInput.value.trim();
        if (!phone) return;

        btnSearchOrder.disabled = true;
        trackingResults.style.display = 'block';
        trackingResults.innerHTML = `
            <div class="order-card">
                <div class="order-info">
                    <div class="skeleton" style="width: 80%; height: 1.2rem; margin-bottom: 0.5rem;"></div>
                    <div class="skeleton" style="width: 50%; height: 0.8rem;"></div>
                </div>
            </div>`;

        try {
            const response = await fetch(`${API_BASE_URL}/api/get-order-status?phone=${encodeURIComponent(phone)}`);
            if (!response.ok) {
                const errorData = await response.json();
                trackingResults.innerHTML = `<p style="color: var(--color-accent-red); font-weight: 600; padding: 1rem;">${errorData.message}</p>`;
                return;
            }

            const orders = await response.json();
            if (orders.length === 0) {
                trackingResults.innerHTML = `<p style="padding: 1rem;">No se encontraron pedidos recientes para este número.</p>`;
                return;
            }

            trackingResults.innerHTML = '';
            orders.forEach(order => {
                const date = new Date(order.updated_at).toLocaleDateString('es-EC');
                const statusClass = `status-${order.status.toLowerCase().replace(/\s+/g, '-')}`;
                const card = document.createElement('div');
                card.className = 'order-card fade-in is-visible';
                card.innerHTML = `
                    <div class="order-info">
                        <h4>${order.part_name}</h4>
                        <p>Última actualización: ${date}</p>
                    </div>
                    <span class="status-badge ${statusClass}">${order.status}</span>
                `;
                trackingResults.appendChild(card);
            });

        } catch (error) {
            console.error('Error en búsqueda de pedido:', error);
            trackingResults.innerHTML = `<p style="color: var(--color-accent-red); padding: 1rem;">Error al conectar con el servidor.</p>`;
        } finally {
            btnSearchOrder.disabled = false;
        }
    }

    if (btnSearchOrder) btnSearchOrder.addEventListener('click', handleSearchOrder);
    if (trackingPhoneInput) {
        trackingPhoneInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearchOrder();
        });
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
    if (logosContainer) logoObserver.observe(logosContainer);

    if (bgVideo) {
        const videos = ['images/videos/1.mp4', 'images/videos/2.mp4', 'images/videos/3.mp4', 'images/videos/4.mp4'];
        let currentVideoIndex = 0;
        bgVideo.playbackRate = 0.7;
        const playNextVideo = () => {
            currentVideoIndex = (currentVideoIndex + 1) % videos.length;
            const source = bgVideo.querySelector('source');
            if (source) {
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