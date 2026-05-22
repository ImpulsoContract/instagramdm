const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rutas de archivos de datos
const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOGS_FILE = path.join(__dirname, 'logs.json');

// Caché de comentarios procesados recientemente (para evitar duplicados por reintentos de Meta)
const processedComments = new Set();

// Configuración por defecto
const DEFAULT_CONFIG = {
  pageId: '',
  accessToken: '',
  verifyToken: 'instagram_auto_dm_verify_token_123',
  triggerKeyword: '',
  replyMessage: '¡Hola @{username}! Gracias por tu comentario. Te escribimos por privado para darte toda la información.'
};

// Función para leer configuración (fusionando variables de entorno y config.json)
function readConfig() {
  let fileConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      fileConfig = JSON.parse(data);
    }
  } catch (error) {
    console.error('Error leyendo config.json:', error);
  }

  // Priorizar variables de entorno sobre el archivo local (ideal para Render.com)
  return {
    pageId: process.env.PAGE_ID || fileConfig.pageId || DEFAULT_CONFIG.pageId,
    accessToken: process.env.ACCESS_TOKEN || fileConfig.accessToken || DEFAULT_CONFIG.accessToken,
    verifyToken: process.env.VERIFY_TOKEN || fileConfig.verifyToken || DEFAULT_CONFIG.verifyToken,
    triggerKeyword: process.env.TRIGGER_KEYWORD !== undefined ? process.env.TRIGGER_KEYWORD : (fileConfig.triggerKeyword !== undefined ? fileConfig.triggerKeyword : DEFAULT_CONFIG.triggerKeyword),
    replyMessage: process.env.REPLY_MESSAGE || fileConfig.replyMessage || DEFAULT_CONFIG.replyMessage
  };
}

// Función para escribir configuración
function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error escribiendo config.json:', error);
    return false;
  }
}

