# Contabilidad Doméstica — Arquitectura Backbone MVC

Refactor del `index.html` monolítico (un único objeto `App` con >900 líneas,
mezclando estado, render, cálculo de saldos, filtros y llamadas a API) a
una arquitectura Backbone.js modular.

## Mapeo Modelo–Vista–Controlador

| Capa | Backbone | Responsabilidad |
|---|---|---|
| **Modelo** | `models/*.js`, `collections/*.js` | Datos + validación de forma. `Account` contiene su `HolderCollection`. Sin lógica de negocio ni de saldo. |
| **Vista** | `views/**/*.js` | Renderizado puro + captura de eventos DOM → eventos Backbone. No mutan estado global ni llaman a la API directamente. |
| ↳ ejemplo de composición | `AccountFormView` + `HolderRowView` | `AccountFormView` coordina la lista (qué fila está en edición); `HolderRowView` es la unidad reutilizable que pinta cada titular en modo display/edición y emite `holder:edit`/`holder:save`/`holder:cancel`/`holder:delete`/`holder:invalid`. |
| **Controlador** | `routers/AppRouter.js` + `views/AppView.js` + `app.js` | `AppRouter` traduce URL → acciones; `AppView` mantiene el único estado de navegación (cuenta/titular/filtros activos) y decide qué renderizar; `app.js` cablea todo en el arranque. |

## Principios SOLID aplicados

**S — Single Responsibility**
Cada archivo tiene una única razón de cambio:
- `BalanceService` — solo sabe calcular saldos.
- `FilterService` — solo sabe filtrar transacciones.
- `SavingsService` — solo agrega el panel de ahorro.
- `FormatService` — solo formatea moneda/fecha/ids.
- Cada `View` solo pinta **una** región de la pantalla (antes todo vivía en `App.render()` / `App._render*()`).

**O — Open/Closed**
- `FilterService.FILTERS` y `Transaction.TYPE_VALIDATORS` son registros de funciones: añadir un filtro o un tipo de movimiento nuevo no requiere tocar el cuerpo de `apply()`/`validate()`.
- Nuevas vistas (p.ej. un nuevo widget de estadísticas) se añaden componiendo en `AppView.render()` sin modificar las vistas existentes.

**L — Liskov Substitution**
- Todas las vistas de fila (`TxnItemView`) son intercambiables entre sí porque implementan el mismo contrato `initialize({model, accounts}) → render() → this`.
- `AccountCollection`/`TransactionCollection` extienden `Backbone.Collection` sin romper su contrato (`fetch`, `add`, `remove` siguen comportándose como se espera).

**I — Interface Segregation**
- Las vistas hijas solo reciben las dependencias que realmente usan (p. ej. `TxnItemView` solo recibe `accounts`, no `transactions` completo ni el estado de filtros).
- Los servicios son funciones puras agrupadas por dominio; nadie depende de un "God object" con 40 métodos (como el `App` original).

**D — Dependency Inversion**
- Las vistas hijas **no conocen** a `AppView`: se comunican por eventos (`this.trigger('account:selected', id)`), y es `AppView` quien decide la política de negocio. Esto invierte la dependencia: antes cada `onclick="App.xxx()"` acoplaba el HTML directamente al objeto controlador global.
- `BalanceService`/`FilterService` reciben `(accounts, transactions)` como parámetros explícitos en vez de leer variables globales — son testeables de forma aislada, sin arrancar Backbone ni el DOM.

## Comparación con el original

| Original (`App` monolito) | Ahora |
|---|---|
| `App._bal()`, `App._holderBal()` | `BalanceService.accountBalance()`, `.holderBalance()` |
| `App._filteredTxns()`, `App._hasFilters()` | `FilterService.apply()`, `.hasActiveFilters()` |
| `App._renderSavingsPanel()` (cálculo + HTML mezclados) | `SavingsService.buildMatrix()` (cálculo) + `SavingsPanelView` (HTML) |
| `App._fmt()` | `FormatService.currency()` |
| `onclick="App.metodo()"` inline en template strings | `events: {'click .selector': 'handler'}` delegado por vista |
| Un solo `render()` de 900 líneas | Árbol de vistas componibles, cada una con su propio `render()` |
| Persistencia con `fetch()` esparcida en cada acción | `collection.persist()` centralizado, un único punto por colección |

