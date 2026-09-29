import CategoryService from '../../services/CategoryService.js';
import FormatService from '../../services/FormatService.js';

/**
 * ExpenseChartView — barras horizontales de gasto por categoría, sobre
 * el conjunto de transacciones YA FILTRADO que le pasan (mismo array que
 * usan FilterPanelView/TxnListView) — no sabe nada de filtros ni de
 * cuenta/titular activos, solo agrega y pinta lo que recibe. Por eso
 * funciona igual en "Todas" que en una cuenta individual, y se actualiza
 * solo con cualquier combinación de filtros: quien decide QUÉ hay en ese
 * array es AppView, esta vista solo lo visualiza (separación cálculo/
 * presentación, mismo patrón que SavingsPanelView).
 */
const ExpenseChartView = Backbone.View.extend({
    className: 'expense-chart-panel',

    events: {
        'click .exp-chart-hdr': 'onToggle',
        'click .exp-chart-row': 'onCategoryInspect',
        'keydown .exp-chart-row': 'onCategoryKeydown'
    },

    initialize(options) {
        this.categories = options.categories;
        this.open = false;
    },

    /** @param transactions array de modelos Transaction ya filtrados */
    setTransactions(transactions, referenceTransactions = transactions) {
        this.transactions = transactions;
        this.referenceTransactions = referenceTransactions;
        return this;
    },

    render() {
        const data = CategoryService.groupExpensesByCategory(this.transactions, this.categories, this.referenceTransactions);

        if (!data.length) {
            this.$el.html(`
                <div class="exp-chart-hdr">
                    <span class="exp-chart-title">
                        <span class="exp-chart-chevron">${this.open ? '▼' : '▶'}</span>
                        📊 Gasto por categoría
                    </span>
                </div>
                <div class="exp-chart-body${this.open ? '' : ' hidden'}">
                    <p class="exp-chart-empty">Sin gastos en la selección actual.</p>
                </div>
            `);
            return this;
        }

        const max = data[0].amount; // ya viene ordenado de mayor a menor
        const total = data.reduce((s, d) => s + d.amount, 0);

        const rows = data.map(d => `
            <div class="exp-chart-row exp-chart-row-clickable" data-category-id="${this._esc(d.id)}" data-category-label="${this._esc(d.label)}" role="button" tabindex="0" title="Ver movimientos de ${this._esc(d.label)}">
                <span class="exp-chart-icon">${d.icon}</span>
                <span class="exp-chart-label">${this._esc(d.label)}</span>
                <div class="exp-chart-track">
                    <div class="exp-chart-fill" style="width:${max > 0 ? (d.amount / max * 100) : 0}%"></div>
                </div>
                <span class="exp-chart-amount">${FormatService.currency(d.amount)}</span>
                <span class="exp-chart-open" aria-hidden="true">›</span>
            </div>
        `).join('');

        this.$el.html(`
            <div class="exp-chart-hdr">
                <span class="exp-chart-title">
                    <span class="exp-chart-chevron">${this.open ? '▼' : '▶'}</span>
                    📊 Gasto por categoría
                </span>
                <span class="exp-chart-total">${FormatService.currency(total)}</span>
            </div>
            <div class="exp-chart-body${this.open ? '' : ' hidden'}">
                ${rows}
            </div>
        `);
        return this;
    },

    onToggle() {
        this.open = !this.open;
        this.$('.exp-chart-body').toggleClass('hidden', !this.open);
        this.$('.exp-chart-chevron').text(this.open ? '▼' : '▶');
    },

    onCategoryInspect(e) {
        const $row = $(e.currentTarget);
        this.trigger('category:inspect', {
            categoryId: String($row.data('category-id') || ''),
            categoryLabel: String($row.data('category-label') || 'Sin categoría')
        });
    },

    onCategoryKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        this.onCategoryInspect(e);
    },

    _esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
});

export default ExpenseChartView;