// Función para leer logs
function readLogs() {
  try {
    if (fs.existsSync(LOGS_FILE)) {
      const data = fs.readFileSync(LOGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error leyendo logs.json:', error);
  }
  return [];
}

// Función para añadir un log
function addLog(username, commentId, commentText, status, details) {
  try {
    const logs = readLogs();
    const newLog = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date().toISOString(),
      username,
      commentId,
      commentText,
      status,
      details
    };
    logs.unshift(newLog); // Añadir al principio
    // Limitar a los últimos 200 logs
    if (logs.length > 200) {
      logs.pop();
    }
    fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf8');
    return newLog;
  } catch (error) {
    console.error('Error guardando log:', error);
  }
}

// Cargar configuración inicial
let currentConfig = readConfig();
// Asegurar que exista el archivo config.json al inicio
if (!fs.existsSync(CONFIG_FILE)) {
  writeConfig(currentConfig);
}
// Asegurar que exista el archivo logs.json al inicio
if (!fs.existsSync(LOGS_FILE)) {
  fs.writeFileSync(LOGS_FILE, '[]', 'utf8');
}

// Función para validar las variables de entorno en el arranque del servidor
function validateEnvVariables() {
  const warnings = [];
  const errors = [];

  console.log('\n=========================================================');
  console.log(' Diagnosticando Variables de Entorno...');
  console.log('=========================================================');

  // 1. Validar PAGE_ID
  const pageId = process.env.PAGE_ID || currentConfig.pageId;
  if (!pageId) {
    errors.push('Falta PAGE_ID: El identificador de la Página de Facebook no está configurado.');
  } else if (!/^\d+$/.test(pageId)) {
    errors.push(`PAGE_ID incorrecto ("${pageId}"): El ID de la Página de Facebook debe ser únicamente números.`);
  }

  // 2. Validar ACCESS_TOKEN
  const token = process.env.ACCESS_TOKEN || currentConfig.accessToken;
  if (!token) {
    errors.push('Falta ACCESS_TOKEN: El Token de Acceso de Página (Meta) no está configurado.');
  } else if (token.length < 30) {
    errors.push('ACCESS_TOKEN sospechosamente corto: Asegúrate de usar un token de larga duración de Meta developers.');
  }

  // 3. Validar VERIFY_TOKEN
  const verifyToken = process.env.VERIFY_TOKEN || currentConfig.verifyToken;
  if (!verifyToken) {
    errors.push('Falta VERIFY_TOKEN: El token de verificación de webhook no está configurado.');
  } else if (verifyToken === 'instagram_auto_dm_verify_token_123') {
    warnings.push('Seguridad: Estás usando el VERIFY_TOKEN por defecto. Cámbialo en tus variables de entorno.');
  }

  // 4. Validar ADMIN_PASSWORD
  if (!ADMIN_PASSWORD) {
    warnings.push('Seguridad: La variable ADMIN_PASSWORD no está configurada. El panel de administración es público y cualquiera puede acceder.');
  } else if (ADMIN_PASSWORD.length < 6) {
    warnings.push('Seguridad: La contraseña de administrador (ADMIN_PASSWORD) es demasiado corta (mínimo 6 caracteres).');
  }

  // Imprimir en consola con formato limpio
  if (errors.length > 0) {
    console.error('❌ CONFIGURACIÓN - ERRORES DETECTADOS:');
    errors.forEach(err => console.error(`   • ${err}`));
  }
  if (warnings.length > 0) {
    console.warn('⚠️ CONFIGURACIÓN - ADVERTENCIAS:');
    warnings.forEach(warn => console.warn(`   • ${warn}`));
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Configuración inicial válida: Variables de entorno correctas.');
  }
  console.log('=========================================================\n');

  // Registrar en el archivo de logs del sistema
  errors.forEach(err => {
    addLog('sistema', 'val_env_err', 'Configuración de Entorno', 'error', err);
  });
  warnings.forEach(warn => {
    addLog('sistema', 'val_env_warn', 'Seguridad de Entorno', 'ignored', warn);
  });
}

// Contraseña de Administrador (leída desde variables de entorno)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Ejecutar validación al arrancar
validateEnvVariables();


// Middleware para verificar la contraseña de administrador
const checkAuth = (req, res, next) => {
  if (!ADMIN_PASSWORD) {
    return next(); // Si no está configurada, permitir paso (entorno de desarrollo local)
  }
  
  const token = req.headers['authorization'];
  if (token === ADMIN_PASSWORD) {
    return next();
  }
  
  res.status(401).json({ success: false, message: 'No autorizado. Contraseña incorrecta.' });
};

// ==========================================
// 1. ENDPOINTS DE LA API DEL DASHBOARD
// ==========================================

// Comprobar estado de autenticación
app.get('/api/auth-status', (req, res) => {
  const token = req.headers['authorization'];
  res.json({
    required: !!ADMIN_PASSWORD,
    valid: ADMIN_PASSWORD ? token === ADMIN_PASSWORD : true
  });
});

// Obtener configuración actual
app.get('/api/config', checkAuth, (req, res) => {
  res.json({
    pageId: currentConfig.pageId,
    verifyToken: currentConfig.verifyToken,
    triggerKeyword: currentConfig.triggerKeyword,
    replyMessage: currentConfig.replyMessage,
    hasToken: !!currentConfig.accessToken // Por seguridad no devolvemos el token completo al frontend
  });
});

// Probar conexión con Meta y validar variables
app.get('/api/test-connection', checkAuth, async (req, res) => {
  const diagnostics = {
    pageId: { status: 'pending', message: 'No comprobado' },
    accessToken: { status: 'pending', message: 'No comprobado' },
    instagram: { status: 'pending', message: 'No comprobado' },
    verifyToken: { status: 'pending', message: 'No comprobado' },
    security: { status: 'pending', message: 'No comprobado' }
  };

  // 1. Validar Verify Token
  const verifyToken = currentConfig.verifyToken;
  if (!verifyToken) {
    diagnostics.verifyToken = {
      status: 'error',
      message: 'El Verify Token está vacío. Debes configurarlo para verificar el Webhook.'
    };
  } else if (verifyToken === 'instagram_auto_dm_verify_token_123') {
    diagnostics.verifyToken = {
      status: 'warning',
      message: 'Estás usando el Verify Token por defecto. Cámbialo en tus variables de entorno.',
      value: verifyToken
    };
  } else {
    diagnostics.verifyToken = {
      status: 'success',
      message: `Verify Token personalizado configurado correctamente.`,
      value: verifyToken
    };
  }

  // 2. Validar Contraseña de Admin
  if (!ADMIN_PASSWORD) {
    diagnostics.security = {
      status: 'warning',
      message: 'Dashboard público sin contraseña de acceso. Configura ADMIN_PASSWORD.'
    };
  } else if (ADMIN_PASSWORD.length < 6) {
    diagnostics.security = {
      status: 'warning',
      message: 'La contraseña de administrador es demasiado corta (mínimo 6 caracteres).'
    };
  } else {
    diagnostics.security = {
      status: 'success',
      message: 'Dashboard seguro protegido por contraseña de administrador.'
    };
  }

  // 3. Validar Page ID y Token format
  const pageId = currentConfig.pageId;
  const token = currentConfig.accessToken;

  if (!pageId) {
    diagnostics.pageId = { status: 'error', message: 'El ID de la Página de Facebook está vacío.' };
  } else if (!/^\d+$/.test(pageId)) {
    diagnostics.pageId = { status: 'error', message: 'El ID de la Página de Facebook debe ser numérico.' };
  } else {
    diagnostics.pageId = { status: 'success', message: `ID de Página configurado: ${pageId}`, value: pageId };
  }

  if (!token) {
    diagnostics.accessToken = { status: 'error', message: 'El Access Token está vacío.' };
  } else if (token.length < 30) {
    diagnostics.accessToken = { status: 'error', message: 'El Access Token es demasiado corto o inválido.' };
  } else {
    diagnostics.accessToken = { status: 'success', message: 'Token configurado con formato correcto.' };
  }

  // Si hay errores de formato previos, no llamamos a Meta API
  if (diagnostics.pageId.status === 'error' || diagnostics.accessToken.status === 'error') {
    diagnostics.instagram = { status: 'error', message: 'No se puede comprobar la cuenta de Instagram sin un ID y Token correctos.' };
    
    const reason = 'Diagnóstico fallido por errores en las variables de configuración básicas.';
    addLog('sistema', 'test_conn_fail', 'Verificación', 'error', reason);
    return res.json({
      success: true,
      valid: false,
      diagnostics,
      reason
    });
  }

  // 4. Consultar Meta API para comprobar credenciales reales
  try {
    const url = `https://graph.facebook.com/v20.0/${pageId}`;
    const response = await axios.get(url, {
      params: {
        fields: 'name,instagram_business_account{username,name}',
        access_token: token
      },
      timeout: 10000 // 10 segundos timeout
    });

    const pageName = response.data.name;
    const igAccount = response.data.instagram_business_account;

    // Actualizar estados tras llamada exitosa
    diagnostics.pageId = {
      status: 'success',
      message: `Página de Facebook encontrada: "${pageName}" (ID: ${pageId})`,
      value: pageId
    };

    diagnostics.accessToken = {
      status: 'success',
      message: 'Access Token verificado y con permisos válidos.'
    };

    if (!igAccount) {
      diagnostics.instagram = {
        status: 'error',
        message: 'No hay ninguna cuenta de Instagram Profesional conectada a esta Página. Vincula tu cuenta de IG Business en los ajustes de tu Página.'
      };
      
      const reason = `Página de Facebook "${pageName}" conectada, pero sin cuenta de Instagram vinculada.`;
      addLog('sistema', 'test_conn', 'Verificación', 'error', reason);
      
      return res.json({
        success: true,
        valid: false,
        diagnostics,
        pageName,
        reason
      });
    }

    // Instagram vinculado
    diagnostics.instagram = {
      status: 'success',
      message: `Cuenta conectada: @${igAccount.username} (${igAccount.name || 'Instagram Business'})`,
      username: igAccount.username,
      name: igAccount.name
    };

    const details = `Conexión verificada con éxito. Página FB: "${pageName}" | Instagram: @${igAccount.username}`;
    addLog('sistema', 'test_conn', 'Verificación', 'success', details);

    res.json({
      success: true,
      valid: true,
      diagnostics,
      pageName,
      instagramUsername: igAccount.username,
      instagramName: igAccount.name,
      details
    });

  } catch (error) {
    let apiErrorMsg = error.message;
    let errorCode = null;

    if (error.response && error.response.data && error.response.data.error) {
      apiErrorMsg = error.response.data.error.message;
      errorCode = error.response.data.error.code;
    }

    // Traducir códigos de error comunes de Meta
    let suggestion = apiErrorMsg;
    if (errorCode === 190) {
      diagnostics.accessToken = {
        status: 'error',
        message: 'El Access Token es inválido, ha expirado o ha sido revocado. Renuévalo en Meta for Developers.'
      };
      suggestion = 'Access Token de Meta inválido o expirado (Error 190).';
    } else if (errorCode === 100 || errorCode === 803) {
      diagnostics.pageId = {
        status: 'error',
        message: 'El ID de la Página de Facebook es incorrecto o la cuenta no tiene permisos para acceder a ella.'
      };
      suggestion = 'ID de Página de Facebook incorrecto o inaccesible (Error 100/803).';
    } else {
      diagnostics.accessToken = {
        status: 'error',
        message: `Error de API de Meta (${errorCode || 'desconocido'}): ${apiErrorMsg}`
      };
    }

    diagnostics.instagram = {
      status: 'error',
      message: 'Comprobación de Instagram omitida por error en la conexión de la API.'
    };

    const reason = `Error de diagnóstico de conexión: ${suggestion}`;
    addLog('sistema', 'test_conn_fail', 'Verificación', 'error', reason);

    res.json({
      success: true,
      valid: false,
      diagnostics,
      reason
    });
  }
});

// Guardar configuración
app.post('/api/config', checkAuth, (req, res) => {
  const { pageId, accessToken, verifyToken, triggerKeyword, replyMessage } = req.body;

  // Actualizar sólo los campos suministrados, y mantener el token anterior si no se envía uno nuevo
  const updatedConfig = {
    pageId: pageId !== undefined ? pageId.trim() : currentConfig.pageId,
    accessToken: accessToken ? accessToken.trim() : currentConfig.accessToken,
    verifyToken: verifyToken !== undefined ? verifyToken.trim() : currentConfig.verifyToken,
    triggerKeyword: triggerKeyword !== undefined ? triggerKeyword.trim() : currentConfig.triggerKeyword,
    replyMessage: replyMessage !== undefined ? replyMessage : currentConfig.replyMessage
  };

  if (writeConfig(updatedConfig)) {
    currentConfig = updatedConfig;
    res.json({ success: true, message: 'Configuración guardada correctamente.' });
  } else {
    res.status(500).json({ success: false, message: 'Error al guardar la configuración en el servidor.' });
  }
});

// Obtener logs de actividad
app.get('/api/logs', checkAuth, (req, res) => {
  res.json(readLogs());
});

// Endpoint simulador: Permite probar el webhook desde el Dashboard sin configurar Meta
app.post('/api/simulate-comment', checkAuth, async (req, res) => {
  const { username, commentText, commentId } = req.body;
  const mockPayload = {
    object: 'instagram',
    entry: [
      {
        id: currentConfig.pageId || 'mock_page_id',
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: 'comments',
            value: {
              id: commentId || `mock_comment_${Date.now()}`,
              text: commentText || 'Comentario de prueba',
              from: {
                id: `mock_user_${Date.now()}`,
                username: username || 'test_user'
              }
            }
          }
        ]
      }
    ]
  };

  console.log('Simulando comentario entrante...');
  
  // Realizar llamada interna al propio endpoint de webhook de forma local
  try {
    const result = await processWebhookPayload(mockPayload, true);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. WEBHOOK DE META (INSTAGRAM GRAPH API)
// ==========================================

// Handshake de verificación (GET /webhook)
// Meta realiza una petición GET para validar que el servidor es el propietario del webhook.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === currentConfig.verifyToken) {
      console.log('WEBHOOK_VERIFIED: Handshake con Meta realizado con éxito.');
      return res.status(200).send(challenge);
    } else {
      console.warn('WEBHOOK_VERIFICATION_FAILED: Token de verificación incorrecto.');
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// Receptor de notificaciones (POST /webhook)
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Confirmar que el objeto proviene de instagram
  if (body.object === 'instagram') {
    try {
      await processWebhookPayload(body, false);
      res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
      console.error('Error procesando webhook:', error);
      res.status(500).send('INTERNAL_SERVER_ERROR');
    }
  } else {
    // Si no es un evento de Instagram, respondemos con 404
    res.sendStatus(404);
  }
});

