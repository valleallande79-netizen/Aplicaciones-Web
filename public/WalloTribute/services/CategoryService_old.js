/**
 * CategoryService — categorías de ingreso/gasto: las predefinidas de la
 * app + las que se van creando dinámicamente (p.ej. al importar
 * movimientos con una categoría/subcategoría del banco que no existía
 * todavía).
 *
 * SRP: sabe normalizar texto a un id de categoría y decidir si una
 * categoría "nueva" es en realidad una ya existente con otro formato de
 * texto (p.ej. "Alimentación" vs "alimentacion"). No sabe de vistas ni de
 * persistencia HTTP — eso lo hace CategoryCollection.
 */
const DEFAULT_INCOME_CATEGORIES = [
    { id: 'nomina',         label: 'Nómina',                 icon: '💼' },
    { id: 'alquiler',       label: 'Alquiler cobrado',       icon: '🏠' },
    { id: 'inversiones',    label: 'Inversiones/Dividendos', icon: '📈' },
    { id: 'pension',        label: 'Pensión/Subsidio',       icon: '🏛️' },
    { id: 'regalo',         label: 'Regalo recibido',        icon: '🎁' },
    { id: 'venta',          label: 'Venta',                  icon: '🏷️' },
    { id: 'reembolso',      label: 'Reembolso',              icon: '↩️' },
    { id: 'otros-ingresos', label: 'Otros ingresos',         icon: '➕' }
];
const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'alimentacion', label: 'Alimentación',               icon: '🛒' },
    { id: 'vivienda',     label: 'Vivienda/Alquiler/Hipoteca', icon: '🏠' },
    { id: 'suministros',  label: 'Suministros',                icon: '💡' },
    { id: 'transporte',   label: 'Transporte',                 icon: '🚗' },
    { id: 'salud',        label: 'Salud/Farmacia',             icon: '💊' },
    { id: 'ocio',         label: 'Ocio/Restaurantes',          icon: '🎭' },
    { id: 'ropa',         label: 'Ropa/Calzado',               icon: '👗' },
    { id: 'educacion',    label: 'Educación',                  icon: '📚' },
    { id: 'tecnologia',   label: 'Tecnología/Suscripciones',   icon: '💻' },
    { id: 'seguros',      label: 'Seguros',                    icon: '🛡️' },
    { id: 'impuestos',    label: 'Impuestos/Tasas',            icon: '📋' },
    { id: 'otros-gastos', label: 'Otros gastos',               icon: '➖' }
];
const CUSTOM_CATEGORY_ICON = '🏷️';

const CategoryService = {
    DEFAULT_INCOME_CATEGORIES,
    DEFAULT_EXPENSE_CATEGORIES,
    CUSTOM_CATEGORY_ICON,

    _normalize(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    },

    slugify(text) {
        return this._normalize(text)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'otros';
    },

    defaultsFor(type) {
        return type === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
    },

    /**
     * Lista combinada (predefinidas + personalizadas) para un tipo, lista
     * para pintar un <select>. `customCategories` es una CategoryCollection
     * (o cualquier objeto con `.filter`/`.each` sobre modelos con .get()).
     */
    allFor(type, customCategories) {
        const defaults = this.defaultsFor(type);
        const seen = new Set(defaults.map(c => c.id));
        const custom = (customCategories ? customCategories.filter(c => c.get('type') === type) : [])
            .map(c => ({ id: c.get('id') || c.id, label: c.get('label'), icon: c.get('icon') || CUSTOM_CATEGORY_ICON }))
            .filter(c => !seen.has(c.id));
        return [...defaults, ...custom];
    },

    /** Busca una categoría (predefinida o personalizada) por su id, para icono/label al pintar un movimiento */
    findById(type, id, customCategories) {
        return this.allFor(type, customCategories).find(c => c.id === id) || null;
    },

    /**
     * Dado un texto libre (p.ej. "Alimentación" de un extracto bancario),
     * busca una categoría existente (predefinida o personalizada) cuyo
     * label normalizado coincida, y devuelve su id. Si no hay ninguna,
     * crea una categoría personalizada nueva dentro de `customCategories`
     * (la añade a la colección; la persistencia la dispara quien llame a
     * esto) y devuelve su id recién creado.
     * @param CategoryModel constructor del modelo Category (para no acoplar este servicio a Backbone directamente)
     * @returns {string} id de categoría a usar
     */
    resolveOrCreate(type, rawLabel, customCategories, CategoryModel) {
        const label = String(rawLabel || '').trim();
        if (!label) return type === 'income' ? 'otros-ingresos' : 'otros-gastos';

        const normLabel = this._normalize(label);

        const existingDefault = this.defaultsFor(type).find(c => this._normalize(c.label) === normLabel);
        if (existingDefault) return existingDefault.id;

        const existingCustom = customCategories.find(c => c.get('type') === type && this._normalize(c.get('label')) === normLabel);
        if (existingCustom) return existingCustom.get('id') || existingCustom.id;

        const baseId = this.slugify(label);
        const idTaken = this.defaultsFor(type).some(c => c.id === baseId)
            || customCategories.some(c => (c.get('id') || c.id) === baseId);
        const finalId = idTaken ? `${baseId}-${Date.now().toString(36).slice(-4)}` : baseId;

        const model = new CategoryModel({ id: finalId, label, icon: CUSTOM_CATEGORY_ICON, type });
        customCategories.add(model);
        return finalId;
    }
};

export default CategoryService;
