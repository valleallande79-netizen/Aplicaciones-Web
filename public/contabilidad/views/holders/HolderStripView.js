import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

/**
 * HolderStripView — franja de titulares (agrupados en "Todas" o por cuenta).
 */
const HolderStripView = Backbone.View.extend({
    className: 'holder-strip',

    events: {
        'click .h-card': 'onCardClick'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.activeAcc = options.activeAcc;
        this.activeHolder = options.activeHolder;
    },

    render() {
        this.$el.html(this.activeAcc === 'all' ? this._renderGrouped() : this._renderSingleAccount());
        return this;
    },

    _renderGrouped() {
        const groups = this.accounts.groupHoldersByName();
        if (!groups.length) { this.$el.hide(); return ''; }
        this.$el.show();

        const activeIds = Array.isArray(this.activeHolder) ? this.activeHolder : null;
        const totalBal = BalanceService.totalBalance(this.accounts, this.transactions);

        let html = `<span class="holder-strip-label">👥 Titulares</span>
            <div class="h-card ${!activeIds ? 'active' : ''}" data-ids="">
                <span class="h-name">Todos</span>
                <span class="h-bal ${totalBal < 0 ? 'neg' : ''}">${FormatService.currency(totalBal)}</span>
            </div>`;

        groups.forEach(g => {
            const ids = g.entries.map(e => e.holderId);
            const bal = BalanceService.groupedHolderBalance(g.entries, this.accounts, this.transactions);
            const isActive = activeIds && ids.every(id => activeIds.includes(id)) && ids.length === activeIds.length;
            html += `<div class="h-card ${isActive ? 'active' : ''}" data-ids="${ids.join(',')}">
                <span class="h-name">${g.name}</span>
                <span class="h-bal ${bal < 0 ? 'neg' : ''}">${FormatService.currency(bal)}</span>
            </div>`;
        });
        return html;
    },

    _renderSingleAccount() {
        const acc = this.accounts.get(this.activeAcc);
        if (!acc || !acc.hasHolders()) { this.$el.hide(); return ''; }
        this.$el.show();

        const allActive = this.activeHolder === null ? 'active' : '';
        const accBal = BalanceService.accountBalance(acc, this.transactions);
        let html = `<span class="holder-strip-label">👥 Titulares</span>
            <div class="h-card ${allActive}" data-ids="">
                <span class="h-name">Todos</span>
                <span class="h-bal ${accBal < 0 ? 'neg' : ''}">${FormatService.currency(accBal)}</span>
            </div>`;

        acc.holders.each(h => {
            const active = this.activeHolder === h.id ? 'active' : '';
            const bal = BalanceService.holderBalance(acc, h, this.transactions);
            html += `<div class="h-card ${active}" data-ids="${h.id}">
                <span class="h-name">${h.get('name')}</span>
                <span class="h-bal ${bal < 0 ? 'neg' : ''}">${FormatService.currency(bal)}</span>
            </div>`;
        });
        return html;
    },

    onCardClick(e) {
        const raw = $(e.currentTarget).data('ids');
        const ids = raw === '' ? null : String(raw).split(',');
        this.trigger('holder:selected', ids && ids.length > 1 ? ids : (ids ? ids[0] : null));
    }
});

export default HolderStripView;
