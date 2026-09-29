'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const startedAt = Date.now();
const since = () => `+${Date.now() - startedAt}ms`;

const app = express();
const PORT = Number(process.env.PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);

// Solo PUBLIC_DIR se publica. STORAGE_DIR, certs, server.js y el resto de la
// raiz nunca quedan disponibles como ficheros estaticos.
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORAGE_DIR = path.join(__dirname, 'storage');
const CERT_DIR = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');

function ensureDir(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonSafe(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw.trim()) {
            console.warn(`[aviso] ${filePath} esta vacio; se devuelve el valor por defecto.`);
            return fallback;
        }
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`[aviso] No se pudo leer ${filePath}: ${error.message}`);
        return fallback;
    }
}

// Escritura atomica: primero crea un temporal y despues reemplaza el JSON.
// Reduce el riesgo de dejar un fichero truncado si el proceso se interrumpe.
function writeJsonAtomic(filePath, value) {
    ensureDir(filePath);
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(value, null, 2), 'utf8');
    try {
        fs.renameSync(tempFile, filePath);
    } catch (error) {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        throw error;
    }
}

function requireArray(req, res, next) {
    if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'El cuerpo debe ser un array JSON' });
    }
    next();
}

function requireObject(req, res, next) {
    if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'El cuerpo debe ser un objeto JSON' });
    }
    next();
}

function jsonStoreHandlers(filePath, fallback, validator) {
    return {
        get(req, res) {
            res.json(readJsonSafe(filePath, fallback));
        },
        post: [validator, (req, res) => {
            try {
                writeJsonAtomic(filePath, req.body);
                res.json({ ok: true });
            } catch (error) {
                console.error(`[${since()}] Error guardando ${filePath}:`, error.message);
                res.status(500).json({ error: 'Error guardando datos' });
            }
        }]
    };
}

function registerJsonStore(route, filePath, fallback, validator) {
    const handlers = jsonStoreHandlers(filePath, fallback, validator);
    app.get(route, handlers.get);
    app.post(route, ...handlers.post);
}

console.log(`[${since()}] Node ${process.version} arrancando server.js`);
console.log(`[${since()}] Publico: ${PUBLIC_DIR}`);
console.log(`[${since()}] Datos privados: ${STORAGE_DIR}`);

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb', strict: true }));

// API de mantenimiento. Se conservan las URL existentes para no tocar el cliente.
const carStorage = path.join(STORAGE_DIR, 'car-maintenance');
registerJsonStore('/api/maintenance', path.join(carStorage, 'data.json'), [], requireArray);
registerJsonStore(
    '/api/car-names',
    path.join(carStorage, 'car-names.json'),
    { car1: 'Coche 1', car2: 'Coche 2' },
    requireObject
);

// Apps contables. La URL publica sigue siendo /api/<app>/..., mientras que
// los ficheros se leen y escriben exclusivamente en storage/<app>/.
function registerAccountingAppRoutes(appName) {
    const storage = path.join(STORAGE_DIR, appName);
    registerJsonStore(`/api/${appName}/transactions`, path.join(storage, 'data.json'), [], requireArray);
    registerJsonStore(`/api/${appName}/accounts`, path.join(storage, 'accounts.json'), [], requireArray);
    registerJsonStore(`/api/${appName}/categories`, path.join(storage, 'categories.json'), [], requireArray);
}

registerAccountingAppRoutes('contabilidad');
registerAccountingAppRoutes('WalloTribute');

// Las rutas API inexistentes no deben caer en el portal HTML.
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint no encontrado' }));

// Unica raiz publica. No usar express.static(__dirname).
app.use(express.static(PUBLIC_DIR, {
    index: 'index.html',
    dotfiles: 'deny',
    fallthrough: true,
    redirect: true,
    etag: true,
    maxAge: 0
}));

app.use((req, res) => res.status(404).send('Not Found'));

// Errores de JSON mal formado y errores no controlados.
app.use((error, req, res, next) => {
    if (error && error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON no valido' });
    }
    console.error(`[${since()}] Error no controlado:`, error);
    res.status(500).json({ error: 'Error interno del servidor' });
});

const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[${since()}] HTTP disponible en http://localhost:${PORT}`);
});
httpServer.on('error', error => console.error(`[${since()}] ERROR HTTP:`, error.message));

if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    try {
        const httpsOptions = {
            cert: fs.readFileSync(CERT_FILE),
            key: fs.readFileSync(KEY_FILE)
        };
        const httpsServer = https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`[${since()}] HTTPS disponible en https://localhost:${HTTPS_PORT}`);
        });
        httpsServer.on('error', error => console.error(`[${since()}] ERROR HTTPS:`, error.message));
    } catch (error) {
        console.error(`[${since()}] No se pudo iniciar HTTPS:`, error.message);
    }
} else {
    console.warn(`[${since()}] HTTPS no iniciado: faltan certs/cert.pem o certs/key.pem.`);
}
