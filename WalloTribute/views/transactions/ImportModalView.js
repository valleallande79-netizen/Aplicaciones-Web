import ImportService from '../../services/ImportService.js';
import FormatService from '../../services/FormatService.js';
import CategoryService from '../../services/CategoryService.js';
import Category from '../../models/Category.js';

/**
 * ImportModalView — importar movimientos desde un fichero exportado por
 * el banco (CSV/XLSX) o, como alternativa, texto pegado directamente de
 * la tabla de movimientos de la web.
 *
 * Dos pasos internos (source → preview): la detección de columnas es
 * 100% automática (ImportService.detectColumns, por cabecera del propio
 * fichero) — no hay paso de mapeo manual. Si no se puede detectar con
 * confianza, se avisa con un error claro en el propio paso 1 en vez de
 * pasar a una vista previa con columnas mal asignadas.
 *
 * Solo PARSEA y arma la vista previa (delegado en ImportService); no crea
 * ni persiste transacciones directamente — emite 'import:confirm' con los
 * atributos ya listos, igual que TxnModalView emite 'txn:save'.
 */
const ImportModalView = Backbone.View.extend({
    el: '#modal-import',

    events: {
        'click .modal-x, .modal-ft .btn-outline': 'close',
        'click': 'onOverlayClick',
        'change #imp-acc':           'onAccountChange',
        'change #imp-file-input':    'onFileSelected',
        'dragover .imp-dropzone':    'onDragOver',
        'dragleave .imp-dropzone':   'onDragLeave',
        'drop .imp-dropzone':        'onDrop',
        'click #imp-parse-paste-btn':'onParsePaste',
        'click #imp-back-btn':       'onBack',
        'click #imp-confirm-btn':    'onConfirmImport',
        'change .imp-row-check':     'onRowCheckChange',
        'change #imp-check-all':     'onCheckAll'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.categories = options.categories;
        this._resetState();
    },

    _resetState() {
        this.step = 'source';
        this.accountId = this.accounts.first() ? this.accounts.first().id : null;
        this.holderId = null;
        this.sourceLabel = '';
        this.busy = false;
        this.preview = [];
    },

    open() {
        this._resetState();
        this.$el.addClass('active');
        this._render();
    },

    close() { this.$el.removeClass('active'); },
    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    _render() {
        // modal-xl (más ancho) solo en el paso con tabla de checkboxes —
        // en el paso de origen (fichero/cuenta/titular) el ancho normal
        // sobra y se ve mejor compacto.
        this.$('.modal').toggleClass('modal-xl', this.step === 'preview');
        return this.step === 'source' ? this._renderSourceStep() : this._renderPreviewStep();
    },

    // ── Paso 1: elegir fichero (cuenta/titular se detectan y se confirman después) ──
    _renderSourceStep() {
        const accOpts = this.accounts.map(a => `<option value="${a.id}"${a.id === this.accountId ? ' selected' : ''}>${a.get('name')} — ${a.get('bank')}</option>`).join('');

        this.$('#imp-body').html(`
            <div class="form-group">
                <label>Fichero exportado del banco</label>
                <div class="imp-dropzone" id="imp-dropzone">
                    ${this.busy
                        ? `<p>⏳ Leyendo ${this._esc(this.sourceLabel)}…</p>`
                        : `<p>📄 Arrastra aquí el CSV o XLSX exportado por tu banco</p>
                           <p class="imp-dropzone-sub">o haz clic para elegir el fichero</p>`}
                    <input type="file" id="imp-file-input" accept=".csv,.txt,.xlsx,.xls" ${this.busy ? 'disabled' : ''}>
                </div>
            </div>

            <div class="imp-confirm-block">
                <p class="form-hint" style="margin-bottom:.5rem">
                    Cuenta y titular se detectan solos si el nombre del fichero
                    los menciona (p.ej. "movimientos_naranja_mario.csv") —
                    confírmalos o corrígelos aquí antes de continuar.
                </p>
                <div class="form-group">
                    <label>Cuenta destino</label>
                    <select id="imp-acc">${accOpts}</select>
                </div>
                <div class="form-group" id="imp-holder-group"></div>
            </div>

            <details class="imp-paste-details">
                <summary>O pega el texto copiado directamente de la web del banco</summary>
                <div class="form-group" style="margin-top:.6rem">
                    <textarea id="imp-paste-area" class="imp-paste-area" placeholder="Pega aquí la tabla copiada del banco…" rows="6"></textarea>
                </div>
                <button class="btn btn-outline btn-sm" id="imp-parse-paste-btn" type="button">Analizar texto pegado</button>
            </details>

            <p class="cred-error" id="imp-error" style="display:none"></p>
        `);
        this._renderHolderSelect();
        this.$('#imp-footer').html(`
            <button class="btn btn-outline btn-sm">Cancelar</button>
        `);
    },

    /**
     * Repinta solo el grupo del selector de titular, según los titulares
     * de la cuenta actualmente elegida — se llama tanto al renderizar el
     * paso 1 como al cambiar de cuenta o al autodetectar por fichero.
     * Si la cuenta no tiene titulares, el grupo queda vacío (oculto).
     */
    _renderHolderSelect() {
        const acc = this.accounts.get(this.accountId);
        const holders = acc && acc.hasHolders() ? acc.holders.models : [];
        if (!holders.length) { this.$('#imp-holder-group').html(''); return; }

        const opts = `<option value="">Sin asignar</option>` +
            holders.map(h => `<option value="${h.id}"${h.id === this.holderId ? ' selected' : ''}>${this._esc(h.get('name'))}</option>`).join('');
        this.$('#imp-holder-group').html(`
            <label>Atribuir a titular</label>
            <select id="imp-holder">${opts}</select>
        `);
    },

    onAccountChange(e) {
        this.accountId = e.target.value;
        // El titular seleccionado pertenece a la cuenta anterior — no tiene
        // sentido mantenerlo si cambia la cuenta, así que se resetea y se
        // repintan las opciones para la cuenta nueva.
        this.holderId = null;
        this._renderHolderSelect();
    },

    _esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },

    onDragOver(e) { e.preventDefault(); this.$('#imp-dropzone').addClass('imp-dropzone-over'); },
    onDragLeave(e) { e.preventDefault(); this.$('#imp-dropzone').removeClass('imp-dropzone-over'); },
    onDrop(e) {
        e.preventDefault();
        this.$('#imp-dropzone').removeClass('imp-dropzone-over');
        const file = e.originalEvent.dataTransfer.files[0];
        if (file) this._handleFile(file);
    },
    onFileSelected(e) {
        const file = e.target.files[0];
        if (file) this._handleFile(file);
    },

    async _handleFile(file) {
        const type = ImportService.detectFileType(file.name);
        if (!type) {
            this.$('#imp-error').text('Formato no reconocido — usa CSV o XLSX.').show();
            return;
        }

        // Autodetección por nombre de fichero: si el nombre menciona el
        // nombre de una cuenta o titular (sin mayúsculas/acentos), se
        // preseleccionan — el usuario puede corregirlo antes de analizar
        // si acierta mal. Si no hay coincidencia, se respeta lo que ya
        // hubiera elegido a mano en el desplegable.
        const matchedAccount = ImportService.matchAccountByFilename(file.name, this.accounts);
        this.accountId = matchedAccount ? matchedAccount.id : this.$('#imp-acc').val();
        const accForHolder = matchedAccount || this.accounts.get(this.accountId);
        const matchedHolder = ImportService.matchHolderByFilename(file.name, accForHolder);
        this.holderId = matchedHolder ? matchedHolder.id : null;

        this.busy = true;
        this.sourceLabel = file.name;
        this._render();

        try {
            const rows = type === 'csv'
                ? ImportService.parseCSV(await file.text())
                : ImportService.parseXLSX(await file.arrayBuffer());
            this._proceedWithRows(rows);
        } catch (err) {
            this.busy = false;
            this._render();
            this.$('#imp-error').text(err.message || 'No se ha podido leer el fichero.').show();
        }
    },

    onParsePaste() {
        this.accountId = this.$('#imp-acc').val();
        this.holderId = this.$('#imp-holder').val() || null;
        const rawText = this.$('#imp-paste-area').val();
        if (!rawText.trim()) {
            this.$('#imp-error').text('Pega antes algún contenido.').show();
            return;
        }
        const delimiter = ImportService.detectDelimiter(rawText);
        this._proceedWithRows(ImportService.parseRows(rawText, delimiter));
    },

    /** Detección de columnas 100% automática — sin paso de mapeo manual. */
    _proceedWithRows(rows) {
        this.busy = false;
        if (!rows.length) {
            this._render();
            this.$('#imp-error').text('No se ha podido interpretar ninguna fila.').show();
            return;
        }
        const { columnMap, dataRows } = ImportService.detectColumns(rows);
        if (!columnMap) {
            this._render();
            this.$('#imp-error').text('No se han podido reconocer automáticamente las columnas de fecha e importe de este fichero. Prueba a exportarlo de nuevo o revisa que sea un extracto de movimientos.').show();
            return;
        }
        this.preview = ImportService.buildPreview(dataRows, columnMap, this.transactions, this.accountId);
        this.step = 'preview';
        this._render();
    },

    // ── Paso 2: vista previa, marcar duplicados, confirmar ─────
    _renderPreviewStep() {
        const rowsHtml = this.preview.map(p => {
            const badge = !p.valid
                ? `<span class="imp-badge imp-badge-invalid">Sin interpretar</span>`
                : p.isDuplicate
                    ? `<span class="imp-badge imp-badge-dup">Posible duplicado</span>`
                    : '';
            const amtStr = p.valid ? FormatService.signedAmount(p.type, p.amount) : '—';
            const catCell = p.categoryLabel
                ? this._esc(p.categoryLabel)
                : `<em>${p.type === 'income' ? 'Otros ingresos' : 'Otros gastos'}</em>`;
            return `<tr class="${!p.valid ? 'imp-row-invalid' : ''}">
                <td><input type="checkbox" class="imp-row-check" data-row="${p.rowIndex}" ${p.include ? 'checked' : ''} ${!p.valid ? 'disabled' : ''}></td>
                <td>${p.date || '—'}</td>
                <td>${p.description || '<em>sin descripción</em>'}</td>
                <td class="imp-cat">${catCell}</td>
                <td class="imp-amt ${p.type}">${amtStr}</td>
                <td>${badge}</td>
            </tr>`;
        }).join('');

        const includedCount = this.preview.filter(p => p.include).length;
        const invalidCount = this.preview.filter(p => !p.valid).length;
        const dupCount = this.preview.filter(p => p.isDuplicate).length;
        const hasCategoryData = this.preview.some(p => p.categoryLabel);

        this.$('#imp-body').html(`
            <p class="form-hint" style="margin-bottom:.6rem">
                ${this.preview.length} filas detectadas
                ${invalidCount ? `· ${invalidCount} sin interpretar (se excluyen)` : ''}
                ${dupCount ? `· ${dupCount} parecen ya existir (revísalas)` : ''}
                ${hasCategoryData ? `· categoría tomada del propio fichero` : ''}
            </p>
            <div style="overflow-x:auto">
                <table class="imp-table">
                    <thead><tr>
                        <th><input type="checkbox" id="imp-check-all" checked></th>
                        <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Importe</th><th></th>
                    </tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `);
        this.$('#imp-footer').html(`
            <button class="btn btn-outline btn-sm" id="imp-back-btn">Atrás</button>
            <button class="btn btn-income btn-sm" id="imp-confirm-btn">Importar <span id="imp-confirm-count">${includedCount}</span> movimientos</button>
        `);
    },

    onBack() {
        this.step = 'source';
        this._render();
    },

    onRowCheckChange(e) {
        const idx = +$(e.currentTarget).data('row');
        const p = this.preview.find(x => x.rowIndex === idx);
        if (p) p.include = e.currentTarget.checked;
        this.$('#imp-confirm-count').text(this.preview.filter(x => x.include).length);
    },

    onCheckAll(e) {
        const checked = e.currentTarget.checked;
        this.preview.forEach(p => { if (p.valid) p.include = checked; });
        this.$('.imp-row-check:not(:disabled)').prop('checked', checked);
        this.$('#imp-confirm-count').text(this.preview.filter(x => x.include).length);
    },

    onConfirmImport() {
        const toImport = this.preview.filter(p => p.include);
        if (!toImport.length) { this.close(); return; }

        const countBefore = this.categories.length;

        const attrsList = toImport.map(p => ({
            type: p.type,
            amount: p.amount,
            date: p.date,
            accountId: this.accountId,
            toAccountId: null,
            // Categoría/subcategoría del propio fichero, resuelta contra las
            // ya existentes (o creada de forma silenciosa si es nueva) —
            // sin esto caía siempre en "otros ingresos/gastos".
            category: CategoryService.resolveOrCreate(p.type, p.categoryLabel, this.categories, Category),
            // Titular detectado por nombre de fichero (o elegido a mano) —
            // aplica a TODO el lote, ya que el nombre de fichero identifica
            // de quién son los movimientos, no fila a fila.
            holderId: this.holderId,
            toHolderId: null,
            description: p.description
        }));

        if (this.categories.length > countBefore) this.categories.persist();

        this.trigger('import:confirm', attrsList);
        this.close();
    }
});

export default ImportModalView;
