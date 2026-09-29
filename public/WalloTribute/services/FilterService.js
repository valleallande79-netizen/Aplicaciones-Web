/**
 * FilterService — aplica el objeto de filtros a una lista de transacciones.
 * SRP: solo sabe filtrar, no sabe renderizar ni de dónde vienen los datos.
 * Cada filtro es una función independiente en el registro FILTERS,
 * lo que permite añadir nuevos filtros sin tocar apply() (OCP).
 */
const FILTERS = {
    type:     (t, val) => t.get('type') === val,
    cat:      (t, val) => t.get('category') === val,
    periodStart: (t, val) => String(t.get('date') || '').slice(0, 7) >= val,
    periodEnd:   (t, val) => String(t.get('date') || '').slice(0, 7) <= val,
    text:     (t, val) => (t.get('description') || '').toLowerCase().includes(val.toLowerCase())
};

const FilterService = {
    apply(transactions, filters, policy = {}) {
        const ignored = new Set(policy.ignore || []);
        let result = transactions;
        Object.entries(filters).forEach(([key, val]) => {
            if (!val || ignored.has(key)) return;
            const fn = FILTERS[key];
            if (fn) result = result.filter(t => fn(t, val));
        });
        return result;
    },

    /** Politica explicita para la grafica comparativa de doce meses. */
    applyForMonthlyExpenseChart(transactions, filters) {
        return this.apply(transactions, filters, { ignore: ['periodStart', 'periodEnd'] });
    },

    currentPeriodFilters(referenceDate = new Date()) {
        return {
            ...this.emptyFilters(),
            periodStart: `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`,
            periodEnd: `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
        };
    },


    activeFilterCount(filters) {
        const ordinary = ['type', 'cat', 'text']
            .filter(key => !!filters[key]).length;
        const period = filters.periodStart || filters.periodEnd ? 1 : 0;
        return ordinary + period;
    },

    hasActiveFilters(filters) {
        return Object.values(filters).some(v => !!v);
    },

    emptyFilters() {
        return { type: '', cat: '', periodStart: '', periodEnd: '', text: '' };
    }
};

export default FilterService;
