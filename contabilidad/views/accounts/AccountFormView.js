import HolderRowView from './HolderRowView.js';
import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6'];

/**
 * AccountFormView — formulario crear/editar cuenta.
 * Composición: la lista de titulares se delega por completo a
 * HolderRowView (una instancia por titular). Esta vista solo coordina
 * la colección de filas: cuál está en modo edición, orden de montaje,
 * y traduce los eventos de las filas a mutaciones sobre su copia de
 * trabajo (workingHolders). Ya no genera HTML de fila directamente
 * (antes _displayRowHtml/_editRowHtml duplicaban lo que ahora vive
 * en HolderRowView — violaba SRP).
 */
const AccountFormView = Backbone.View.extend({
    el: '#modal-acc-form',

    events: {
        'click .modal-x, .modal-ft .btn-outline': 'close',
        'click .cswatch':                         'onColorPick',
        'click .holders-hdr .btn-outline':         'onAddHolderRow',
        'click #btn-save-account':                 'onSaveAccount',
        'click': 'onOverlayClick'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.editingModel = null;
        this.workingHolders = [];
        this.editingHolderRowId = null;
        this.selColor = COLORS[0];
        this.rowViews = []; // instancias vivas de HolderRowView
    },

    open(accountModel) {
        this.editingModel = accountModel || null;
        this.editingHolderRowId = null;
        this.workingHolders = accountModel
            ? accountModel.holders.map(h => ({ id: h.id, name: h.get('name'), initialBalance: h.get('initialBalance') }))
            : [];
        this.selColor = accountModel ? accountModel.get('color') : COLORS[0];

        this.$('#acc-form-title').text(accountModel ? 'Editar cuenta' : 'Nueva cuenta');
        this.$('#acc-id').val(accountModel ? accountModel.id : '');
        this.$('#acc-name').val(accountModel ? accountModel.get('name') : '');
        this.$('#acc-bank').val(accountModel ? accountModel.get('bank') : '');
        this.$('#acc-init').val(accountModel ? (accountModel.get('initialBalance') || 0) : 0);

        this._renderColorPicker();
        this._renderHoldersList();
        this._updateInitVisibility();
        this.$el.addClass('active');
    },

    close() {
        this.$el.removeClass('active');
        this._cleanupRowViews();
        this.workingHolders = [];
        this.editingHolderRowId = null;
    },

    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    _renderColorPicker() {
        this.$('#color-picker').html(
            COLORS.map(c => `<span class="cswatch${c === this.selColor ? ' sel' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')
        );
    },

    onColorPick(e) {
        this.selColor = $(e.currentTarget).data('color');
        this.$('.cswatch').each((i, el) => $(el).toggleClass('sel', $(el).data('color') === this.selColor));
    },

    _updateInitVisibility() {
        const $grp = this.$('#grp-acc-init');
        if (this.workingHolders.length > 0) {
            $grp.css({ opacity: 0.4, pointerEvents: 'none' });
            this.$('#acc-init').val(0);
        } else {
            $grp.css({ opacity: '', pointerEvents: '' });
        }
    },

    // ── Composición de HolderRowView ───────────────────────────
    _renderHoldersList() {
        this._cleanupRowViews();
        const $list = this.$('#form-holders-list');

        if (!this.workingHolders.length) {
            $list.html('<p class="fh-empty">Sin titulares. El saldo es de la cuenta globalmente.</p>');
            return;
        }

        $list.empty();
        this.workingHolders.forEach(h => {
            const rowView = new HolderRowView({
                holder: h,
                account: this.editingModel,
                transactions: this.transactions,
                editing: this.editingHolderRowId === h.id
            });
            this._bindRowEvents(rowView);
            rowView.render();
            $list.append(rowView.el);
            this.rowViews.push(rowView);

            if (rowView.editing) setTimeout(() => rowView.focusNameInput(), 40);
        });
    },

    _bindRowEvents(rowView) {
        rowView.on('holder:edit', id => {
            if (this.editingHolderRowId && this.editingHolderRowId !== id) {
                this.trigger('toast', 'Guarda o cancela el titular en edición primero', 'error');
                return;
            }
            this.editingHolderRowId = id;
            this._renderHoldersList();
        });

        rowView.on('holder:save', (id, values) => {
            const h = this.workingHolders.find(x => x.id === id);
            if (h) { h.name = values.name; h.initialBalance = values.initialBalance; delete h._isNew; }
            this.editingHolderRowId = null;
            this._renderHoldersList();
            this._updateInitVisibility();
        });

        rowView.on('holder:cancel', id => {
            const h = this.workingHolders.find(x => x.id === id);
            if (h && h._isNew) this.workingHolders = this.workingHolders.filter(x => x.id !== id);
            this.editingHolderRowId = null;
            this._renderHoldersList();
            this._updateInitVisibility();
        });

        rowView.on('holder:delete', id => this._deleteHolder(id));
        rowView.on('holder:invalid', msg => this.trigger('toast', msg, 'error'));
    },

    _deleteHolder(id) {
        // Regla de negocio (saldo pendiente) se resuelve aquí, porque
        // requiere conocer editingModel/transactions — HolderRowView
        // solo pide borrar, no decide si es seguro hacerlo.
        if (this.editingModel) {
            const holderModel = this.editingModel.holders.get(id);
            const bal = holderModel ? BalanceService.holderBalance(this.editingModel, holderModel, this.transactions) : 0;
            if (Math.abs(bal) > 0.005) {
                this.trigger('toast', `No se puede eliminar: saldo pendiente de ${FormatService.currency(bal)}`, 'error');
                return;
            }
        }
        if (!confirm('¿Eliminar este titular?')) return;
        this.workingHolders = this.workingHolders.filter(x => x.id !== id);
        if (this.editingHolderRowId === id) this.editingHolderRowId = null;
        this._renderHoldersList();
        this._updateInitVisibility();
    },

    onAddHolderRow() {
        if (this.editingHolderRowId) { this.trigger('toast', 'Guarda el titular actual antes de añadir otro', 'error'); return; }
        const id = FormatService.generateId('nh');
        this.workingHolders.push({ id, name: '', initialBalance: 0, _isNew: true });
        this.editingHolderRowId = id;
        this._renderHoldersList();
        this._updateInitVisibility();
    },

    _cleanupRowViews() {
        this.rowViews.forEach(v => v.remove());
        this.rowViews = [];
    },

    onSaveAccount() {
        const name = this.$('#acc-name').val().trim();
        const bank = this.$('#acc-bank').val().trim();
        if (!name) { this.trigger('toast', 'El nombre es obligatorio', 'error'); return; }
        if (!bank) { this.trigger('toast', 'La entidad bancaria es obligatoria', 'error'); return; }
        if (this.editingHolderRowId) { this.trigger('toast', 'Guarda o cancela el titular en edición', 'error'); return; }

        const init = this.workingHolders.length > 0 ? 0 : (parseFloat(this.$('#acc-init').val()) || 0);
        const attrs = {
            id: this.editingModel ? this.editingModel.id : undefined,
            name, bank, color: this.selColor, initialBalance: init,
            holders: this.workingHolders.filter(h => !h._isNew)
        };

        this.trigger('account:save', attrs, this.editingModel);
        this.close();
    },

    remove() {
        this._cleanupRowViews();
        return Backbone.View.prototype.remove.call(this);
    }
});

export default AccountFormView;
