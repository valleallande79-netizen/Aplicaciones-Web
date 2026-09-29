import CategoryService from '../../services/CategoryService.js';
import FilterService from '../../services/FilterService.js';
import OptionSortService from '../../services/OptionSortService.js';
import PeriodRangeService from '../../services/PeriodRangeService.js';

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
        'input [data-period-handle]': 'onPeriodInput',
        'change [data-period-handle]': 'onPeriodCommit',
        'click .fp-period-prev': 'onPeriodNavigate',
        'click .fp-period-next': 'onPeriodNavigate',
        'click .fp-period-today': 'onPeriodToday',
        'click .fp-header':     'onToggle',
        'keydown .fp-header':   'onToggleKeydown',
        'click .fp-clear':      'onClear'
    },

    initialize(options) {
        this.categories = options.categories;
        this.transactionCollection = options.transactionCollection; // para availYears
        this.filters = options.filters;
        this.open = false;
        this.resultCount = options.resultCount || 0;
        this.totalCount = options.totalCount || 0;
        this.periodWindowEnd = options.periodWindowEnd || PeriodRangeService.monthKey();
    },

    setOpen(isOpen) {
        this.open = isOpen;
        this.$el.toggleClass('open', isOpen);
    },

    render() {
        const f = this.filters;
        const cats = (f.type === 'income' || f.type === 'return') ? CategoryService.allFor('income', this.categories)
            : f.type === 'expense' ? CategoryService.allFor('expense', this.categories)
            : [...CategoryService.allFor('income', this.categories), ...CategoryService.allFor('expense', this.categories)];
        const catOpts = OptionSortService.categories(cats).map(c => `<option value="${c.id}"${f.cat === c.id ? ' selected' : ''}>${c.icon} ${c.label}</option>`).join('');

        const currentMonthKey = PeriodRangeService.monthKey();
        const windowEndDate = PeriodRangeService.dateFromKey(this.periodWindowEnd);
        const periodMonths = PeriodRangeService.build(windowEndDate);
        const isCurrentWindow = this.periodWindowEnd === currentMonthKey;
        const periodActive = !!(f.periodStart || f.periodEnd);
        let periodStartIndex = periodActive
            ? PeriodRangeService.indexForKey(periodMonths, f.periodStart, 0)
            : 0;
        let periodEndIndex = periodActive
            ? PeriodRangeService.indexForKey(periodMonths, f.periodEnd, 11)
            : 11;
        if (periodStartIndex > periodEndIndex) {
            [periodStartIndex, periodEndIndex] = [periodEndIndex, periodStartIndex];
        }
        const periodStartLabel = periodMonths[periodStartIndex];
        const periodEndLabel = periodMonths[periodEndIndex];
        const periodSummary = periodActive
            ? periodStartIndex === periodEndIndex
                ? `${periodStartLabel.monthLabel} ${periodStartLabel.yearLabel}`
                : `${periodStartLabel.monthLabel} ${periodStartLabel.yearLabel} – ${periodEndLabel.monthLabel} ${periodEndLabel.yearLabel}`
            : 'Todo el histórico';
        const periodCells = periodMonths.map((month, index) => `
            <span class="fp-period-cell${index >= periodStartIndex && index <= periodEndIndex ? ' selected' : ''}">
                <strong>${month.monthLabel}</strong><small>${month.yearLabel}</small>
            </span>`).join('');

        // El contador debe calcularse despues de eliminar Cuenta/Titular.
        // Solo refleja los filtros globales que siguen existiendo.
        const activeCount = FilterService.activeFilterCount(f);
        const resultsMsg = activeCount ? `${this.resultCount} de ${this.totalCount} movimientos` : '';

        this.$el.html(`
          <div class="fp-inner">
            <div class="fp-header" role="button" tabindex="0" aria-expanded="${this.open ? 'true' : 'false'}">
                <span class="fp-title">
                    <span class="fp-chevron">${this.open ? '▼' : '▶'}</span>
                    🔍 Filtros adicionales
                </span>
                <span class="fp-header-actions">
                    ${activeCount ? `<span class="fp-active-indicator" title="${activeCount} filtro${activeCount !== 1 ? 's' : ''} activo${activeCount !== 1 ? 's' : ''}"><span class="fp-active-dot"></span>${activeCount} activo${activeCount !== 1 ? 's' : ''}</span>` : ''}
                    <button class="btn btn-outline btn-sm fp-clear">✕ Limpiar</button>
                </span>
            </div>
            <div class="fp-body">
            <div class="fp-group">
                <label class="fp-label">Tipo</label>
                <select class="fp-select" data-filter="type">
                    <option value=""${!f.type ? ' selected' : ''}>Todos</option>
                    <option value="return"${f.type === 'return' ? ' selected' : ''}>↩️ Devoluciones</option>
                    <option value="holder-transfer"${f.type === 'holder-transfer' ? ' selected' : ''}>👥 Entre titulares</option>
                    <option value="expense"${f.type === 'expense' ? ' selected' : ''}>💸 Gastos</option>
                    <option value="income"${f.type === 'income' ? ' selected' : ''}>💹 Ingresos</option>
                    <option value="transfer"${f.type === 'transfer' ? ' selected' : ''}>🔄 Traspasos</option>
                </select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Categoría</label>
                <select class="fp-select" data-filter="cat"><option value="">Todas</option>${catOpts}</select>
            </div>
            <div class="fp-group">
                <label class="fp-label">Texto</label>
                <input class="fp-input" type="text" data-filter="text" value="${f.text}" placeholder="Descripción…">
            </div>
            <div class="fp-period-group">
                <div class="fp-period-heading">
                    <span><strong>Periodo</strong> · ventana de 12 meses</span>
                    <span class="fp-period-meta">
                        <span class="fp-period-window">${periodMonths[0].monthLabel} ${periodMonths[0].yearLabel} – ${periodMonths[11].monthLabel} ${periodMonths[11].yearLabel}</span>
                        <span class="fp-period-summary">Selección: ${periodSummary}</span>
                    </span>
                </div>
                <div class="fp-period-nav-row">
                    <button type="button" class="fp-period-nav fp-period-prev" data-direction="-1" title="Retroceder un mes" aria-label="Ventana anterior">‹</button>
                    <div class="fp-period-control" style="--range-start:${periodStartIndex};--range-end:${periodEndIndex}">
                    <div class="fp-period-months">${periodCells}</div>
                    <div class="fp-period-sliders">
                        <input type="range" min="0" max="11" step="1" value="${periodStartIndex}" data-period-handle="start" aria-label="Mes inicial">
                        <input type="range" min="0" max="11" step="1" value="${periodEndIndex}" data-period-handle="end" aria-label="Mes final">
                    </div>
                    </div>
                    <button type="button" class="fp-period-nav fp-period-next" data-direction="1" title="Avanzar un mes" aria-label="Ventana siguiente" ${isCurrentWindow ? 'disabled' : ''}>›</button>
                </div>
                ${!isCurrentWindow ? '<button type="button" class="fp-period-today">Hoy</button>' : ''}
            </div>
            <div class="fp-results">${resultsMsg}</div>
            </div>
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

    _periodIndexes() {
        let start = Number(this.$('[data-period-handle="start"]').val());
        let end = Number(this.$('[data-period-handle="end"]').val());
        if (start > end) [start, end] = [end, start];
        return { start, end };
    },

    onPeriodInput() {
        const months = PeriodRangeService.build(PeriodRangeService.dateFromKey(this.periodWindowEnd));
        const { start, end } = this._periodIndexes();
        const startMonth = months[start];
        const endMonth = months[end];
        this.$('.fp-period-control')
            .css('--range-start', start)
            .css('--range-end', end);
        this.$('.fp-period-cell').each((index, element) =>
            $(element).toggleClass('selected', index >= start && index <= end)
        );
        this.$('.fp-period-summary').text(
            start === end
                ? `${startMonth.monthLabel} ${startMonth.yearLabel}`
                : `${startMonth.monthLabel} ${startMonth.yearLabel} – ${endMonth.monthLabel} ${endMonth.yearLabel}`
        );
    },

    onPeriodCommit() {
        const months = PeriodRangeService.build(PeriodRangeService.dateFromKey(this.periodWindowEnd));
        const { start, end } = this._periodIndexes();
        this.trigger('filter:period-change', {
            periodStart: months[start].key,
            periodEnd: months[end].key
        });
    },

    onPeriodNavigate(e) {
        const direction = Number($(e.currentTarget).data('direction'));
        if (!direction) return;

        // Conserva la anchura y la posición relativa de la selección.
        // Las flechas desplazan la ventana un mes, no redefinen el rango.
        const { start, end } = this._periodIndexes();
        const currentMonthKey = PeriodRangeService.monthKey();
        let windowEnd = PeriodRangeService.shiftKey(
            this.periodWindowEnd,
            direction
        );
        if (windowEnd > currentMonthKey) windowEnd = currentMonthKey;

        const months = PeriodRangeService.build(
            PeriodRangeService.dateFromKey(windowEnd)
        );
        this.trigger('filter:period-window-change', {
            windowEnd,
            periodStart: months[start].key,
            periodEnd: months[end].key
        });
    },

    onPeriodToday() {
        this.trigger('filter:period-today');
    },

    onToggle(e) {
        if ($(e.target).closest('.fp-clear').length) return;
        this.trigger('filter:toggle');
    },

    onToggleKeydown(e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if ($(e.target).closest('.fp-clear').length) return;
        e.preventDefault();
        this.trigger('filter:toggle');
    },

    onClear(e) {
        e.stopPropagation();
        this.trigger('filter:clear');
    }
});

export default FilterPanelView;
