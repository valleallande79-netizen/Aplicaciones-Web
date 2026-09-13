// server.js — colócalo en C:\Users\gilmu\Desktop\Aplicaciones Web
// Requisito (solo la primera vez): npm install express

const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const https      = require('https');

const app            = express();
const PORT           = process.env.PORT || 8080;
const HTTPS_PORT      = process.env.HTTPS_PORT || 8443;
const DATA_FILE      = path.join(__dirname, 'car-maintenance', 'data.json');
const CAR_NAMES_FILE = path.join(__dirname, 'car-maintenance', 'car-names.json');

// ── Certificado autofirmado para HTTPS (ver certs/README.md) ─────────────────
const CERT_DIR  = path.join(__dirname, 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE  = path.join(CERT_DIR, 'key.pem');

// ── Helper de creación de carpeta si no existe (único, compartido) ───────────
function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Helper de lectura segura ──────────────────────────────────────────────
// Un fichero .json corrupto o vacío (0 bytes) NO debe devolver un 500: como
// ApiService.bootstrap() en el cliente hace Promise.all() sobre accounts,
// transactions y categories a la vez, si UNA sola de esas llamadas falla
// con 500, TODA la app se queda sin arrancar (Promise.all rechaza entera).
// Mejor degradar con normalidad (como si el fichero no existiera) y avisar
// solo por consola, para que el problema real no pase desapercibido pero
// tampoco tumbe nada.
function readJsonSafe(filePath, fallback) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw.trim()) {
            console.warn(`[aviso] ${filePath} existe pero está vacío — devolviendo valor por defecto.`);
            return fallback;
        }
        return JSON.parse(raw);
    } catch (e) {
        console.warn(`[aviso] No se pudo leer/parsear ${filePath} (${e.message}) — devolviendo valor por defecto. Revisa el contenido del fichero.`);
        return fallback;
    }
}

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(express.json());

// ── API REST car-maintenance (debe ir ANTES de static) ────────────────────────

app.get('/api/maintenance', function(req, res) {
    res.json(readJsonSafe(DATA_FILE, []));
});
app.post('/api/maintenance', function(req, res) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Error guardando datos' });
    }
});
app.get('/api/car-names', function(req, res) {
    res.json(readJsonSafe(CAR_NAMES_FILE, { car1: 'Coche 1', car2: 'Coche 2' }));
});
app.post('/api/car-names', function(req, res) {
    try {
        fs.writeFileSync(CAR_NAMES_FILE, JSON.stringify(req.body, null, 2));
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Error guardando nombres' });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  Apps tipo "Contabilidad Doméstica" (transactions + accounts + categories)
//
//  Para clonar la app a una instancia nueva ("MiOtraApp", etc.):
//    1. Copia la carpeta contabilidad/ completa → MiOtraApp/
//    2. Edita el `url:` de MiOtraApp/collections/{Account,Transaction,
//       Category}Collection.js para que apunten a /api/MiOtraApp/... en
//       vez de /api/contabilidad/... (ESTE es el paso que se olvida y
//       causa que el clon siga leyendo los datos de la app original —
//       server.js solo decide qué CARPETA sirve, el JS del cliente decide
//       a qué ENDPOINT llama).
//    3. Añade una línea aquí abajo: registerAccountingAppRoutes('MiOtraApp');
//
//  Con esto, cada clon nuevo es una línea, no un bloque de ~40 copiado a
//  mano — así no se puede repetir el bug del ensureDir duplicado ni
//  olvidarse de proteger sus .json (ambos problemas venían de copiar y
//  pegar el bloque completo en vez de reutilizar una única función).
// ════════════════════════════════════════════════════════════════════════════

const registeredAppFolders = [];

function registerAccountingAppRoutes(appName) {
    const txnsFile = path.join(__dirname, appName, 'data.json');
    const accsFile = path.join(__dirname, appName, 'accounts.json');
    const catsFile = path.join(__dirname, appName, 'categories.json');

    app.get(`/api/${appName}/transactions`, (req, res) => res.json(readJsonSafe(txnsFile, [])));
    app.post(`/api/${appName}/transactions`, (req, res) => {
        try {
            ensureDir(txnsFile);
            fs.writeFileSync(txnsFile, JSON.stringify(req.body, null, 2));
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: 'Error guardando transacciones' });
        }
    });

    app.get(`/api/${appName}/accounts`, (req, res) => res.json(readJsonSafe(accsFile, [])));
    app.post(`/api/${appName}/accounts`, (req, res) => {
        try {
            ensureDir(accsFile);
            fs.writeFileSync(accsFile, JSON.stringify(req.body, null, 2));
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: 'Error guardando cuentas' });
        }
    });

    app.get(`/api/${appName}/categories`, (req, res) => res.json(readJsonSafe(catsFile, [])));
    app.post(`/api/${appName}/categories`, (req, res) => {
        try {
            ensureDir(catsFile);
            fs.writeFileSync(catsFile, JSON.stringify(req.body, null, 2));
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: 'Error guardando categorías' });
        }
    });

    // Cada carpeta registrada queda protegida automáticamente más abajo
    // (bloqueo de .json en estático) — no hace falta acordarse cada vez.
    registeredAppFolders.push(appName);
}

