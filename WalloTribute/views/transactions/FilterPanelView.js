import CategoryService from '../../services/CategoryService.js';
import FilterService from '../../services/FilterService.js';
import FormatService from '../../services/FormatService.js';

/**
 * FilterPanelView — formulario de filtros. Emite 'filter:change' con
 * {key, value} y deja que el controlador (TransactionsController) decida
 * cómo recalcular la lista. No conoce la lista de transacciones resultante.
 */
const FilterPanelView = Backbone.View.extend({
    className: 'filter-panel',

    events: {
        'change [data-filter]': 'onFilterChange',
        'input  [data-filter]': 'onFilterChange',
        'click .fp-clear':      'onClear'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.transactionCollection = options.transactionCollection; // para availYears
        this.filters = options.filters;
        this.activeAcc = options.activeAcc;
        this.open = false;
        this.resultCount = options.resultCount || 0;
        this.totalCount = options.totalCount || 0;
    },

    setOpen(isOpen) {
        this.open = isOpen;
        this.$el.toggleClass('open', isOpen);
    },

    render() {
        const f = this.filters;
        const cats = f.type === 'income' ? CategoryService.allFor('income', this.categories)
            : f.type === 'expense' ? CategoryService.allFor('expense', this.categories)
            : [...CategoryService.allFor('income', this.categories), ...CategoryService.allFor('expense', this.categories)];
        const catOpts = cats.map(c => `<option value="${c.id}"${f.cat === c.id ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('');

        const years = this.transactionCollection.availableYears();
        const yrOpts = years.map(y => `<option value="${y}"${f.year == y ? ' selected' : ''}>${y}</option>`).join('');

        const moOpts = FormatService.monthNames()
            .map((name, i) => `<option value="${i + 1}"${f.month == i + 1 ? ' selected' : ''}>${name}</option>`).join('');

        const accOpts = this.accounts.map(a => `<option value="${a.id}"${f.accId === a.id ? ' selected' : ''}>${a.get('name')}</option>`).join('');

        // Filtro de titular: en una cuenta individual, sus titulares tal
        // cual; en "Todas", agrupados por nombre (como la franja de
        // titulares) — antes solo se mostraba en cuenta individual, así
        // que en "Todas" no había forma de filtrar por titular.
        let holderFilter = '';
        if (this.activeAcc === 'all') {
            const groups = this.accounts.groupHoldersByName();
            if (groups.length) {
                const opts = groups.map(g => {
                    const ids = g.entries.map(e => e.holderId).join(',');
                    return `<option value="${ids}"${f.holderId === ids ? ' selected' : ''}>${g.name}</option>`;
                }).join('');
                holderFilter = `
            <div class="fp-group">
                <label class="fp-label">Titular</label>
                <select class="fp-select" data-filter="holderId">
                    <option value="">Todos</option>${opts}
                </select>
            </div>`;
            }
        } else {
            const acc = this.accounts.get(this.activeAcc);
            const holders = acc && acc.hasHolders() ? acc.holders.models : [];
            if (holders.length) {
                holderFilter = `
            <div class="fp-group">
                <label class="fp-label">Titular</label>
                <select class="fp-select" data-filter="holderId">
                    <option value="">Todos</option>
                    ${holders.map(h => `<option value="${h.id}"${f.holderId === h.id ? ' selected' : ''}>${h.get('name')}</option>`).join('')}
                </select>
            </div>`;
            }
        }

        const resultsMsg = FilterService.hasActiveFilters(f) ? `${this.resultCount} de ${this.totalCount} movimientos` : '';

        this.$el.html(`
          <div class="fp-inner">
            <div class="fp-header">
                <span class="fp-title">🔍 Filtros</span>
                <button class="btn btn-outline btn-sm fp-clear">✕ Limpiar</button>
            </div>
            <div class="fp-group">
                <label class="fp-label">Tipo</label>
                <select class="fp-select" data-filter="type">
                    <option value=""${!f.type ? ' selected' : ''}>Todos</option>
                    <option value="income"${f.type === 'income' ? ' selected' : ''}>💹 Ingresos</option>
                    <option value="expense"${f.type === 'expense' ? ' selected' : ''}>💸 Gastos</option>
                    <option value="transfer"${f.type === 'transfer' ? ' selected' : ''}>🔄 Traspasos</option>
                    <option value="holder-transfer"${f.type === 'holder-transfer' ? ' selected' : ''}>👥 Entre titulares</option>
                </select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Categoría</label>
                <select class="fp-select" data-filter="cat"><option value="">Todas</option>${catOpts}</select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Cuenta</label>
                <select class="fp-select" data-filter="accId"><option value="">Todas</option>${accOpts}</select>
            </div>
            ${holderFilter}
            <div class="fp-group">
                <label class="fp-label">Año</label>
                <select class="fp-select" data-filter="year"><option value="">Todos</option>${yrOpts}</select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Mes</label>
                <select class="fp-select" data-filter="month"><option value="">Todos</option>${moOpts}</select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Texto</label>
                <input class="fp-input" type="text" data-filter="text" value="${f.text}" placeholder="Descripción…">
            </div>
            <div class="fp-results">${resultsMsg}</div>
          </div>
        `);
        this.$el.toggleClass('open', this.open);
        return this;
    },

    onFilterChange(e) {
        const key = $(e.currentTarget).data('filter');
        const value = $(e.currentTarget).val();
        this.trigger('filter:change', { key, value });
    },

    onClear() { this.trigger('filter:clear'); }
});

export default FilterPanelView;
