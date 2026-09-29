/**
 * FilterService — aplica el objeto de filtros a una lista de transacciones.
 * SRP: solo sabe filtrar, no sabe renderizar ni de dónde vienen los datos.
 * Cada filtro es una función independiente en el registro FILTERS,
 * lo que permite añadir nuevos filtros sin tocar apply() (OCP).
 */
const FILTERS = {
    type:     (t, val) => t.get('type') === val,
    cat:      (t, val) => t.get('category') === val,
    accId:    (t, val) => t.involvesAccount(val),
    // val puede ser un único holderId o varios separados por coma (filtro
    // agrupado en "Todas", donde el mismo titular puede tener un id
    // distinto por cuenta) — basta con que coincida alguno.
    holderId: (t, val) => String(val).split(',').some(id => t.involvesHolder(id)),
    year:     (t, val) => new Date(t.get('date')).getFullYear() == val,
    month:    (t, val) => new Date(t.get('date')).getMonth() == (val - 1), // val: 1-12 (evita que enero=0 sea "falsy")
    text:     (t, val) => (t.get('description') || '').toLowerCase().includes(val.toLowerCase())
};

const FilterService = {
    apply(transactions, filters) {
        let result = transactions;
        Object.entries(filters).forEach(([key, val]) => {
            if (!val) return;
            const fn = FILTERS[key];
            if (fn) result = result.filter(t => fn(t, val));
        });
        return result;
    },

    hasActiveFilters(filters) {
        return Object.values(filters).some(v => !!v);
    },

    emptyFilters() {
        return { type: '', cat: '', accId: '', holderId: '', year: '', month: '', text: '' };
    }
};

export default FilterService;