// ── Instancias activas ────────────────────────────────────────────────────
registerAccountingAppRoutes('contabilidad');
registerAccountingAppRoutes('WalloTribute');
// registerAccountingAppRoutes('MiOtraApp');   ← así se añade la siguiente


// ════════════════════════════════════════════════════════════════════════════
//  Estructura de carpetas resultante:
//
//  Aplicaciones Web\
//  ├── server.js
//  ├── certs\                  ← certificado autofirmado (ver certs/README.md)
//  │   ├── cert.pem
//  │   └── key.pem
//  ├── car-maintenance\
//  │   ├── data.json
//  │   └── car-names.json
//  ├── contabilidad\           ← se crea automáticamente al primer guardado
//  │   ├── index.html
//  │   ├── data.json
//  │   ├── accounts.json
//  │   └── categories.json
//  └── WalloTribute\           ← misma estructura, url: propios en sus collections
//      ├── index.html
//      ├── data.json
//      ├── accounts.json
//      └── categories.json
//
//  Acceso: http://localhost:8080/contabilidad/  |  http://localhost:8080/WalloTribute/
//  Acceso en red (con HTTPS): https://192.168.0.69:8443/contabilidad/  (etc.)
// ════════════════════════════════════════════════════════════════════════════


// ── Bloquear rutas sensibles ANTES de servir estáticos ────────────────────────
// FIX DE SEGURIDAD (1/2): express.static(__dirname) serviría certs/key.pem
// (la CLAVE PRIVADA del certificado) a cualquiera que la pidiera por HTTP.
app.use('/certs', (req, res) => res.status(403).send('Forbidden'));
app.use('/node_modules', (req, res) => res.status(403).send('Forbidden'));

// FIX DE SEGURIDAD (2/2): contabilidad/*.json, car-maintenance/*.json Y
// CUALQUIER carpeta de app registrada vía registerAccountingAppRoutes()
// (WalloTribute incluida) quedan protegidas automáticamente — antes
// WalloTribute se había quedado fuera de esta lista, así que sus .json
// eran descargables en crudo por HTTP sin pasar por la app.
const jsonProtectedFolders = ['/contabilidad', '/car-maintenance', ...registeredAppFolders.map(f => `/${f}`)];
app.use([...new Set(jsonProtectedFolders)], (req, res, next) => {
    if (req.path.toLowerCase().endsWith('.json')) return res.status(403).send('Forbidden');
    next();
});

// ── Ficheros estáticos (al final) ─────────────────────────────────────────────
app.use(express.static(__dirname));

// ── Diagnóstico de arranque lento ──────────────────────────────────────────
const t0 = Date.now();
const since = () => `+${Date.now() - t0}ms`;
console.log(`[${since()}] Node ${process.version} arrancando server.js…`);

// ── Arranque HTTP ──────────────────────────────────────────────────────────
const httpServer = app.listen(PORT, '0.0.0.0', function() {
    console.log(`[${since()}] Servidor HTTP arrancado correctamente`);
    console.log('  Local:  http://localhost:' + PORT);
    console.log('  Red:    http://192.168.0.69:' + PORT + '   (sin cifrado — Web Crypto NO funcionará aquí)');
    console.log('  Apps registradas:', registeredAppFolders.join(', '));
    console.log('');
});
httpServer.on('error', err => console.error(`[${since()}] ERROR al arrancar HTTP:`, err.message));

// ── Arranque HTTPS (opcional) ──────────────────────────────────────────────
if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    const httpsOptions = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
    console.log(`[${since()}] Certificados leídos, arrancando HTTPS…`);
    const httpsServer = https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', function() {
        console.log(`[${since()}] Servidor HTTPS arrancado correctamente`);
        console.log('  Local:  https://localhost:' + HTTPS_PORT);
        console.log('  Red:    https://192.168.0.69:' + HTTPS_PORT + '   (necesario para Web Crypto desde otros dispositivos)');
        console.log('  Nota: el certificado es autofirmado — el navegador avisará');
        console.log('        la primera vez en cada dispositivo. Ver certs/README.md.');
        console.log('');
    });
    httpsServer.on('error', err => console.error(`[${since()}] ERROR al arrancar HTTPS:`, err.message));
} else {
    console.log(`[${since()}] [HTTPS no arrancado] No se encontraron certs/cert.pem y certs/key.pem.`);
    console.log('  Ver certs/README.md para generarlos (un solo comando, 10 años de validez).');
    console.log('');
}
