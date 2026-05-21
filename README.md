# InstaReply - Instagram Auto-DM Webhook

Este proyecto implementa una solución completa basada en la **API oficial de Meta** para enviar mensajes directos (DM) automáticos cuando un usuario comenta en tus publicaciones de Instagram.

Incluye un panel de administración web (Dashboard) para configurar el comportamiento y simular eventos de prueba.

---

## 🛠️ Ejecución Local

1. Instala las dependencias:
   ```bash
   npm install
   ```
2. Arranca el servidor local:
   ```bash
   npm start
   ```
   El servidor estará disponible en `http://localhost:3000`.

---

## 🚀 Despliegue en Render.com

Para mantener el sistema activo 24/7 de forma gratuita o muy barata en **Render.com**, sigue este procedimiento:

### Paso 1: Subir el código a GitHub (Repositorio Privado)
Por seguridad, asegúrate de crear tu repositorio como **Privado** para no exponer tus claves públicamente en Internet.

Ejecuta los siguientes comandos en la consola dentro de la carpeta del proyecto:
```bash
# Inicializar Git
git init

# Registrar todos los archivos (el archivo .gitignore evitará subir tus claves de prueba locales)
git add .

# Guardar cambios locales
git commit -m "first commit: instagram auto dm setup"

# Crear la rama principal y enlazar tu repositorio
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

# Subir el código
git push -u origin main
```

### Paso 2: Crear el Web Service en Render
1. Inicia sesión en [Render.com](https://render.com/).
2. Haz clic en **New +** y selecciona **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio privado de tu proyecto.
4. Completa la configuración del servicio:
   * **Name**: `instagram-auto-dm`
   * **Language**: `Node`
   * **Region**: *(Elige la más cercana a ti)*
   * **Branch**: `main`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Instance Type**: `Free` (o el plan que desees)

### Paso 3: Configurar las Variables de Entorno (Seguridad)
En la misma pantalla de creación (o en la pestaña **Environment** de tu servicio una vez creado), haz clic en **Add Environment Variable** e introduce las credenciales para que Render las inyecte de forma segura:

| Key | Value | Descripción |
| :--- | :--- | :--- |
| `PAGE_ID` | `tu_id_de_pagina` | ID de la Página de Facebook vinculada a Instagram |
| `ACCESS_TOKEN` | `tu_token_de_acceso` | Token de acceso de Meta Developer |
| `VERIFY_TOKEN` | `tu_verify_token_secreto` | Clave secreta que inventes para el webhook |
| `TRIGGER_KEYWORD` | `INFO` | *(Opcional)* Palabra clave para disparar el DM |
| `REPLY_MESSAGE` | `Hola {username}...` | *(Opcional)* Mensaje a enviar por DM |

### Paso 4: Configurar en Meta
Una vez completado el despliegue, Render te proporcionará una URL pública y segura (ej: `https://instagram-auto-dm-xxxx.onrender.com`).

Introduce esa URL en el portal de desarrolladores de Meta añadiendo `/webhook` al final:
* **URL de llamada**: `https://instagram-auto-dm-xxxx.onrender.com/webhook`
* **Token de verificación**: El mismo valor que configuraste en `VERIFY_TOKEN`.
