/**
 * AGN ERP - Core Engine (v1.0)
 * Responsabilidades: Auth, Navegación, API Client, Session.
 */

const API = ''; // Usar rutas relativas siempre para mayor compatibilidad

let adminPass = localStorage.getItem('agn_admin_pass') || '';
let adminName = localStorage.getItem('agn_admin_name') || 'Admin';

// Configuración Global
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupNavigation();
    updateUI();
});

function checkSession() {
    // Detectar si estamos en la página principal que tiene el formulario de login
    const isLoginPage = window.location.pathname.endsWith('admin.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');

    if (!adminPass) {
        if (!isLoginPage) {
            // Si no hay pass y no es la login page, redirigir forzosamente
            window.location.href = 'admin.html';
            return;
        }
        // Si es la login page, asegurar que el form sea visible
        const loginScreen = document.getElementById('login-screen');
        const app = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'flex';
        if (app) app.style.display = 'none';
    } else {
        // Hay sesión activo
        showApp();
    }
}

function showApp() {
    const loginScreen = document.getElementById('login-screen');
    const app = document.getElementById('app');

    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'flex';

    const navUser = document.getElementById('nav-user');
    if (navUser) navUser.textContent = adminName;
}

function setupNavigation() {
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem('agn_admin_pass');
            localStorage.removeItem('agn_admin_name');
            window.location.href = 'admin.html'; // Volver al inicio
        };
    }
}

function updateUI() {
    // Sync active tab based on filename
    const path = window.location.pathname;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (path.includes(btn.dataset.page)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// API Utilities
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = '0.5s';
        setTimeout(() => t.remove(), 500);
    }, 3000);
}

window.AGN_CORE = { API, adminPass, adminName, fetchWithTimeout, showToast, showApp };
