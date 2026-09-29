import CategoryService from '../../services/CategoryService.js';
import FormatService from '../../services/FormatService.js';

/**
 * BulkEditModalView — editar varios movimientos a la vez (categoría,
 * titular, o eliminarlos). Dos pasos internos (select → change), mismo
 * patrón que ImportModalView.
 *
 * Alcance deliberadamente limitado: cambiar tipo o cuenta en bloque
 * arrastra recálculos de saldo y campos de formulario que cambian según
 * el tipo — fuera de alcance. Solo categoría/titular/borrado, que son los
 * tres cambios que de verdad duelen tras una importación masiva.
 *
 * Restricciones de seguridad de datos (no solo de UI):
 *  - Cambiar categoría solo si TODOS los seleccionados son del mismo tipo
 *    (ingreso o gasto) — evita asignar una categoría de gasto a un ingreso.
 *  - Cambiar titular solo si TODOS pertenecen a la MISMA cuenta — un
 *    holderId solo tiene sentido dentro de la cuenta a la que pertenece.
 *
 * Manipula `transactions` (la colección real) directamente, igual que
 * AppView.deleteTransaction() — no delega la persistencia al controlador,
 * pero SÍ delega la notificación (evento 'toast'), mismo patrón que el
 * resto de modales.
 */
