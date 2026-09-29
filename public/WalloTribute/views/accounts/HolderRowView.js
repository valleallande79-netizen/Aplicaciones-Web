import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

/**
 * HolderRowView — una fila de titular dentro del formulario de cuenta.
 * SRP: solo sabe pintarse a sí misma en modo "display" o modo "edición"
 * y validar su propio par (nombre, saldo inicial). No conoce el resto
 * de titulares ni decide cuándo se guarda la cuenta completa.
 *
 * Emite eventos hacia AccountFormView, que es quien coordina la lista
 * (p.ej. impedir tener dos filas en edición a la vez).
 */
const HolderRowView = Backbone.View.extend({
    className: 'holder-row',

    events: {
        'click .btn-icon.edit':    'onEditClick',
        'click .btn-icon.delete':  'onDeleteClick',
        'click .btn-icon.save':    'onSaveClick',
        'click .btn-icon.cancel':  'onCancelClick'
    },

    /**
     * @param options.holder   {id, name, initialBalance, _isNew?} — copia de trabajo (no el modelo persistido)
     * @param options.account  Account model real, o null si la cuenta es nueva (aún sin persistir)
     * @param options.transactions TransactionCollection, para calcular saldo real si la cuenta ya existe
     * @param options.editing  boolean — si esta fila debe arrancar en modo edición
     */
    initialize(options) {
        this.holder = options.holder;
        this.account = options.account || null;
        this.transactions = options.transactions;
        this.editing = !!options.editing;
    },

    render() {
        this.$el.attr('data-holder-id', this.holder.id);
        this.$el.html(this.editing ? this._editTemplate() : this._displayTemplate());
        this.$el.attr('class', `${this.editing ? 'fh-edit' : 'fh-item'}`);
        return this;
    },

    _displayTemplate() {
        const balStr = this._resolveBalanceLabel();
        return `
            <span class="fh-dot"></span>
            <span class="fh-name">${this.holder.name}</span>
            <span class="fh-bal">${balStr}</span>
            <button class="btn-icon edit" title="Editar">✏️</button>
            <button class="btn-icon delete" title="Eliminar">🗑️</button>
        `;
    },

    _editTemplate() {
        return `
            <input class="fh-ni" type="text" value="${this.holder.name || ''}" placeholder="Nombre del titular">
            <input class="fh-ii" type="number" value="${this.holder.initialBalance || 0}" placeholder="Saldo inicial €" step="0.01">
            <button class="btn-icon save" style="color:#10b981;border-color:#6ee7b7" title="Guardar">✓</button>
            <button class="btn-icon cancel" title="Cancelar">✕</button>
        `;
    },

    _resolveBalanceLabel() {
        if (this.account) {
            const holderModel = this.account.holders.get(this.holder.id);
            const bal = holderModel ? BalanceService.holderBalance(this.account, holderModel, this.transactions) : 0;
            return `Saldo: ${FormatService.currency(bal)}`;
        }
        return `Inicial: ${FormatService.currency(this.holder.initialBalance || 0)}`;
    },

    focusNameInput() {
        this.$('.fh-ni').focus();
    },

    onEditClick() { this.trigger('holder:edit', this.holder.id); },

    onDeleteClick() {
        // Validación de saldo pendiente delegada al padre, que conoce
        // el estado de "cuenta existente vs nueva" para todas las filas.
        this.trigger('holder:delete', this.holder.id);
    },

    onSaveClick() {
        const name = this.$('.fh-ni').val().trim();
        const initialBalance = parseFloat(this.$('.fh-ii').val()) || 0;
        if (!name) {
            this.trigger('holder:invalid', 'El nombre del titular es obligatorio');
            return;
        }
        this.trigger('holder:save', this.holder.id, { name, initialBalance });
    },

    onCancelClick() { this.trigger('holder:cancel', this.holder.id); }
});

export default HolderRowView;
