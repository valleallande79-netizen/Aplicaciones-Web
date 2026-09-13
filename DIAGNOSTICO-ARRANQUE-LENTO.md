# Arranque lento / hay que reiniciar a mano tras añadir HTTPS

## Causa nº1 (la más probable): el Firewall de Windows pregunta y nadie lo ve

Al abrir el puerto **8443** por primera vez, Windows muestra el diálogo
"Windows Defender Firewall ha bloqueado algunas características de esta
app" — **una vez por puerto nuevo**. Si `server.js` arranca automáticamente
al iniciar sesión (carpeta de Inicio / Tarea programada) sin que haya
nadie mirando la pantalla en ese momento, ese diálogo se queda esperando
una respuesta indefinidamente: el proceso Node sigue "vivo" pero no
sirve nada hasta que alguien lo acepta o lo rechaza a mano. Encaja
exactamente con tus tres síntomas (lento al arrancar Windows, lento para
el cliente, a veces hay que reiniciar).

**Solución de una sola vez** — autoriza los dos puertos por adelantado para
que el diálogo nunca vuelva a aparecer. Abre PowerShell **como
Administrador** y ejecuta:

```powershell
New-NetFirewallRule -DisplayName "Contabilidad HTTP"  -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Contabilidad HTTPS" -Direction Inbound -LocalPort 8443 -Protocol TCP -Action Allow
```

Con esto, Windows ya no pregunta nada en próximos arranques.

## Causa nº2: el script arranca antes de que la red esté lista

Si usas la carpeta de Inicio (`shell:startup`) para lanzar el `.bat`, se
ejecuta en el momento del login, que puede ser ANTES de que el adaptador
de red tenga IP asignada por DHCP. `server.js` intenta hacer `bind` a
`0.0.0.0` en ese instante y puede fallar o tardar mucho en resolverse.

**Solución**: usa el Programador de tareas en vez de la carpeta de Inicio:

1. Abre "Programador de tareas" → "Crear tarea básica".
2. Desencadenador: "Al iniciar sesión".
3. En la pestaña **Configuración** (no en el desencadenador básico), marca
   "Retrasar la tarea durante" → 30 segundos.
4. En **Desencadenadores** → Editar → marca "Retrasar la tarea durante" 15-30s
   también ahí si la opción aparece, o añade la condición "Iniciar solo si
   la siguiente conexión de red está disponible: Cualquier conexión" en la
   pestaña **Condiciones**.

## Causa nº3: Windows Defender escaneando node_modules en cada arranque

Si tienes el antivirus con protección en tiempo real activada, cada vez
que Node abre los ~300-1000 ficheros de `node_modules\express\...` recién
después de un reinicio (con la caché de Defender "fría"), puede añadir
varios segundos. Es más notorio justo tras un reinicio del PC.

**Solución (opcional, sopesa el trade-off de seguridad)**: añade la carpeta
del proyecto a las exclusiones de Windows Security → "Protección antivirus
y contra amenazas" → "Exclusiones" → "Agregar exclusión" → carpeta
`C:\Users\gilmu\Desktop\Aplicaciones Web`.

## Cómo confirmar cuál es la causa real

El `server.js` actualizado ahora imprime marcas de tiempo en cada paso del
arranque, por ejemplo:

```
[+12ms] Node v20.11.0 arrancando server.js…
[+340ms] Servidor HTTP arrancado correctamente
[+341ms] Certificados leídos, arrancando HTTPS…
[+298000ms] Servidor HTTPS arrancado correctamente   ← aquí está el problema
```

La próxima vez que notes el arranque lento, abre la ventana de consola
donde corre `server.js` (o revisa el log si lo rediriges a fichero) y
copia esa salida — con los números exactos sabremos si el retraso está
entre "Node arrancando" y "HTTP arrancado" (causa nº2, red no lista) o
entre "HTTP arrancado" y "HTTPS arrancado" (causa nº1, Firewall
esperando).

Para guardar el log en fichero en vez de solo verlo en pantalla, cambia
tu `.bat` de arranque para redirigir la salida:

```bat
node server.js >> server.log 2>&1
```

Así puedes revisar `server.log` después de un reinicio incluso si no
estabas mirando la pantalla.
