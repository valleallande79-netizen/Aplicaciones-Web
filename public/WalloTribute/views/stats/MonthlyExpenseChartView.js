import MonthlyExpenseService from '../../services/MonthlyExpenseService.js';
import FormatService from '../../services/FormatService.js';

/** Panel plegable de barras verticales para el gasto mensual efectivo. */
const MonthlyExpenseChartView = Backbone.View.extend({
    className: 'monthly-expense-panel',

    events: {
        'click .monthly-expense-hdr': 'onToggle'
    },

    initialize(options = {}) {
        this.open = false;
        this.referenceTransactions = options.referenceTransactions || [];
        this.transactions = [];
    },

    setTransactions(transactions, referenceTransactions = this.referenceTransactions) {
        this.transactions = transactions || [];
        this.referenceTransactions = referenceTransactions || this.transactions;
        return this;
    },

    render() {
        const data = MonthlyExpenseService.build(
            this.transactions,
            this.referenceTransactions
        );
        const max = Math.max(...data.map(item => item.amount), 0);
        const bars = data.map(item => {
            const height = max > 0 ? item.amount / max * 100 : 0;
            return `
                <div class="monthly-expense-column" title="${this._esc(item.label)}: ${FormatService.currency(item.amount)}">
                    <span class="monthly-expense-value">${FormatService.currency(item.amount)}</span>
                    <div class="monthly-expense-bar-space">
                        <div class="monthly-expense-bar" style="height:${height}%"></div>
                    </div>
                    <span class="monthly-expense-label">${this._esc(item.label)}</span>
                </div>`;
        }).join('');

        this.$el.html(`
            <div class="monthly-expense-hdr">
                <span class="monthly-expense-title">
                    <span class="monthly-expense-chevron">${this.open ? '▼' : '▶'}</span>
                    📊 Gasto mensual
                </span>
            </div>
            <div class="monthly-expense-body${this.open ? '' : ' hidden'}">
                <div class="monthly-expense-chart">${bars}</div>
            </div>
        `);
        return this;
    },

    onToggle() {
        this.open = !this.open;
        this.$('.monthly-expense-body').toggleClass('hidden', !this.open);
        this.$('.monthly-expense-chevron').text(this.open ? '▼' : '▶');
    },

    _esc(value) {
        return String(value || '').replace(/[&<>\"]/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;'
        }[character]));
    }
});

export default MonthlyExpenseChartView;
