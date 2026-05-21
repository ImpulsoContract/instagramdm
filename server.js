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

// Contraseña de Administrador (leída desde variables de entorno)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

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
