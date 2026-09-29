import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

/**
 * AccountsModalView — modal con el listado de cuentas (CRUD entrypoint).
 * Emite eventos 'account:edit', 'account:delete', 'account:new' —
 * la orquestación real (abrir AccountFormView) vive en AppView/Controller.
 */
const AccountsModalView = Backbone.View.extend({
    el: '#modal-accs',

    events: {
        'click .modal-x, .modal-ft .btn-outline:last-child': 'close',
        'click .btn-outline:first-child':                    'onNewAccount',
        'click .btn-icon.edit':                               'onEditClick',
        'click .btn-icon.delete':                              'onDeleteClick',
        'click': 'onOverlayClick'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
    },

    open() {
        this.render();
        this.$el.addClass('active');
    },

    close() { this.$el.removeClass('active'); },

    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    render() {
        const $list = this.$('#accs-list');
        if (!this.accounts.length) {
            $list.html('<p style="color:var(--muted);padding:1rem 0">No hay cuentas.</p>');
            return this;
        }
        const html = this.accounts.map(acc => {
            const bal = BalanceService.accountBalance(acc, this.transactions);
            const bclr = bal >= 0 ? 'var(--income)' : 'var(--expense)';
            const hc = acc.hasHolders()
                ? `<span class="acc-holders-count">👥 ${acc.holders.length} titular${acc.holders.length !== 1 ? 'es' : ''}</span>` : '';
            return `<div class="acc-item" data-acc-id="${acc.id}">
                <span class="acc-cdot" style="background:${acc.get('color')}"></span>
                <div class="acc-info">
                    <div class="acc-iname">${acc.get('name')} ${hc}</div>
                    <div class="acc-ibank">${acc.get('bank')}</div>
                </div>
                <div class="acc-ibal" style="color:${bclr}">${FormatService.currency(bal)}</div>
                <button class="btn-icon edit" title="Editar">✏️</button>
                <button class="btn-icon delete" title="Eliminar">🗑️</button>
            </div>`;
        }).join('');
        $list.html(html);
        return this;
    },

    onNewAccount() { this.trigger('account:new'); },
    onEditClick(e) { this.trigger('account:edit', $(e.currentTarget).closest('.acc-item').data('acc-id')); },
    onDeleteClick(e) { this.trigger('account:delete', $(e.currentTarget).closest('.acc-item').data('acc-id')); }
});

export default AccountsModalView;
