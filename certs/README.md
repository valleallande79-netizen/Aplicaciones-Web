# Certificado HTTPS autofirmado

`cert.pem` y `key.pem` de esta carpeta son un certificado **autofirmado**,
válido 10 años (hasta 2036), con estos nombres/IPs reconocidos:

- `localhost`
- `127.0.0.1`
- `192.168.0.69` ← tu IP de red actual

`server.js` los detecta automáticamente al arrancar y levanta un segundo
servidor HTTPS en el puerto **8443**, además del HTTP normal en 8080 (que
sigue funcionando exactamente igual que antes, sin cambios).

## Cómo entrar

| Acceso | URL |
|---|---|
| Este mismo PC (sin HTTPS, sigue funcionando) | `http://localhost:8080/contabilidad/` |
| Este mismo PC, con HTTPS | `https://localhost:8443/contabilidad/` |
| Otro dispositivo de tu red (móvil, portátil…) | `https://192.168.0.69:8443/contabilidad/` |

**Las credenciales bancarias (Web Crypto) solo funcionan por HTTPS o por
`localhost`** — desde otro dispositivo necesitas sí o sí la URL con `https://`.

## Aviso "conexión no privada" del navegador

Al ser autofirmado (no lo emite una entidad certificadora reconocida), la
**primera vez** que entres desde cada navegador/dispositivo verás un aviso
tipo "Tu conexión no es privada" o "El certificado no es de confianza".
Es normal y esperado — significa que el tráfico SÍ está cifrado, solo que
el navegador no puede verificar automáticamente que el certificado lo
hayas emitido tú mismo (que es justo el caso).

Para continuar:
- **Chrome / Edge**: "Configuración avanzada" → "Continuar a 192.168.0.69 (no seguro)"
- **Firefox**: "Avanzado" → "Aceptar el riesgo y continuar"
- **Safari / iOS**: "Mostrar detalles" → "visitar este sitio web" → confirmar

Solo hace falta hacerlo una vez por navegador/dispositivo (algunos lo
recuerdan, otros lo piden en cada sesión — depende del navegador).

## Si tu IP de red cambia, o quieres regenerarlo

Si tu router te asigna una IP distinta a `192.168.0.69`, el certificado
seguirá funcionando para `localhost`, pero el acceso por IP de red dará
un aviso adicional de "nombre no coincide". Para regenerarlo con tu IP
actual:

**Opción A — Git Bash (si tienes Git para Windows instalado, ya trae OpenSSL):**

Abre "Git Bash" en esta carpeta y ejecuta:

```bash
openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout key.pem -out cert.pem -days 3650 \
  -subj "/CN=Contabilidad Domestica Local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:TU_IP_AQUI"
```

Sustituye `TU_IP_AQUI` por tu IP de red actual (puedes verla con `ipconfig`
en una consola de Windows, campo "Dirección IPv4").

**Opción B — Node.js puro (sin depender de OpenSSL), con el paquete `selfsigned`:**

```bash
npm install selfsigned --save-dev
```

Crea un fichero `generate-cert.js` en esta misma carpeta:

```javascript
const selfsigned = require('selfsigned');
const fs = require('fs');

const attrs = [{ name: 'commonName', value: 'Contabilidad Domestica Local' }];
const pems = selfsigned.generate(attrs, {
    days: 3650,
    extensions: [{
        name: 'subjectAltName',
        altNames: [
            { type: 2, value: 'localhost' },       // type 2 = DNS
            { type: 7, ip: '127.0.0.1' },           // type 7 = IP
            { type: 7, ip: 'TU_IP_AQUI' }
        ]
    }]
});

fs.writeFileSync('cert.pem', pems.cert);
fs.writeFileSync('key.pem', pems.private);
console.log('Certificado regenerado.');
```

Ejecuta `node generate-cert.js` y reinicia `server.js`.

## Importante

- `key.pem` es la clave privada del certificado — no la compartas ni la
  subas a ningún repositorio público. Para este uso (cifrar tráfico dentro
  de tu propia red doméstica) no pasa nada si se pierde o se regenera:
  simplemente tendrás que volver a aceptar el aviso del navegador una vez.
- Esto **no** sustituye una autenticación de acceso al servidor — cualquiera
  en tu red que conozca la IP y el puerto puede entrar a la app igual que
  antes. El certificado solo cifra el tráfico y habilita Web Crypto; no
  añade control de acceso.