const BulkEditModalView = Backbone.View.extend({
    el: '#modal-bulk-edit',

    events: {
        'click .modal-x, .modal-ft .btn-outline': 'close',
        'click': 'onOverlayClick',
        'input #bulk-search':          'onSearchInput',
        'change #bulk-check-all':      'onCheckAll',
        'change .bulk-row-check':      'onRowCheckChange',
        'click #bulk-to-change-btn':   'onGoToChangeStep',
        'click #bulk-back-btn':        'onBack',
        'change #bulk-toggle-category':'onToggleCategory',
        'change #bulk-toggle-holder':  'onToggleHolder',
        'click #bulk-apply-btn':       'onApplyChanges',
        'click #bulk-delete-btn':      'onDeleteSelected'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.transactions = options.transactions; // TransactionCollection real
        this._resetState();
    },

    _resetState() {
        this.step = 'select';
        this.candidateTxns = []; // modelos visibles al abrir (respeta el filtro activo del panel)
        this.selectedIds = new Set();
        this.searchText = '';
    },

    /** @param candidateTxns array de modelos Transaction ya filtrados — los que estaban visibles al pulsar el botón */
    open(candidateTxns) {
        this._resetState();
        this.candidateTxns = candidateTxns;
        this.$el.addClass('active');
        this._render();
    },

    close() { this.$el.removeClass('active'); },
    onOverlayClick(e) { if (e.target === this.el) this.close(); },
    _esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); },

    _render() {
        // modal-xl (más ancho) solo en el paso de selección, que tiene la
        // tabla con checkboxes — el paso de cambios es un formulario
        // sencillo, no necesita el espacio extra.
        this.$('.modal').toggleClass('modal-xl', this.step === 'select');
        return this.step === 'select' ? this._renderSelectStep() : this._renderChangeStep();
    },

    _filteredCandidates() {
        if (!this.searchText) return this.candidateTxns;
        const q = this.searchText.toLowerCase();
        return this.candidateTxns.filter(t => (t.get('description') || '').toLowerCase().includes(q));
    },

    // ── Paso 1: seleccionar movimientos ─────────────────────────
    _renderSelectStep() {
        const list = this._filteredCandidates();
        const rowsHtml = list.map(t => {
            const acc = this.accounts.get(t.get('accountId'));
            const type = t.get('type');
            const cat = (type === 'income' || type === 'expense')
                ? CategoryService.findById(type, t.get('category'), this.categories) : null;
            const catLabel = cat ? `${cat.icon} ${cat.label}` : '—';
            const amtStr = FormatService.signedAmount(type, t.get('amount'));
            return `<tr>
                <td><input type="checkbox" class="bulk-row-check" data-id="${t.id}" ${this.selectedIds.has(t.id) ? 'checked' : ''}></td>
                <td>${FormatService.dateShort(t.get('date'))}</td>
                <td>${t.get('description') ? this._esc(t.get('description')) : '<em>sin descripción</em>'}</td>
                <td>${acc ? this._esc(acc.get('name')) : '—'}</td>
                <td>${catLabel}</td>
                <td class="imp-amt ${type}">${amtStr}</td>
            </tr>`;
        }).join('');

        const allVisibleChecked = list.length > 0 && list.every(t => this.selectedIds.has(t.id));

        this.$('#bulk-body').html(`
            <div class="form-group">
                <input type="text" id="bulk-search" class="fp-input" placeholder="Buscar por descripción…" value="${this._esc(this.searchText)}">
            </div>
            <p class="form-hint" style="margin-bottom:.5rem">${this.selectedIds.size} de ${this.candidateTxns.length} movimientos seleccionados</p>
            <div style="max-height:340px; overflow-y:auto">
                <table class="imp-table">
                    <thead><tr>
                        <th><input type="checkbox" id="bulk-check-all" ${allVisibleChecked ? 'checked' : ''}></th>
                        <th>Fecha</th><th>Descripción</th><th>Cuenta</th><th>Categoría</th><th>Importe</th>
                    </tr></thead>
                    <tbody>${rowsHtml || '<tr><td colspan="6"><em>Sin resultados</em></td></tr>'}</tbody>
                </table>
            </div>
        `);
        this.$('#bulk-footer').html(`
            <button class="btn btn-outline btn-sm">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="bulk-to-change-btn" ${this.selectedIds.size ? '' : 'disabled'}>Continuar (${this.selectedIds.size})</button>
        `);
    },

    onSearchInput(e) { this.searchText = e.target.value; this._render(); },

    onCheckAll(e) {
        const checked = e.target.checked;
        this._filteredCandidates().forEach(t => { checked ? this.selectedIds.add(t.id) : this.selectedIds.delete(t.id); });
        this._render();
    },

    onRowCheckChange(e) {
        const id = $(e.currentTarget).data('id');
        e.currentTarget.checked ? this.selectedIds.add(id) : this.selectedIds.delete(id);
        // actualizar solo el contador y el estado de "seleccionar todos" sin repintar toda la tabla (mantiene el scroll)
        const list = this._filteredCandidates();
        this.$('#bulk-check-all').prop('checked', list.length > 0 && list.every(t => this.selectedIds.has(t.id)));
        this.$('#bulk-body .form-hint').first().text(`${this.selectedIds.size} de ${this.candidateTxns.length} movimientos seleccionados`);
        this.$('#bulk-to-change-btn').prop('disabled', !this.selectedIds.size).text(`Continuar (${this.selectedIds.size})`);
    },

    onGoToChangeStep() {
        if (!this.selectedIds.size) return;
        this.step = 'change';
        this._render();
    },

    _selectedModels() {
        return this.candidateTxns.filter(t => this.selectedIds.has(t.id));
    },

    // ── Paso 2: elegir el cambio ─────────────────────────────────
    _renderChangeStep() {
        const selected = this._selectedModels();
        const types = new Set(selected.map(t => t.get('type')));
        const canCategory = types.size === 1 && (types.has('income') || types.has('expense'));
        const categoryType = canCategory ? [...types][0] : null;

        const accountIds = new Set(selected.map(t => t.get('accountId')));
        const singleAccount = accountIds.size === 1 ? this.accounts.get([...accountIds][0]) : null;
        const canHolder = !!(singleAccount && singleAccount.hasHolders());

        const catOptions = canCategory
            ? CategoryService.allFor(categoryType, this.categories).map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join('')
            : '';
        const holderOptions = canHolder
            ? `<option value="">Sin asignar</option>` + singleAccount.holders.map(h => `<option value="${h.id}">${h.get('name')}</option>`).join('')
            : '';

        this.$('#bulk-body').html(`
            <p class="form-hint" style="margin-bottom:1rem">${selected.length} movimiento${selected.length !== 1 ? 's' : ''} seleccionado${selected.length !== 1 ? 's' : ''}</p>

            <div class="bulk-change-block">
                <label class="bulk-toggle-label">
                    <input type="checkbox" id="bulk-toggle-category" ${canCategory ? '' : 'disabled'}>
                    Cambiar categoría a…
                </label>
                ${canCategory
                    ? `<select id="bulk-category-select" class="fp-select" disabled>${catOptions}</select>`
                    : `<p class="form-hint">Solo disponible si todos los seleccionados son del mismo tipo (todos ingreso, o todos gasto).</p>`}
            </div>

            <div class="bulk-change-block">
                <label class="bulk-toggle-label">
                    <input type="checkbox" id="bulk-toggle-holder" ${canHolder ? '' : 'disabled'}>
                    Cambiar titular a…
                </label>
                ${canHolder
                    ? `<select id="bulk-holder-select" class="fp-select" disabled>${holderOptions}</select>`
                    : `<p class="form-hint">Solo disponible si todos los seleccionados pertenecen a la misma cuenta, y esta tiene titulares.</p>`}
            </div>

            <div class="bulk-change-block bulk-danger">
                <button class="btn btn-expense btn-sm" id="bulk-delete-btn">🗑️ Eliminar estos ${selected.length} movimientos</button>
            </div>

            <p class="cred-error" id="bulk-error" style="display:none"></p>
        `);
        this.$('#bulk-footer').html(`
            <button class="btn btn-outline btn-sm" id="bulk-back-btn">Atrás</button>
            <button class="btn btn-income btn-sm" id="bulk-apply-btn">Aplicar cambios</button>
        `);
    },

    onBack() { this.step = 'select'; this._render(); },

    onToggleCategory(e) { this.$('#bulk-category-select').prop('disabled', !e.target.checked); },
    onToggleHolder(e) { this.$('#bulk-holder-select').prop('disabled', !e.target.checked); },

    onApplyChanges() {
        const changeCategory = this.$('#bulk-toggle-category').is(':checked');
        const changeHolder = this.$('#bulk-toggle-holder').is(':checked');
        if (!changeCategory && !changeHolder) {
            this.$('#bulk-error').text('Activa al menos un cambio (categoría o titular).').show();
            return;
        }

        const newCategory = changeCategory ? this.$('#bulk-category-select').val() : undefined;
        const newHolder = changeHolder ? (this.$('#bulk-holder-select').val() || null) : undefined;

        const selected = this._selectedModels();
        // {silent:true} + un unico trigger('change') al final: sin esto,
        // cada .set() dispara un 'change' en la colección y AppView
        // re-renderiza TODA la app una vez por cada movimiento — con un
        // lote grande serían decenas de re-renders síncronos seguidos.
        selected.forEach(t => {
            const attrs = {};
            if (changeCategory) attrs.category = newCategory;
            if (changeHolder) attrs.holderId = newHolder;
            t.set(attrs, { silent: true });
        });
        this.transactions.trigger('change');
        this.transactions.persist();

        this.trigger('toast', `${selected.length} movimiento${selected.length !== 1 ? 's' : ''} actualizado${selected.length !== 1 ? 's' : ''}`, 'success');
        this.close();
    },

    onDeleteSelected() {
        const selected = this._selectedModels();
        if (!selected.length) return;
        if (!confirm(`¿Eliminar ${selected.length} movimientos? Esta acción no se puede deshacer.`)) return;

        this.transactions.remove(selected, { silent: true });
        this.transactions.trigger('remove');
        this.transactions.persist();

        this.trigger('toast', `${selected.length} movimiento${selected.length !== 1 ? 's' : ''} eliminado${selected.length !== 1 ? 's' : ''}`, 'success');
        this.close();
    }
});

export default BulkEditModalView;
