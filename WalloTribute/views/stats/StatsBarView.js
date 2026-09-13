import BalanceService from '../../services/BalanceService.js';
import FormatService from '../../services/FormatService.js';

/**
 * StatsBarView — pinta la franja de estadísticas superior.
 * Recibe estado ya resuelto (activeAcc/activeHolder) vía options;
 * no conoce cómo se decidió ese estado (lo decide AppState/AppView).
 */
const StatsBarView = Backbone.View.extend({
    className: 'stats-bar',

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.state = options.state; // {activeAcc, activeHolder}
    },

    render() {
        const now = new Date();
        const { income, expense, savings } = this._monthlyForContext();
        const totalBal = this._resolveBalance();
        const label = this._balanceLabel();
        const mn = FormatService.monthName(now);

        this.$el.html(`
            <div class="stat-pill s-balance">
                <span class="stat-icon">🏦</span>
                <div><div class="stat-label">${label}</div>
                <div class="stat-value">${FormatService.currency(totalBal)}</div></div>
            </div>
            <div class="stat-pill s-income">
                <span class="stat-icon">📥</span>
                <div><div class="stat-label">Ingresos ${mn}</div><div class="stat-value">+${FormatService.currency(income)}</div></div>
            </div>
            <div class="stat-pill s-expense">
                <span class="stat-icon">📤</span>
                <div><div class="stat-label">Gastos ${mn}</div><div class="stat-value">−${FormatService.currency(expense)}</div></div>
            </div>
            <div class="stat-pill s-savings">
                <span class="stat-icon">💰</span>
                <div><div class="stat-label">Ahorro ${mn}</div>
                <div class="stat-value ${savings < 0 ? 'neg' : ''}">${savings >= 0 ? '+' : ''}${FormatService.currency(savings)}</div></div>
            </div>
        `);
        return this;
    },

    _monthlyForContext() {
        const now = new Date();
        // FIX: faltaba aplicar el filtro de titular (activeHolder), solo se
        // filtraba por cuenta. Con un titular seleccionado, ingresos/gastos/
        // ahorro del mes mostraban el total de TODA la cuenta (o de todas las
        // cuentas), arrastrando movimientos de otros titulares.
        let list = this.state.activeAcc === 'all'
            ? this.transactions.models
            : this.transactions.byAccount(this.state.activeAcc);

        if (this.state.activeHolder) {
            const ids = Array.isArray(this.state.activeHolder) ? this.state.activeHolder : [this.state.activeHolder];
            list = list.filter(t => ids.some(id => t.involvesHolder(id)));
        }

        const txns = new Backbone.Collection(list);
        return BalanceService.monthlySummary(txns, now.getMonth(), now.getFullYear());
    },

    _resolveBalance() {
        const { activeAcc, activeHolder } = this.state;
        if (activeHolder) {
            const ids = Array.isArray(activeHolder) ? activeHolder : [activeHolder];
            if (activeAcc === 'all') {
                const entries = [];
                this.accounts.each(acc => {
                    acc.holders.each(h => { if (ids.includes(h.id)) entries.push({ accountId: acc.id, holderId: h.id }); });
                });
                return BalanceService.groupedHolderBalance(entries, this.accounts, this.transactions);
            }
            const acc = this.accounts.get(activeAcc);
            const h = acc && acc.holders.get(ids[0]);
            return h ? BalanceService.holderBalance(acc, h, this.transactions) : 0;
        }
        return activeAcc === 'all'
            ? BalanceService.totalBalance(this.accounts, this.transactions)
            : BalanceService.accountBalance(this.accounts.get(activeAcc), this.transactions);
    },

    _balanceLabel() {
        const { activeAcc, activeHolder } = this.state;
        if (!activeHolder) return 'Balance total';
        if (activeAcc === 'all') {
            const ids = Array.isArray(activeHolder) ? activeHolder : [activeHolder];
            let name = '';
            this.accounts.each(acc => { const h = acc.holders.get(ids[0]); if (h) name = h.get('name'); });
            return name ? `Balance — ${name}` : 'Balance total';
        }
        const acc = this.accounts.get(activeAcc);
        const h = acc && acc.holders.get(activeHolder);
        return h ? `Balance — ${h.get('name')}` : 'Balance total';
    }
});

export default StatsBarView;
