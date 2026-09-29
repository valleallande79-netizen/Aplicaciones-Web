import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

/**
 * AccountTabsView — pestañas de cuentas ("Todas" + una por cuenta).
 * Emite eventos en lugar de mutar estado global directamente (bajo acoplamiento):
 * el AppView escucha 'account:selected' y decide qué hacer.
 */
const AccountTabsView = Backbone.View.extend({
    className: 'account-tabs-row',

    events: {
        'click .acc-tab':          'onTabClick',
        'click .tab-lock':         'onLockClick',
        'click .btn-gear-accounts': 'onOpenAccountsModal'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.activeAcc = options.activeAcc || 'all';
    },

    render() {
        const allActive = this.activeAcc === 'all' ? 'active' : '';
        let html = `<button class="acc-tab ${allActive}" data-acc-id="all">🏦 Todas</button>`;

        this.accounts.each(acc => {
            const active = this.activeAcc === acc.id ? 'active' : '';
            const bal = BalanceService.accountBalance(acc, this.transactions);
            const bclr = bal >= 0 ? 'var(--income)' : 'var(--expense)';
            const hc = acc.hasHolders() ? `<span class="tab-hcount">👥 ${acc.holders.length}</span>` : '';
            html += `<button class="acc-tab ${active}" data-acc-id="${acc.id}">
                <span class="tab-dot" style="background:${acc.get('color')}"></span>
                ${acc.get('name')}${hc}
                <span class="tab-bal" style="color:${bclr}">${FormatService.currency(bal)}</span>
                <span class="tab-lock" data-acc-id="${acc.id}" title="Credenciales">🔒</span>
            </button>`;
        });
        html += `<button class="btn-gear-accounts">⚙ Cuentas</button>`;
        this.$el.html(html);
        return this;
    },

    onTabClick(e) {
        const id = $(e.currentTarget).data('acc-id');
        this.trigger('account:selected', id);
    },

    onLockClick(e) {
        e.stopPropagation(); // no disparar tambien onTabClick (cambio de pestaña)
        const id = $(e.currentTarget).data('acc-id');
        this.trigger('account:credentials', id);
    },

    onOpenAccountsModal() {
        this.trigger('accounts:manage');
    }
});

export default AccountTabsView;
