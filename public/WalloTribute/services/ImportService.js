/**
 * ImportService — parseo de movimientos bancarios desde CSV o XLSX
 * exportados por la web del banco (o, como alternativa, texto pegado
 * directamente de la tabla de movimientos).
 *
 * SRP: cada parser de origen (CSV/XLSX/texto) solo sabe convertir SU
 * formato a la misma forma común — un array de filas, cada fila un array
 * de strings — y a partir de ahí, detectColumns/buildPreview/parseAmount/
 * parseDate son agnósticos al origen.
 *
 * Detección de columnas 100% automática: se intenta primero por NOMBRE de
 * cabecera (Fecha/Concepto/Importe, o su equivalente en inglés — la
 * inmensa mayoría de exports de banco llevan cabecera), y solo si eso
 * falla se cae a una heurística sobre los propios datos. No hay paso de
 * mapeo manual: si no se puede detectar con confianza, se avisa con un
 * error claro en vez de importar filas mal interpretadas.
 *
 * No sabe de DOM, de Backbone ni de cómo se pinta nada — testeable con
 * datos reales sin arrancar el navegador. XLSX depende de SheetJS cargado
 * por CDN (window.XLSX); el resto no tiene dependencias externas.
 */
const ImportService = {
    DELIMITERS: ['\t', ';', ','],

    HEADER_KEYWORDS: {
        date:        ['fecha valor', 'fecha operacion', 'f. valor', 'fecha', 'date'],
        amount:      ['importe', 'amount', 'cantidad'],
        debit:       ['cargo', 'debito', 'debe', 'salida', 'debit'],
        credit:      ['abono', 'credito', 'haber', 'entrada', 'credit'],
        description: ['concepto', 'descripcion', 'detalle', 'movimiento', 'operacion', 'description'],
        subcategory: ['subcategoria', 'subcategory'],
        category:    ['categoria', 'category'],
        balance:     ['saldo', 'balance']
    },

    /** Extensión del nombre de fichero → tipo de origen reconocido, o null */
    detectFileType(filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        if (ext === 'csv' || ext === 'txt') return 'csv';
        if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
        return null;
    },

    // ── Origen 1: CSV (parser propio, sin dependencias) ────────
    /**
     * Parser CSV robusto: soporta campos entre comillas (con comas/punto y
     * coma dentro), comillas escapadas (""), saltos de línea \r\n y \n, y
     * detecta automáticamente si el separador es coma o punto y coma (los
     * CSV que exportan los bancos españoles casi siempre usan ";").
     */
    parseCSV(text) {
        const firstLine = text.split(/\r?\n/)[0] || '';
        const semicolons = (firstLine.match(/;/g) || []).length;
        const commas = (firstLine.match(/,/g) || []).length;
        const delimiter = semicolons >= commas ? ';' : ',';

        const rows = [];
        let row = [], field = '', inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const c = text[i], next = text[i + 1];
            if (inQuotes) {
                if (c === '"' && next === '"') { field += '"'; i++; }
                else if (c === '"') { inQuotes = false; }
                else { field += c; }
            } else if (c === '"') {
                inQuotes = true;
            } else if (c === delimiter) {
                row.push(field); field = '';
            } else if (c === '\r') {
                // ignorar, el \n que le sigue cierra la fila
            } else if (c === '\n') {
                row.push(field); rows.push(row); row = []; field = '';
            } else {
                field += c;
            }
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }

        return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
    },

    // ── Origen 2: XLSX (requiere SheetJS cargado por CDN como window.XLSX) ──
    /**
     * @param arrayBuffer ArrayBuffer del fichero .xlsx/.xls leído con FileReader
     * @returns array de filas (primera hoja del libro)
     */
    parseXLSX(arrayBuffer) {
        if (typeof XLSX === 'undefined') {
            throw new Error('No se ha podido cargar el lector de Excel. Comprueba tu conexión a internet y recarga la página.');
        }
        // IMPORTANTE: NO se usa cellDates:true. Esa opción hace que SheetJS
        // construya un objeto Date de JS internamente a partir del número
        // de serie de la celda, y esa construcción puede interpretar el
        // valor como hora LOCAL en vez de UTC — lo cual desplaza la fecha
        // un día en cualquier huso horario con offset positivo (como
        // España). En su lugar, se leen las celdas en crudo (.t/.v/.z) y
        // las de fecha se decodifican con aritmética propia sobre el
        // número de serie (_excelSerialToISO), sin construir nunca un
        // Date "local" ambiguo — solo un instante UTC exacto vía
        // milisegundos.
        //
        // cellNF:true es IMPRESCINDIBLE aquí — sin ella, SheetJS puede no
        // adjuntar el código de formato (cell.z) a cada celda, y entonces
        // ninguna fecha se reconoce (bug real detectado: sin esta opción,
        // todas las filas fallaban con "Sin interpretar"). cellText
        // conserva además el texto ya formateado (cell.w) como señal de
        // respaldo, por si algún .xls antiguo no resolviera cell.z.
        const wb = XLSX.read(arrayBuffer, { type: 'array', cellNF: true, cellText: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet['!ref']) return [];

        const range = XLSX.utils.decode_range(sheet['!ref']);
        const rows = [];
        let dateCellsSeen = 0;
        for (let r = range.s.r; r <= range.e.r; r++) {
            const row = [];
            for (let c = range.s.c; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                if (cell && this._isDateCell(cell)) dateCellsSeen++;
                row.push(this._xlsxCellToString(cell));
            }
            rows.push(row);
        }
        // Diagnóstico silencioso: si el libro tiene celdas numéricas pero
        // ninguna se reconoció como fecha, lo avisamos por consola en vez
        // de fallar en silencio — ayuda a depurar si esto vuelve a pasar
        // con un formato de banco distinto.
        if (dateCellsSeen === 0) {
            console.warn('[ImportService] No se detectó ninguna celda de fecha en el Excel — revisa cell.z/cell.w del fichero si la fecha no se interpreta.');
        }
        return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
    },

    /**
     * Una celda numérica se trata como fecha si:
     *  1. su código de formato (cell.z) contiene "yy" (año) — señal fiable
     *     independiente del idioma/orden del formato, o
     *  2. (respaldo) no hay cell.z resuelto, pero el texto ya formateado
     *     (cell.w) tiene forma de fecha (dígitos separados por / - . o
     *     espacio, con un mes en medio) — cubre .xls antiguos donde
     *     SheetJS no siempre adjunta el código de formato.
     * En ambos casos, el VALOR que se decodifica sigue siendo el número
     * de serie crudo (cell.v) vía _excelSerialToISO — nunca se parsea el
     * texto formateado, así que un "15-Aug-26" con nombre de mes no da
     * ningún problema aunque sea el que active el respaldo.
     */
    _isDateCell(cell) {
        if (cell.t !== 'n') return false;
        if (/y{2,4}/i.test(String(cell.z || ''))) return true;
        if (cell.w && /\d{1,2}[\/\-. ]\S{1,4}[\/\-. ]\d{2,4}/.test(cell.w)) return true;
        return false;
    },

    /**
     * Una celda con formato numérico que contenga "yy" (año) se trata como
     * fecha — es una señal fiable independientemente del idioma/orden del
     * formato ("dd/mm/yyyy", "dd-mmm-yy", "mm/dd/yy"...), a diferencia de
     * intentar adivinar por el TEXTO ya formateado (que puede venir con
     * nombre de mes y no ser parseable, o en un orden ambiguo).
     */
    _xlsxCellToString(cell) {
        if (!cell || cell.v == null || cell.v === '') return '';
        if (this._isDateCell(cell)) {
            return this._excelSerialToISO(cell.v);
        }
        return String(cell.v).trim();
    },

    /**
     * Número de serie de fecha de Excel (días desde 1899-12-30, sistema
     * 1900) → "YYYY-MM-DD". Aritmética pura sobre milisegundos-desde-época:
     * construir el Date así representa un INSTANTE exacto sin ambigüedad
     * de interpretación local/UTC (a diferencia de `new Date(y,m,d)`, que
     * sí depende de la zona horaria del entorno donde se ejecute) — por
     * eso es seguro leer el resultado con getUTC*.
     */
    _excelSerialToISO(serial) {
        const ms = Math.round((serial - 25569) * 86400 * 1000);
        const d = new Date(ms);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // ── Origen 3 (alternativo): texto pegado directamente de la web ────
    /** Intenta adivinar el separador de columnas del texto pegado */
    detectDelimiter(rawText) {
        const lines = rawText.trim().split('\n').filter(l => l.trim()).slice(0, 5);
        if (!lines.length) return '\t';
        for (const d of this.DELIMITERS) {
            const counts = lines.map(l => l.split(d).length);
            if (counts.every(c => c > 1) && Math.min(...counts) === Math.max(...counts)) return d;
        }
        if (/ {2,}/.test(lines[0])) return / {2,}/;
        return '\t';
    },

    /** Texto en bruto + delimitador → array de filas (array de strings) */
    parseRows(rawText, delimiter) {
        return rawText.trim().split('\n')
            .map(line => line.split(delimiter).map(c => c.trim()))
            .filter(cols => cols.some(c => c !== ''));
    },

    // ── Comunes a todos los orígenes ────────────────────────────
    _normalize(s) {
        // Normalizacion conservadora para columnas bancarias. Se mantiene
        // la puntuacion porque algunas cabeceras reconocidas la contienen
        // literalmente (por ejemplo, "F. valor").
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    },

    _normalizeFilenameToken(s) {
        // Normalizacion mas agresiva, exclusiva para nombres de fichero:
        // guiones, puntos y guiones bajos actuan como separadores.
        return this._normalize(s)
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    },

    // ── Auto-detección de cuenta/titular por nombre de fichero ─────────
    // Palabras que no aportan (aparecen en casi todos los nombres) — se
    // ignoran para no generar falsos positivos ("cuenta" no distingue nada).
    _NAME_MATCH_STOPWORDS: new Set(['cuenta', 'titular', 'de', 'del', 'la', 'el', 'los', 'las', 'y']),

    /**
     * Compara el nombre de fichero contra el nombre de cada candidato
     * (cuenta o titular) palabra a palabra (sin mayúsculas/acentos) y
     * devuelve el que MÁS palabras coincidentes tenga — no el primero que
     * encaje. Esto importa de verdad con nombres que comparten apellido
     * (p.ej. "Mario Valle Gonzalez" y "Diego Valle Ballina"): un fichero
     * "mario_valle_agosto.csv" debe ganar para Mario (2 coincidencias:
     * mario+valle) y no para Diego (1 sola: valle), aunque Diego apareciera
     * antes en la lista. Con menos de 3 letras las palabras se ignoran
     * (evita que iniciales o partículas den falsos positivos).
     * @param candidates array de {name} o modelos con .get('name')
     * @returns el candidato con mejor puntuación, o null si ninguno coincide
     */
    _bestNameMatch(filename, candidates, getName) {
        const normFile = this._normalizeFilenameToken(filename.replace(/\.[^.]+$/, ''));
        let best = null, bestScore = 0;
        for (const c of candidates) {
            const words = this._normalizeFilenameToken(getName(c)).split(/\s+/).filter(w => w.length >= 3 && !this._NAME_MATCH_STOPWORDS.has(w));
            const score = words.filter(w => normFile.includes(w)).length;
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best;
    },

    /** @param accounts AccountCollection — devuelve el modelo Account que mejor coincide, o null */
    matchAccountByFilename(filename, accounts) {
        // El nombre de fichero puede usar el nombre funcional de la cuenta
        // o la entidad bancaria. Se comparan ambos sin alterar la colección.
        return this._bestNameMatch(
            filename,
            accounts.models,
            account => `${account.get('name')} ${account.get('bank') || ''}`
        );
    },

    /** @param account Account (o null) — devuelve el modelo Holder de ESA cuenta que mejor coincide, o null */
    matchHolderByFilename(filename, account) {
        if (!account) return null;
        return this._bestNameMatch(filename, account.holders.models, holder => holder.get('name'));
    },

    /** Resuelve de una vez el destino completo codificado en el nombre. */
    matchDestinationByFilename(filename, accounts) {
        const account = this.matchAccountByFilename(filename, accounts);
        const holder = this.matchHolderByFilename(filename, account);
        return {
            account,
            holder,
            complete: !!(account && holder)
        };
    },

    /**
     * Importe → number, soportando tanto formato español ("1.234,56 €",
     * punto miles + coma decimal) como anglosajón ("1,234.56", coma miles +
     * punto decimal). Se detecta por CUÁL separador aparece en última
     * posición dentro del número — esa es la convención estándar para
     * desambiguar. Devuelve null si no se puede interpretar como número.
     */
    parseAmount(raw) {
        if (raw == null) return null;
        let s = String(raw).trim().replace(/[€$\s]/g, '');
        if (!s) return null;
        let negative = false;
        if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
        if (s.startsWith('-')) { negative = true; s = s.slice(1); }
        if (s.startsWith('+')) s = s.slice(1);

        const lastComma = s.lastIndexOf(',');
        const lastDot = s.lastIndexOf('.');
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.'); // español: punto miles, coma decimal
        } else if (lastDot > lastComma) {
            s = s.replace(/,/g, ''); // anglosajón: coma miles, punto decimal (ya usable)
        } else if (lastComma !== -1) {
            s = s.replace(',', '.'); // solo coma presente → decimal
        }
        const n = parseFloat(s);
        if (isNaN(n)) return null;
        return negative ? -Math.abs(n) : n;
    },

    /**
     * Detecta si una columna de fechas dd/mm o mm/dd está en formato DD/MM
     * (europeo/español) o MM/DD (EEUU) mirando TODOS los valores de la
     * columna: si en alguna fila el primer número es >12, tiene que ser
     * día (DD/MM); si el segundo es >12, tiene que ser mes americano
     * (MM/DD) — un mes nunca puede ser >12. Sin ninguna pista en toda la
     * columna (ambiguo en todas las filas, p.ej. siempre día ≤12), se
     * asume DD/MM por ser el formato español, el habitual en este contexto.
     */
    _detectDateFormat(rawDates) {
        for (const raw of rawDates) {
            const m = String(raw || '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.]\d{2,4}$/);
            if (!m) continue;
            const [, a, b] = m;
            if (+a > 12) return 'DMY';
            if (+b > 12) return 'MDY';
        }
        return 'DMY';
    },

    /**
     * Fecha en dd/mm/yyyy, mm/dd/yyyy o yyyy-mm-dd → "yyyy-mm-dd" (formato
     * interno de Transaction). Si viene con hora pegada ("2026-08-15
     * 01:59:16" o con 'T'), se ignora — a esta app solo le importa el día.
     * El parámetro `format` ('DMY' por defecto) indica cómo interpretar
     * dd/mm vs mm/dd — lo decide _detectDateFormat mirando toda la
     * columna, no cada valor por separado (una misma columna no puede
     * mezclar formatos). Devuelve null si no reconoce el formato o si el
     * resultado no es una fecha válida.
     */
    parseDate(raw, format = 'DMY') {
        if (!raw) return null;
        let s = String(raw).trim();
        const timeIdx = s.search(/[T ]\d{1,2}:\d{2}/);
        if (timeIdx > 0) s = s.slice(0, timeIdx).trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
        if (!m) return null;
        let [, a, b, y] = m;
        let d, mo;
        if (format === 'MDY') { mo = a; d = b; } else { d = a; mo = b; }
        if (y.length === 2) y = (+y > 50 ? '19' : '20') + y;
        const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
        return isNaN(new Date(iso).getTime()) ? null : iso;
    },

    /**
     * Intenta reconocer una fila de cabecera comparando contra
     * HEADER_KEYWORDS. Para cada rol, se prueban sus palabras clave EN
     * ORDEN DE PRIORIDAD (el array) a través de TODAS las columnas antes
     * de pasar a la siguiente palabra clave — así una coincidencia más
     * específica (p.ej. "Concepto") gana a una genérica en una columna
     * anterior (p.ej. "Detalle" o "Tipo de Movimiento"), en vez de que
     * gane la que simplemente aparezca primero por posición.
     * Devuelve el columnMap si encuentra al menos fecha + (importe, o el
     * par cargo/abono), o null si no hay cabecera reconocible.
     */
    _detectColumnsFromHeader(headerRow) {
        const map = { date: -1, amount: -1, debit: -1, credit: -1, description: -1, subcategory: -1, category: -1, balance: -1 };
        const normalized = headerRow.map(c => this._normalize(c));
        const taken = new Set();

        for (const role of Object.keys(this.HEADER_KEYWORDS)) {
            for (const kw of this.HEADER_KEYWORDS[role]) {
                const idx = normalized.findIndex((norm, i) => norm && !taken.has(i) && norm.includes(kw));
                if (idx !== -1) { map[role] = idx; taken.add(idx); break; }
            }
        }
        const hasAmount = map.amount !== -1 || (map.debit !== -1 && map.credit !== -1);
        return (map.date !== -1 && hasAmount) ? map : null;
    },

    /**
     * Heurística de respaldo (sin cabecera reconocible): sobre la primera
     * fila de datos, busca cuál celda parece fecha, cuál parece importe, y
     * asume que la columna de texto más larga restante es la descripción.
     */
    _detectColumnsFromData(sample) {
        const map = { date: -1, amount: -1, debit: -1, credit: -1, description: -1, subcategory: -1, category: -1, balance: -1 };
        sample.forEach((cell, i) => {
            if (map.date === -1 && this.parseDate(cell)) map.date = i;
        });
        sample.forEach((cell, i) => {
            if (map.amount === -1 && i !== map.date && /[,.]/.test(cell) && this.parseAmount(cell) !== null) map.amount = i;
        });
        let maxLen = -1;
        sample.forEach((cell, i) => {
            if (i === map.date || i === map.amount) return;
            if (cell.length > maxLen) { maxLen = cell.length; map.description = i; }
        });
        return map;
    },

    /**
     * Punto de entrada único de detección automática. Muchos exports de
     * banco (sobre todo generados por motores de informes tipo
     * JasperReports) llevan varias filas de metadatos — número de
     * tarjeta, titular, fecha de exportación — ANTES de la fila de
     * cabecera real. Por eso se busca la cabecera entre las primeras
     * filas (no se asume que es la fila 0): se prueba cada una y se usa
     * la que reconozca más columnas con confianza.
     * @returns { columnMap, dataRows } — dataRows ya sin filas de metadatos/cabecera
     */
    detectColumns(rows) {
        if (!rows.length) return { columnMap: null, dataRows: [] };

        const SEARCH_LIMIT = Math.min(rows.length, 15);
        let bestIdx = -1, bestMap = null, bestScore = -1;
        for (let i = 0; i < SEARCH_LIMIT; i++) {
            const map = this._detectColumnsFromHeader(rows[i]);
            if (!map) continue;
            const score = Object.values(map).filter(v => v !== -1).length;
            if (score > bestScore) { bestScore = score; bestIdx = i; bestMap = map; }
        }
        if (bestMap) return { columnMap: bestMap, dataRows: rows.slice(bestIdx + 1) };

        // Sin cabecera reconocible en ninguna fila: heurística de datos
        // sobre la primera fila (comportamiento de respaldo, sin metadatos).
        const fromData = this._detectColumnsFromData(rows[0]);
        const hasAmount = fromData.amount !== -1 || (fromData.debit !== -1 && fromData.credit !== -1);
        return { columnMap: (fromData.date !== -1 && hasAmount) ? fromData : null, dataRows: rows };
    },

    /** Importe con signo de una fila, soportando tanto columna única como cargo/abono separados */
    _extractSignedAmount(cols, columnMap) {
        if (columnMap.amount >= 0) return this.parseAmount(cols[columnMap.amount]);
        if (columnMap.debit >= 0 || columnMap.credit >= 0) {
            const credit = columnMap.credit >= 0 ? this.parseAmount(cols[columnMap.credit]) : null;
            const debit = columnMap.debit >= 0 ? this.parseAmount(cols[columnMap.debit]) : null;
            if (credit != null && credit !== 0) return Math.abs(credit);
            if (debit != null && debit !== 0) return -Math.abs(debit);
            return null;
        }
        return null;
    },

    /**
     * Construye la vista previa: por cada fila, intenta extraer
     * fecha/importe/descripción según columnMap, determina income/expense
     * por el signo, y marca como posible duplicado cualquier transacción
     * ya existente en la misma cuenta con misma fecha e importe (± 0,005€).
     * No excluye los duplicados — solo los marca; `include` arranca en
     * false para ellos, pero el usuario decide en la vista previa.
     */
    buildPreview(rows, columnMap, existingTransactions, accountId) {
        const dateFormat = columnMap.date >= 0
            ? this._detectDateFormat(rows.map(r => r[columnMap.date]))
            : 'DMY';

        return rows.map((cols, rowIndex) => {
            const date = columnMap.date >= 0 ? this.parseDate(cols[columnMap.date], dateFormat) : null;
            const amountRaw = this._extractSignedAmount(cols, columnMap);
            const description = columnMap.description >= 0 ? (cols[columnMap.description] || '') : '';
            const valid = !!date && amountRaw !== null && amountRaw !== 0;
            const type = amountRaw > 0 ? 'income' : 'expense';
            const amount = amountRaw !== null ? Math.abs(amountRaw) : null;

            // Categoría del banco: subcategoría si viene y no está vacía;
            // si no, categoría; si tampoco, null (se resolverá al importar
            // como el "otros ingresos/gastos" por defecto de siempre).
            const subcatText = columnMap.subcategory >= 0 ? (cols[columnMap.subcategory] || '').trim() : '';
            const catText = columnMap.category >= 0 ? (cols[columnMap.category] || '').trim() : '';
            const categoryLabel = subcatText || catText || null;

            const isDuplicate = valid && existingTransactions.some(t =>
                t.get('accountId') === accountId &&
                t.get('date') === date &&
                Math.abs(Math.abs(t.get('amount')) - amount) < 0.005
            );

            return { rowIndex, valid, date, amount, type, description, categoryLabel, isDuplicate, include: valid && !isDuplicate };
        });
    }
};

export default ImportService;