// Función central para procesar el payload del webhook
async function processWebhookPayload(payload, isMock = false) {
  const results = [];
  
  for (const entry of payload.entry) {
    if (!entry.changes) continue;
    
    for (const change of entry.changes) {
      if (change.field === 'comments') {
        const commentData = change.value;
        const commentId = commentData.id;
        const commentText = commentData.text;
        const username = commentData.from.username;

        console.log(`[Comentario recibido] Usuario: @${username} | Texto: "${commentText}" | ID: ${commentId}`);

        // 1. Evitar procesamiento duplicado si ya lo manejamos
        if (processedComments.has(commentId)) {
          console.log(`Comentario ${commentId} ya procesado, ignorando.`);
          continue;
        }
        processedComments.add(commentId);
        // Mantener el caché en tamaño máximo de 500 para no agotar memoria
        if (processedComments.size > 500) {
          const firstItem = processedComments.values().next().value;
          processedComments.delete(firstItem);
        }

        // 2. Verificar si coincide con la palabra clave (si está configurada)
        const keyword = currentConfig.triggerKeyword ? currentConfig.triggerKeyword.trim().toLowerCase() : '';
        if (keyword) {
          const cleanCommentText = commentText.toLowerCase();
          if (!cleanCommentText.includes(keyword)) {
            console.log(`El comentario no contiene la palabra clave "${keyword}". Ignorando.`);
            const log = addLog(username, commentId, commentText, 'ignored', `Comentario no contiene palabra clave: "${keyword}"`);
            results.push({ commentId, status: 'ignored', log });
            continue;
          }
        }

        // 3. Validar credenciales de envío
        if (!currentConfig.pageId || !currentConfig.accessToken) {
          const errMsg = 'Error: Credenciales incompletas (Page ID o Access Token no configurados).';
          console.error(errMsg);
          const log = addLog(username, commentId, commentText, 'error', errMsg);
          results.push({ commentId, status: 'error', log });
          continue;
        }

        // 4. Construir y enviar el mensaje privado
        const messageText = currentConfig.replyMessage.replace(/{username}/g, username);

        // Si es una simulación y no tenemos credenciales válidas o queremos saltarnos la llamada real a Meta:
        if (isMock && (currentConfig.accessToken.startsWith('mock') || !currentConfig.accessToken)) {
          console.log(`[SIMULACIÓN] Enviando DM a @${username}: "${messageText}"`);
          const log = addLog(username, commentId, commentText, 'success', `[SIMULACIÓN] Mensaje privado enviado con éxito`);
          results.push({ commentId, status: 'success', log });
          continue;
        }

        try {
          const url = `https://graph.facebook.com/v20.0/${currentConfig.pageId}/messages`;
          const response = await axios.post(url, {
            recipient: {
              comment_id: commentId
            },
            message: {
              text: messageText
            }
          }, {
            params: {
              access_token: currentConfig.accessToken
            },
            headers: {
              'Content-Type': 'application/json'
            }
          });

          console.log(`[DM Enviado] Respuesta de Meta API:`, response.data);
          const log = addLog(username, commentId, commentText, 'success', `Mensaje privado enviado con éxito. ID: ${response.data.message_id || 'N/A'}`);
          results.push({ commentId, status: 'success', log });
        } catch (error) {
          const apiErrorMsg = error.response && error.response.data && error.response.data.error 
            ? error.response.data.error.message 
            : error.message;
          console.error(`[Error Meta API] No se pudo enviar el DM a @${username}:`, apiErrorMsg);
          const log = addLog(username, commentId, commentText, 'error', `Error de API de Meta: ${apiErrorMsg}`);
          results.push({ commentId, status: 'error', log });
        }
      }
    }
  }

  return results;
}

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(` Servidor de Instagram Auto-DM escuchando en puerto ${PORT}`);
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Endpoint de Webhook para Meta: http://localhost:${PORT}/webhook`);
  console.log(`===========================================================`);
});
