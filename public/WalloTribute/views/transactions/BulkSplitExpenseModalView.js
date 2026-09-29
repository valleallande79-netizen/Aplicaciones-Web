import Transaction from '../../models/Transaction.js';
import FormatService from '../../services/FormatService.js';
import BulkSplitExpenseService from '../../services/BulkSplitExpenseService.js';

const BulkSplitExpenseModalView = Backbone.View.extend({
    el: '#modal-bulk-split',
    events: {
        'click .modal-x, .bulk-split-cancel': 'close',
        'click': 'onOverlayClick',
        'change input[name="bulk-split-scope"]': 'onScopeChange',
        'change .bulk-split-check': 'onRowCheck',
        'change #bulk-split-check-all': 'onCheckAll',
        'click #bulk-split-apply': 'onApply'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.group = null;
        this.period = {};
        this.preview = [];
    },

    open(group, period) {
        this.group = group;
        this.period = period || {};
        this.scope = 'current';
        this.$el.addClass('active');
        this.render();
    },

    close() { this.$el.removeClass('active'); },
    onOverlayClick(e) { if (e.target === this.el) this.close(); },
    _options() { return this.scope === 'all' ? {} : this.period; },

    render() {
        this.preview = BulkSplitExpenseService.buildPreview(
            this.group, this.accounts, this.transactions, this._options()
        );
        const ready = this.preview.filter(item => item.status === 'ready');
        const skipped = this.preview.filter(item => item.status !== 'ready');
        const total = ready.reduce((sum, item) => sum + Number(item.parent.get('amount') || 0), 0);
        const currentLabel = this.period.periodStart === this.period.periodEnd
            ? this.period.periodStart
            : `${this.period.periodStart} a ${this.period.periodEnd}`;
        this.$('#bulk-split-title').text(`⚖ Repartir gastos de ${this.group.name}`);
        this.$('#bulk-split-body').html(`
            <div class="bulk-split-warning">
                El saldo total de las cuentas no cambiará. Sí cambiarán retroactivamente los saldos,
                gráficas y acumulados individuales de los titulares afectados.
            </div>
            <div class="bulk-split-scope">
                <label><input type="radio" name="bulk-split-scope" value="current" ${this.scope === 'current' ? 'checked' : ''}> Periodo seleccionado (${currentLabel})</label>
                <label><input type="radio" name="bulk-split-scope" value="all" ${this.scope === 'all' ? 'checked' : ''}> Todo el historial disponible</label>
            </div>
            <div class="bulk-split-summary">
                <strong>${ready.length}</strong> gastos preparados · <strong>${FormatService.currency(total)}</strong>
                ${skipped.length ? ` · ${skipped.length} omitidos` : ''}
            </div>
            <div class="bulk-table-wrap"><table class="bulk-table bulk-split-table">
                <thead><tr><th><input type="checkbox" id="bulk-split-check-all" ${ready.length ? 'checked' : ''}></th><th>Fecha</th><th>Cuenta</th><th>Descripción</th><th>Importe</th><th>Reparto previsto</th><th>Estado</th></tr></thead>
                <tbody>${this.preview.map((item, index) => this._row(item, index)).join('') || '<tr><td colspan="7">No hay gastos candidatos en este periodo.</td></tr>'}</tbody>
            </table></div>
            <p id="bulk-split-error" class="form-error" style="display:none"></p>
        `);
        this.$('#bulk-split-apply').prop('disabled', !ready.length);
        return this;
    },

    _row(item, index) {
        const parent = item.parent;
        const fullDescription = parent.get('description') || 'Sin descripción';
        const shortDescription = this._abbreviate(fullDescription, 20);
        const allocation = item.allocations.map(part =>
            `${this._initials(part.holderName)} ${FormatService.currency(part.amount)}`
        ).join(' · ');
        return `<tr class="${item.status !== 'ready' ? 'bulk-split-skipped' : ''}">
            <td class="bulk-split-col-check"><input type="checkbox" class="bulk-split-check" data-index="${index}" ${item.selected ? 'checked' : ''} ${item.status !== 'ready' ? 'disabled' : ''}></td>
            <td class="bulk-split-col-date">${FormatService.dateShort(parent.get('date'))}</td>
            <td class="bulk-split-col-account">${this._esc(item.account ? item.account.get('name') : '—')}</td>
            <td class="bulk-split-col-description" title="${this._esc(fullDescription)}">${this._esc(shortDescription)}</td>
            <td class="bulk-split-col-amount">${FormatService.currency(parent.get('amount'))}</td>
            <td class="bulk-split-col-allocation">${allocation || '—'}</td>
            <td class="bulk-split-col-status">${item.status === 'ready' ? 'Preparado' : this._esc(item.reason)}</td>
        </tr>`;
    },

    _abbreviate(value, maxLength) {
        const text = String(value || '').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    },

    _initials(value) {
        const words = String(value || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        return words.map(word => word.charAt(0).toLocaleUpperCase('es')).join('') || '—';
    },

    onScopeChange(e) { this.scope = e.target.value; this.render(); },
    onRowCheck(e) {
        const item = this.preview[Number($(e.currentTarget).data('index'))];
        if (item) item.selected = e.currentTarget.checked;
        this._updateApplyState();
    },
    onCheckAll(e) {
        this.preview.forEach(item => { if (item.status === 'ready') item.selected = e.target.checked; });
        this.$('.bulk-split-check:not(:disabled)').prop('checked', e.target.checked);
        this._updateApplyState();
    },
    _updateApplyState() {
        const count = this.preview.filter(item => item.status === 'ready' && item.selected).length;
        this.$('#bulk-split-apply').prop('disabled', !count).text(`Aplicar reparto (${count})`);
    },

    async onApply() {
        const result = BulkSplitExpenseService.execute(this.preview, this.transactions);
        if (!result.selected.length) return;
        const $button = this.$('#bulk-split-apply');
        $button.prop('disabled', true).text('Guardando reparto…');
        result.created.forEach(attrs => this.transactions.add(new Transaction(attrs), { silent: true }));
        this.transactions.trigger('change');
        try {
            await this.transactions.persist();
            this.trigger('bulk-split:applied', {
                parents: result.selected.length,
                children: result.created.length,
                batchId: result.batchId
            });
            this.close();
        } catch (error) {
            this.$('#bulk-split-error')
                .text('No se pudo guardar el reparto. No recargues la página y vuelve a intentarlo.')
                .show();
            $button.prop('disabled', false).text(`Aplicar reparto (${result.selected.length})`);
        }
    },

    _esc(value) { return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
});

export default BulkSplitExpenseModalView;