## Despliegue sobre el `server.js` existente

El servidor **no necesita ningún cambio**: las rutas `/api/contabilidad/accounts`
y `/api/contabilidad/transactions` ya existen en tu `server.js` y coinciden
exactamente con las `url:` de `AccountCollection` y `TransactionCollection`.
`express.static(__dirname)` ya sirve cualquier `.js` que cuelgue de
`contabilidad/`, así que los módulos ES (`import`/`export`) se cargan sin
configuración adicional.

Lo único que cambia es el **contenido** de la carpeta `contabilidad/`:

```
Aplicaciones Web\
├── server.js                     ← SIN CAMBIOS
├── car-maintenance\
└── contabilidad\
    ├── index.html                 ← REEMPLAZA al monolítico (nuevo, más ligero)
    ├── app.js                     ← bootstrap, antes era el <script> inline
    ├── data.json                  ← SIN CAMBIOS (tus transacciones)
    ├── accounts.json              ← SIN CAMBIOS (tus cuentas)
    ├── models/
    ├── collections/
    ├── services/
    ├── views/
    └── routers/
```

**Pasos:**

1. En el servidor, dentro de `contabilidad\`, **borra o renombra** el
   `index.html` monolítico actual (haz copia de seguridad si quieres poder
   volver atrás).
2. Copia ahí el nuevo `index.html` y las carpetas
   `models/ collections/ services/ views/ routers/ app.js` tal cual las
   tienes en este proyecto, manteniendo la misma jerarquía.
3. **No toques** `data.json` ni `accounts.json` — el nuevo front consume
   exactamente el mismo formato JSON que ya tienes ahí, no hace falta migrar datos.
4. Reinicia el proceso Node (o simplemente recarga si usas `nodemon`) y
   entra en `http://localhost:8080/contabilidad/`.

**Qué cambió en el `index.html` nuevo respecto al monolítico:**
- Se eliminó el bloque `<script>` de ~900 líneas con el objeto `App`.
- Se mantienen intactos el `<style>` y el HTML de los tres modales
  (`#modal-txn`, `#modal-accs`, `#modal-acc-form`), porque las vistas
  Backbone los usan como `el:` fijo (`TxnModalView.el = '#modal-txn'`, etc.).
- Se eliminaron los atributos `onclick="App...."` inline: ahora los eventos
  se delegan vía `events: {}` dentro de cada vista (`click .modal-x`, etc.).
- Se añaden 3 `<script>` de CDN antes de `app.js`: **jQuery, Underscore y
  Backbone** (Backbone depende de Underscore y, para el DOM, de jQuery).
- `app.js` se carga con `<script type="module" src="app.js">`, imprescindible
  para que funcionen los `import`/`export` del resto de ficheros.

**Verificación rápida tras desplegar:** abre la consola del navegador (F12).
Si ves errores `Failed to resolve module specifier`, comprueba que la
jerarquía de carpetas se copió completa y con los mismos nombres relativos
que usan los `import './...'` de cada fichero.

## Próximos pasos sugeridos

1. Añadir tests unitarios de `BalanceService` y `FilterService` (son funciones puras, ideales para Jest/Mocha sin DOM).
2. Sustituir `Backbone.sync` por defecto en las colecciones si el backend pasa a ser REST completo (actualmente se usa `persist()` porque el backend espera arrays planos vía POST).
3. Extraer `TxnModalView`/`AccountFormView` a un `FormController` compartido si se detecta duplicación al añadir más formularios.
