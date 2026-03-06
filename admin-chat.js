/**
 * AGN ERP - Aria AI Module (v1.0)
 * Responsabilidades: Chat lateral, acciones automáticas, TTS, STT.
 */

let ariaHistory = [];
let isAriaMuted = localStorage.getItem('aria_muted') === 'true';

document.addEventListener('DOMContentLoaded', () => {
    setupAriaUI();
    if (isAriaMuted) {
        const muteBtn = document.getElementById('aria-mute');
        if (muteBtn) muteBtn.classList.add('active');
    }
});

function setupAriaUI() {
    const ariaInput = document.getElementById('aria-input');
    const ariaSend = document.getElementById('aria-send');
    const ariaMic = document.getElementById('aria-mic');
    const ariaMute = document.getElementById('aria-mute');

    if (ariaInput) {
        ariaInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendToAria();
            }
        });
    }

    if (ariaSend) ariaSend.onclick = sendToAria;

    if (ariaMic && 'webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'es-EC';
        recognition.onstart = () => ariaMic.classList.add('active');
        recognition.onend = () => ariaMic.classList.remove('active');
        recognition.onresult = (e) => {
            ariaInput.value = e.results[0][0].transcript;
            sendToAria();
        };
        ariaMic.onclick = () => recognition.start();
    }

    if (ariaMute) {
        ariaMute.onclick = () => {
            isAriaMuted = !isAriaMuted;
            localStorage.setItem('aria_muted', isAriaMuted);
            ariaMute.classList.toggle('active', isAriaMuted);
            if (isAriaMuted) window.speechSynthesis.cancel();
            window.AGN_CORE.showToast(isAriaMuted ? '🔇 Aria silenciada' : '🔊 Aria con voz', 'info');
        };
    }
}

async function sendToAria() {
    const input = document.getElementById('aria-input');
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    const ariaSend = document.getElementById('aria-send');
    ariaSend.disabled = true;

    addAiMsg('user', msg);
    ariaHistory.push({ role: 'user', content: msg });

    const thinking = addAiMsg('assistant', '...');

    // Contexto de orden seleccionada
    let contextMsg = msg;
    if (window.selectedOrder) {
        contextMsg = `(ESTOY VIENDO LA ORDEN ID: ${window.selectedOrder.readable_id}) - ${msg}`;
    }

    try {
        const res = await window.AGN_CORE.fetchWithTimeout(`/api/admin-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': window.AGN_CORE.adminPass
            },
            body: JSON.stringify({
                message: contextMsg,
                conversationHistory: ariaHistory,
                adminName: window.AGN_CORE.adminName
            }),
            timeout: 20000
        });

        if (!res.ok) {
            const errorData = await res.json();
            thinking.remove();
            addAiMsg('assistant', `⚠️ Error: ${errorData.error || 'Fallo de conexión'}`);
            return;
        }

        const data = await res.json();
        thinking.remove();

        if (data.response) {
            const cleanText = sanitizeResponse(data.response);
            addAiMsg('assistant', cleanText);
            ariaHistory.push({ role: 'assistant', content: cleanText });
            ariaSpeak(cleanText);
        }

        if (data.action) {
            await executeAriaAction(data.action);
        }
    } catch (e) {
        console.error('Aria Error:', e);
        if (thinking) thinking.remove();
        window.AGN_CORE.showToast('Error de conexión con Aria', 'error');
    } finally {
        ariaSend.disabled = false;
    }
}

function addAiMsg(role, content) {
    const container = document.getElementById('ai-messages');
    if (!container) return null;
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.textContent = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
}

function sanitizeResponse(text) {
    // Regla 32 de .clippy.md: Limpiar markdown tags agresivamente
    return text.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
}

function ariaSpeak(text) {
    if (isAriaMuted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'es-EC';
    utt.rate = 1.1;
    window.speechSynthesis.speak(utt);
}

async function executeAriaAction(action) {
    if (!action || !action.type) return;
    console.log("Aria executing action:", action);

    // Aquí invocamos las funciones globales del ERP que admin.js registrará
    if (window.AGN_ERP_ACTIONS && window.AGN_ERP_ACTIONS[action.type]) {
        await window.AGN_ERP_ACTIONS[action.type](action.data);
    } else {
        console.warn("Acción no soportada en esta página:", action.type);
    }
}
