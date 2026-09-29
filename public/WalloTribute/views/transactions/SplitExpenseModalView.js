import Transaction from '../../models/Transaction.js';
import CategoryService from '../../services/CategoryService.js';
import FormatService from '../../services/FormatService.js';
import OptionSortService from '../../services/OptionSortService.js';
import SplitExpenseService from '../../services/SplitExpenseService.js';
import AccountingService from '../../services/AccountingService.js';

/** Vista dedicada a editar las imputaciones analiticas de un gasto. */
const SplitExpenseModalView = Backbone.View.extend({
    el: '#modal-split-expense',

    events: {
        'click .modal-x, .split-cancel': 'close',
        'click': 'onOverlayClick',
        'click #split-add-row': 'onAddRow',
        'click .split-remove-row': 'onRemoveRow',
        'input .split-amount': 'updateSummary',
        'click #split-save': 'onSave',
        'click #split-clear': 'onClear'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.categories = options.categories;
        this.parent = null;
    },

    open(parent) {
        if (AccountingService.compensationMap(this.transactions).has(parent.id)) {
            this.trigger(
                'split:blocked',
                'No se puede descomponer un gasto compensado por una devolución.'
            );
            return false;
        }
        this.parent = parent;
        this.render();
        this.$el.addClass('active');
        return true;
    },

    close() {
        this.$el.removeClass('active');
        this.parent = null;
    },

    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    render() {
        const parent = this.parent;
        const children = SplitExpenseService.childrenOf(parent, this.transactions);
        const initialRows = children.length ? children : [null, null];
        const account = this.accounts.get(parent.get('accountId'));
        this.$('#split-title').text(`Descomponer gasto · ${FormatService.currency(parent.get('amount'))}`);
        this.$('#split-parent-info').html(
            `<strong>${this._esc(parent.get('description') || 'Gasto sin descripción')}</strong>` +
            `<span>${this._esc(account ? account.get('name') : 'Cuenta no disponible')} · ${FormatService.dateShort(parent.get('date'))}</span>` +
            `<small>La cuenta se conserva y no puede modificarse. El gasto padre seguirá siendo el único apunte bancario.</small>`
        );
        this.$('#split-rows').html(initialRows.map(child => this._rowHtml(child)).join(''));
        this.$('#split-error').hide().text('');
        this.$('#split-clear').toggle(children.length > 0);
        this.updateSummary();
        return this;
    },

    _rowHtml(child) {
        const account = this.accounts.get(this.parent.get('accountId'));
        const holders = account && account.hasHolders() ? OptionSortService.modelsBy(account.holders) : [];
        const categories = OptionSortService.categories(
            CategoryService.allFor('expense', this.categories)
        );
        const selectedHolder = child ? child.get('holderId') : (this.parent.get('holderId') || '');
        const selectedCategory = child ? child.get('category') : (this.parent.get('category') || '');
        const amount = child ? Number(child.get('amount')).toFixed(2) : '';
        const description = child ? child.get('description') : this.parent.get('description');
        const holderOptions = holders.map(holder =>
            `<option value="${holder.id}"${holder.id === selectedHolder ? ' selected' : ''}>${this._esc(holder.get('name'))}</option>`
        ).join('');
        const categoryOptions = categories.map(category =>
            `<option value="${category.id}"${category.id === selectedCategory ? ' selected' : ''}>${category.icon} ${this._esc(category.label)}</option>`
        ).join('');
        return `<div class="split-row" data-child-id="${child ? child.id : ''}">
            <input class="split-amount" type="number" min="0.01" step="0.01" placeholder="0,00" value="${amount}">
            <select class="split-category"><option value="">Categoría</option>${categoryOptions}</select>
            <select class="split-holder"><option value="">Titular</option>${holderOptions}</select>
            <input class="split-description" type="text" placeholder="Descripción opcional" value="${this._escAttr(description || '')}">
            <button type="button" class="btn-icon delete split-remove-row" title="Eliminar subgasto">🗑️</button>
        </div>`;
    },

    onAddRow() {
        this._clearAttention();
        this.$('#split-rows').append(this._rowHtml(null));
        this.updateSummary();
    },

    onRemoveRow(e) {
        if (this.$('.split-row').length <= 2) {
            this._showError('La descomposición debe conservar al menos dos subgastos.', e.currentTarget);
            return;
        }
        $(e.currentTarget).closest('.split-row').remove();
        this.updateSummary();
    },

    _readRows() {
        return this.$('.split-row').map((_, element) => {
            const $row = $(element);
            return {
                id: $row.data('child-id') || null,
                amount: parseFloat($row.find('.split-amount').val()),
                category: $row.find('.split-category').val(),
                holderId: $row.find('.split-holder').val(),
                description: $row.find('.split-description').val().trim()
            };
        }).get();
    },

    updateSummary() {
        const totalCents = SplitExpenseService.allocationTotal(this._readRows());
        const parentCents = SplitExpenseService.cents(this.parent.get('amount'));
        const remainingCents = parentCents - totalCents;
        this.$('#split-allocated').text(FormatService.currency(totalCents / 100));
        this.$('#split-remaining')
            .text(FormatService.currency(remainingCents / 100))
            .toggleClass('split-ok', remainingCents === 0)
            .toggleClass('split-error-value', remainingCents !== 0);
    },

    onSave() {
        // Defensa de dominio: la devolución pudo crearse mientras el modal
        // permanecía abierto, por lo que se valida de nuevo al guardar.
        if (AccountingService.compensationMap(this.transactions).has(this.parent.id)) {
            this._showError('No se puede guardar el reparto: este gasto está compensado por una devolución.');
            return;
        }
        const rows = this._readRows();
        const error = SplitExpenseService.validate(this.parent, rows);
        if (error) { this._showError(error); return; }

        const existing = SplitExpenseService.childrenOf(this.parent, this.transactions);
        const returnedIds = new Set(this.transactions
            .filter(transaction => transaction.get('type') === 'return')
            .map(transaction => transaction.get('originalTransactionId'))
            .filter(Boolean));
        const editedReturnedChild = rows.some(row => {
            const child = row.id ? this.transactions.get(row.id) : null;
            return child && returnedIds.has(child.id) &&
                SplitExpenseService.cents(row.amount) !== SplitExpenseService.cents(child.get('amount'));
        });
        const removedReturnedChild = existing.some(child =>
            returnedIds.has(child.id) && !rows.some(row => row.id === child.id)
        );
        if (editedReturnedChild || removedReturnedChild) {
            this._showError('No se puede cambiar el importe ni eliminar un subgasto que ya tiene una devolución vinculada.');
            return;
        }
        const retained = new Set(rows.map(row => row.id).filter(Boolean));
        existing.filter(child => !retained.has(child.id)).forEach(child => this.transactions.remove(child));
        rows.forEach(row => {
            const child = row.id ? this.transactions.get(row.id) : null;
            const attrs = SplitExpenseService.buildChildAttrs(this.parent, row, child ? child.id : null);
            if (child) child.set(attrs);
            else this.transactions.add(new Transaction(attrs));
        });
        this.transactions.persist();
        this.trigger('split:saved', this.parent);
        this.close();
    },

    onClear() {
        const children = SplitExpenseService.childrenOf(this.parent, this.transactions);
        const childIds = new Set(children.map(child => child.id));
        const hasLinkedReturn = this.transactions.some(transaction =>
            transaction.get('type') === 'return' && childIds.has(transaction.get('originalTransactionId'))
        );
        if (hasLinkedReturn) {
            this._showError('No se puede eliminar el reparto porque uno de sus subgastos tiene una devolución vinculada.');
            return;
        }
        if (!confirm('¿Eliminar la descomposición? El gasto padre volverá a usarse íntegramente en la analítica.')) return;
        children
            .forEach(child => this.transactions.remove(child));
        this.transactions.persist();
        this.trigger('split:saved', this.parent);
        this.close();
    },

    _showError(message, sourceElement = null) {
        this._clearAttention();
        const $error = this.$('#split-error');
        $error.text(message).show();
        void $error[0].offsetWidth;
        $error.addClass('split-attention');
        if (sourceElement) $(sourceElement).addClass('split-remove-attention');
        $error[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setTimeout(() => this._clearAttention(), 3200);
    },
    _clearAttention() {
        this.$('#split-error').removeClass('split-attention');
        this.$('.split-remove-row').removeClass('split-remove-attention');
    },
    _esc(value) { return String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); },
    _escAttr(value) { return this._esc(value); }
});

export default SplitExpenseModalView;
