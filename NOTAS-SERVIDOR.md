# Arquitectura del servidor

## Cómo funciona

`data.json` en el servidor es la única fuente de verdad.

- La app arranca  →  GET /api/maintenance  →  muestra datos
- Guardas algo    →  POST /api/maintenance →  escribe data.json

El servidor es Node.js con Express, arrancado desde `iniciar-servidor.bat`.
`/api/maintenance` no es una carpeta física, es una ruta virtual que solo
existe mientras server.js está corriendo.

El único fichero físico que se crea es `data.json` dentro de `car-maintenance\`,
la primera vez que se guarda un registro.

## Sincronización entre dispositivos

Cualquier dispositivo de la red que abra http://192.168.0.69:8080 lee y
escribe en el mismo data.json.

    Móvil añade registro  →  POST → data.json actualizado
    PC abre la app        →  GET  → lee data.json → ve el registro nuevo

Advertencia: si dos dispositivos modifican datos al mismo tiempo, el último
en guardar gana. Para uso doméstico no es un problema.

## Añadir una nueva aplicación

Para cada nueva app añadir en server.js:

    const DATA_FILE_2 = path.join(__dirname, 'minuevaapp', 'data.json');

    app.get('/api/minuevaapp', function(req, res) {
        if (!fs.existsSync(DATA_FILE_2)) return res.json([]);
        res.json(JSON.parse(fs.readFileSync(DATA_FILE_2, 'utf8')));
    });

    app.post('/api/minuevaapp', function(req, res) {
        fs.writeFileSync(DATA_FILE_2, JSON.stringify(req.body, null, 2));
        res.json({ ok: true });
    });

Y en la nueva app el fetch apunta a /api/minuevaapp.

## Estructura de carpetas

    Aplicaciones Web\
    ├── server.js          ← rutas de todas las apps
    ├── iniciar-servidor.bat
    ├── node_modules\
    ├── car-maintenance\
    │   └── data.json      ← datos de esta app
    ├── MiFinanza\
    │   └── data.json      ← independiente
    └── minuevaapp\
        └── data.json      ← independiente
