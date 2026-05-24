// InstaReply - Dashboard Logic

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const configForm = document.getElementById('config-form');
  const pageIdInput = document.getElementById('pageId');
  const accessTokenInput = document.getElementById('accessToken');
  const toggleTokenBtn = document.getElementById('toggle-token');
  const tokenStatusLabel = document.getElementById('token-status-label');
  const verifyTokenInput = document.getElementById('verifyToken');
  const triggerKeywordInput = document.getElementById('triggerKeyword');
  const replyMessageTextarea = document.getElementById('replyMessage');
  const insertUsernameBtn = document.getElementById('insert-username');
  const btnSave = document.getElementById('btn-save');
  
  const webhookUrlText = document.getElementById('webhook-url-text');
  const copyWebhookUrlBtn = document.getElementById('copy-webhook-url');
  const copyVerifyTokenBtn = document.getElementById('copy-verify-token');
  
  const simulatorForm = document.getElementById('simulator-form');
  const simUsernameInput = document.getElementById('sim-username');
  const simCommentInput = document.getElementById('sim-comment');
  const btnSimulate = document.getElementById('btn-simulate');
  
  const logsList = document.getElementById('logs-list');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const toast = document.getElementById('toast');

  const authOverlay = document.getElementById('auth-overlay');
  const authForm = document.getElementById('auth-form');
  const adminPasswordInput = document.getElementById('admin-password');
  const btnAuth = document.getElementById('btn-auth');

  const btnTestConnection = document.getElementById('btn-test-connection');
  const diagPageId = document.getElementById('diag-pageId');
  const diagToken = document.getElementById('diag-token');
  const diagInstagram = document.getElementById('diag-instagram');
  const diagVerify = document.getElementById('diag-verify');
  const diagSecurity = document.getElementById('diag-security');

  let currentLogs = [];

  let activeFilter = 'all';

  // Wrapper de fetch para inyectar la cabecera de autenticación
  async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    options.headers['Authorization'] = localStorage.getItem('adminPassword') || '';
    
    try {
      const response = await fetch(url, options);
      if (response.status === 401) {
        showAuthModal();
        throw new Error('Unauthorized');
      }
      return response;
    } catch (err) {
      if (err.message === 'Unauthorized') {
        throw err;
      }
      console.error(`Error en fetch a ${url}:`, err);
      throw err;
    }
  }

  function showAuthModal() {
    authOverlay.classList.add('show');
  }

  function hideAuthModal() {
    authOverlay.classList.remove('show');
  }

  // ==========================================
  // 1. DYNAMIC CONFIGURATION & DATA CHARGING
  // ==========================================

  // Set the correct webhook URL based on the browser address
  const currentOrigin = window.location.origin;
  webhookUrlText.textContent = `${currentOrigin}/webhook`;

  // Load config from backend
  async function loadConfig() {
    try {
      const response = await authFetch('/api/config');
      const data = await response.json();
      
      pageIdInput.value = data.pageId || '';
      verifyTokenInput.value = data.verifyToken || '';
      triggerKeywordInput.value = data.triggerKeyword || '';
      replyMessageTextarea.value = data.replyMessage || '';
      
      // Handle page access token display status
      if (data.hasToken) {
        accessTokenInput.placeholder = '•••••••••••••••••••••••••••••••• (Token guardado)';
        tokenStatusLabel.innerHTML = '<i class="fas fa-check-circle text-green"></i> Token guardado en servidor';
      } else {
        accessTokenInput.placeholder = 'Ingresa tu token de acceso (se ocultará al guardar)';
        tokenStatusLabel.innerHTML = '<i class="fas fa-exclamation-circle text-orange"></i> Token no configurado';
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      showToast('Error al conectar con la API', 'error');
    }
  }

  // Save config
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Set loading state
    btnSave.classList.add('loading');
    btnSave.disabled = true;
    
    const pageId = pageIdInput.value;
    const accessToken = accessTokenInput.value;
    const verifyToken = verifyTokenInput.value;
    const triggerKeyword = triggerKeywordInput.value;
    const replyMessage = replyMessageTextarea.value;
    
    try {
      const response = await authFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageId,
          accessToken: accessToken ? accessToken : undefined, // Enviar sólo si el usuario escribió uno nuevo
          verifyToken,
          triggerKeyword,
          replyMessage
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast('Configuración guardada correctamente', 'success');
        accessTokenInput.value = ''; // Limpiar campo después de guardar
        await loadConfig(); // Recargar datos
      } else {
        showToast(result.message || 'Error al guardar', 'error');
      }
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      showToast('Error de conexión con el servidor', 'error');
    } finally {
      btnSave.classList.remove('loading');
      btnSave.disabled = false;
    }
  });

  // Password hide/show toggle
  toggleTokenBtn.addEventListener('click', () => {
    const type = accessTokenInput.getAttribute('type') === 'password' ? 'text' : 'password';
    accessTokenInput.setAttribute('type', type);
    
    const icon = toggleTokenBtn.querySelector('i');
    if (type === 'password') {
      icon.className = 'fas fa-eye';
    } else {
      icon.className = 'fas fa-eye-slash';
    }
  });

  // Textarea username badge inserter
  insertUsernameBtn.addEventListener('click', () => {
    const startPos = replyMessageTextarea.selectionStart;
    const endPos = replyMessageTextarea.selectionEnd;
    const text = replyMessageTextarea.value;
    
    replyMessageTextarea.value = text.substring(0, startPos) + '{username}' + text.substring(endPos, text.length);
    replyMessageTextarea.focus();
    replyMessageTextarea.selectionStart = startPos + 10;
    replyMessageTextarea.selectionEnd = startPos + 10;
  });

  // ==========================================
  // 2. COPY UTILITIES
  // ==========================================
  
  function setupCopyButton(btn, textSource) {
    btn.addEventListener('click', () => {
      const textToCopy = typeof textSource === 'function' ? textSource() : textSource.value || textSource.textContent;
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('¡Copiado al portapapeles!', 'success');
        
        // Visual indicator change
        const icon = btn.querySelector('i');
        icon.className = 'fas fa-check';
        setTimeout(() => {
          icon.className = 'fas fa-copy';
        }, 1500);
      }).catch(err => {
        console.error('No se pudo copiar:', err);
        showToast('Error al copiar al portapapeles', 'error');
      });
    });
  }

  setupCopyButton(copyWebhookUrlBtn, webhookUrlText);
  setupCopyButton(copyVerifyTokenBtn, verifyTokenInput);

  // ==========================================
  // 3. EVENT SIMULATOR
  // ==========================================

  simulatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    btnSimulate.classList.add('loading');
    btnSimulate.disabled = true;
    
    const username = simUsernameInput.value.trim().replace('@', '');
    const commentText = simCommentInput.value;
    
    try {
      const response = await authFetch('/api/simulate-comment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, commentText })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showToast('Simulación de comentario ejecutada', 'success');
        // Limpiar el comentario para la próxima prueba, conservar el usuario
        simCommentInput.value = '';
        await fetchLogs(); // Forzar actualización de logs
      } else {
        showToast(result.error || 'Error en simulación', 'error');
      }
    } catch (error) {
      console.error('Error simulando comentario:', error);
      showToast('Error al conectar con la API de simulación', 'error');
    } finally {
      btnSimulate.classList.remove('loading');
      btnSimulate.disabled = false;
    }
  });

  // ==========================================
  // 3.5 CONNECTION DIAGNOSTICS HANDLER
  // ==========================================
  async function runDiagnostics() {
    btnTestConnection.classList.add('loading');
    btnTestConnection.disabled = true;

    // Reset items to loading
    const items = [
      { el: diagPageId, title: 'ID de Página de Facebook' },
      { el: diagToken, title: 'Access Token de Meta' },
      { el: diagInstagram, title: 'Cuenta de Instagram Vinculada' },
      { el: diagVerify, title: 'Token de Verificación Webhook' },
      { el: diagSecurity, title: 'Contraseña de Administrador' }
    ];

    items.forEach(item => {
      item.el.className = 'diagnostic-item loading';
      item.el.querySelector('.diag-icon').innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
      item.el.querySelector('.diag-msg').textContent = 'Comprobando...';
    });

    try {
      const response = await authFetch('/api/test-connection');
      const data = await response.json();
      
      const diag = data.diagnostics || {};
      
      // Actualizar Page ID
      updateDiagItem(diagPageId, diag.pageId || { status: 'error', message: 'No se obtuvo respuesta del ID de página.' });
      
      // Actualizar Token
      updateDiagItem(diagToken, diag.accessToken || { status: 'error', message: 'No se obtuvo respuesta del token.' });
      
      // Actualizar Instagram
      updateDiagItem(diagInstagram, diag.instagram || { status: 'error', message: 'No se pudo verificar la vinculación de Instagram.' });
      
      // Actualizar Verify Token
      updateDiagItem(diagVerify, diag.verifyToken || { status: 'error', message: 'No se pudo verificar el verify token.' });
      
      // Actualizar Contraseña de Seguridad
      updateDiagItem(diagSecurity, diag.security || { status: 'error', message: 'No se pudo verificar la contraseña.' });
      
      if (data.valid) {
        showToast('Diagnóstico exitoso: Conectado a Instagram', 'success');
      } else {
        showToast(`Diagnóstico incompleto: ${data.reason || 'Revisa los detalles'}`, 'error');
      }
      
      await fetchLogs(); // Actualizar logs para reflejar el reporte del test de conexión
      
    } catch (error) {
      console.error('Error corriendo diagnóstico:', error);
      showToast('Error al conectar con la API de diagnóstico', 'error');
      items.forEach(item => {
        item.el.className = 'diagnostic-item error';
        item.el.querySelector('.diag-icon').innerHTML = '<i class="fas fa-times-circle"></i>';
        item.el.querySelector('.diag-msg').textContent = 'Error al ejecutar comprobación en el servidor.';
      });
    } finally {
      btnTestConnection.classList.remove('loading');
      btnTestConnection.disabled = false;
    }
  }

  function updateDiagItem(element, data) {
    element.className = `diagnostic-item ${data.status}`;
    const iconEl = element.querySelector('.diag-icon');
    const msgEl = element.querySelector('.diag-msg');
    
    msgEl.textContent = data.message;
    
    if (data.status === 'success') {
      iconEl.innerHTML = '<i class="fas fa-check-circle"></i>';
    } else if (data.status === 'warning') {
      iconEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
    } else if (data.status === 'error') {
      iconEl.innerHTML = '<i class="fas fa-times-circle"></i>';
    } else {
      iconEl.innerHTML = '<i class="fas fa-question-circle"></i>';
    }
  }

  btnTestConnection.addEventListener('click', runDiagnostics);

  // ==========================================
  // 4. ACTIVITY LOGS HANDLERS
  // ==========================================

  // Load and render activity logs
  async function fetchLogs() {
    try {
      const response = await authFetch('/api/logs');
      currentLogs = await response.json();
      renderLogs();
    } catch (error) {
      console.error('Error consultando logs:', error);
    }
  }

  // Render logs on DOM
  function renderLogs() {
    // Filter logs
    const filteredLogs = activeFilter === 'all' 
      ? currentLogs 
      : currentLogs.filter(log => log.status === activeFilter);
      
    if (filteredLogs.length === 0) {
      logsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-clipboard-list empty-icon"></i>
          <p>${activeFilter === 'all' ? 'No hay actividad registrada.' : `No hay registros con estado "${activeFilter}"`}</p>
        </div>
      `;
      return;
    }
    
    logsList.innerHTML = filteredLogs.map(log => {
      const timeStr = formatTime(log.timestamp);
      const initial = log.username ? log.username.charAt(0).toUpperCase() : '?';
      
      let statusLabel = 'Enviado';
      let statusIcon = '<i class="fas fa-check-circle text-green"></i>';
      
      if (log.status === 'ignored') {
        statusLabel = 'Ignorado';
        statusIcon = '<i class="fas fa-exclamation-triangle text-orange"></i>';
      } else if (log.status === 'error') {
        statusLabel = 'Error';
        statusIcon = '<i class="fas fa-times-circle text-error"></i>';
      }
      
      return `
        <div class="log-item ${log.status}">
          <div class="log-avatar">${initial}</div>
          <div class="log-content">
            <div class="log-meta">
              <span class="log-username">@${log.username}</span>
              <span class="log-time">${timeStr}</span>
            </div>
            <div class="log-text-msg">"${log.commentText}"</div>
            <div class="log-details" style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.3rem;">
                ${statusIcon}
                <span class="log-status-badge">${statusLabel}</span>
                <span>•</span>
                <span class="log-details-text">${log.details}</span>
              </div>
              ${log.commentId ? `<span class="log-id-badge copy-comment-id" data-id="${log.commentId}" style="font-size: 0.75rem; color: var(--text-muted-dark); background: rgba(255, 255, 255, 0.05); padding: 0.1rem 0.4rem; border-radius: 4px; font-family: monospace; cursor: pointer; user-select: all;" title="Haga clic para copiar ID">ID: ${log.commentId}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Bind event listeners to copy comment IDs
    logsList.querySelectorAll('.copy-comment-id').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const commentId = badge.getAttribute('data-id');
        navigator.clipboard.writeText(commentId).then(() => {
          showToast('ID de comentario copiado al portapapeles', 'success');
        }).catch(err => {
          console.error('Error al copiar ID:', err);
          showToast('No se pudo copiar el ID', 'error');
        });
      });
    });
  }

  // Filter tabs click handler
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.getAttribute('data-filter');
      renderLogs();
    });
  });

  // Time formatter (relative/absolute depending on age)
  function formatTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  // ==========================================
  // 5. TOAST UTILITY
  // ==========================================

  let toastTimeout;
  function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    // Add icon to toast
    const icon = document.createElement('i');
    if (type === 'success') icon.className = 'fas fa-check-circle';
    else if (type === 'error') icon.className = 'fas fa-times-circle';
    toast.prepend(icon);
    
    toast.classList.add('show');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  // Manejador de formulario de autenticación
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnAuth.classList.add('loading');
    btnAuth.disabled = true;
    
    const password = adminPasswordInput.value;
    
    try {
      const response = await fetch('/api/auth-status', {
        headers: { 'Authorization': password }
      });
      const data = await response.json();
      
      if (data.valid) {
        localStorage.setItem('adminPassword', password);
        hideAuthModal();
        showToast('Sesión iniciada con éxito', 'success');
        await loadConfig();
        await fetchLogs();
        // Activar polling
        setInterval(fetchLogs, 2500);
      } else {
        showToast('Contraseña incorrecta', 'error');
        adminPasswordInput.value = '';
        adminPasswordInput.focus();
      }
    } catch (error) {
      console.error('Error durante autenticación:', error);
      showToast('Error de conexión con el servidor', 'error');
    } finally {
      btnAuth.classList.remove('loading');
      btnAuth.disabled = false;
    }
  });

  // Comprobar autenticación al iniciar
  async function checkServerAuth() {
    const savedPassword = localStorage.getItem('adminPassword') || '';
    try {
      const response = await fetch('/api/auth-status', {
        headers: { 'Authorization': savedPassword }
      });
      const data = await response.json();
      
      if (data.required && !data.valid) {
        showAuthModal();
      } else {
        hideAuthModal();
        await loadConfig();
        await fetchLogs();
        setInterval(fetchLogs, 2500);
      }
    } catch (error) {
      console.error('Error comprobando estado de autenticación:', error);
      showToast('Error de conexión con el servidor', 'error');
    }
  }

  // Inicializar Web Dashboard comprobando auth
  checkServerAuth();
});
