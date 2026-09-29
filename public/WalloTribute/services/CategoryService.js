import AccountingService from './AccountingService.js';

/**
 * CategoryService — categorías de ingreso/gasto: EXCLUSIVAMENTE las que se
 * van creando dinámicamente (al importar, o al elegir "otros ingresos/
 * gastos" cuando el fichero no trae categoría). No hay categorías
 * predefinidas — la app parte vacía y se puebla solo con lo que
 * realmente aparece en tus extractos bancarios.
 *
 * Para que las categorías importadas no se vean todas con el mismo
 * icono genérico, se conserva un pequeño diccionario de palabras clave →
 * icono (ICON_KEYWORDS): al crear una categoría nueva se le asigna el
 * icono más apropiado según su nombre, sin que eso implique tener esa
 * categoría predefinida de antemano — es pura cosmética en el momento
 * de creación, no una lista de categorías disponibles.
 *
 * SRP: sabe normalizar texto a un id de categoría y decidir si una
 * categoría "nueva" es en realidad una ya existente con otro formato de
 * texto (p.ej. "Alimentación" vs "alimentacion"). No sabe de vistas ni de
 * persistencia HTTP — eso lo hace CategoryCollection.
 */

// categorías predefinidas — 
const DEFAULT_INCOME_CATEGORIES = [
    { id: 'inversiones',    label: 'Inversiones/Dividendos', icon: '📈' },
    { id: 'regalo',         label: 'Regalo recibido',        icon: '🎁' },
    { id: 'venta',          label: 'Venta',                  icon: '🏷️' }
];
const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'supermercados-y-alimentacion', label: 'Supermercados y alimentación',icon: '🛒' },
	{ id: 'cafeterias-y-restaurantes', label: 'Cafeterías y restaurantes',  icon: '🍴' },
    { id: 'comunidad',    label: 'Comunidad de vecinos',       icon: '🏠' },
	{ id: 'telefono-tv-e-internet',    label: 'Teléfono, TV e internet',       icon: '💻' },
	{ id: 'ong',    label: 'Ongs',       icon: '🎗️' },
	{ id: 'asesoria',    label: 'Asesorías/Notarías/Jurídico',       icon: '⚖️' },
	{ id: 'transporte-publico',   label: 'Transporte público',        icon: '🚌' },
    { id: 'salud',        label: 'Salud/Farmacia',             icon: '💊' },
    { id: 'ocio',         label: 'Ocio',          			   icon: '🎭' },
    { id: 'ropa',         label: 'Ropa/Calzado/Accesorios',    icon: '👗' },
    { id: 'educacion',    label: 'Educación y formación',      icon: '📚' },
    { id: 'deportes',     label: 'Actividades deportivas',     icon: '🚴' },
    { id: 'inversiones',  label: 'Fondos de Inversión',      icon: '📈' },
    { id: 'impuestos',    label: 'Impuestos/Tasas',            icon: '📋' },
	{ id: 'gasolina-y-combustible',  label: 'Gasolina y combustible', icon: '⛽' },
	{ id: 'coche',        label: 'Mantenimiento coche',        icon: '🚗'},
	{ id: 'mascotas', 	  label: 'Mascotas',                   icon: '🐾' },
	{ id: 'cuidados', 	  label: 'Cuidados personales',        icon: '💇' },
	{ id: 'farmacia', 	  label: 'Farmacia/Parafarmacia',        icon: '⚕️' },
	{ id: 'alquiler-coches', 	  label: 'Alquiler coches',        icon: '🔑' },
	{ id: 'vuelos', 	  label: 'Vuelos',        icon: '✈️ ' }
];

const FALLBACK_ICON = '🏷️';

// Orden de prioridad: la primera palabra clave que coincida gana. Cubre
// tanto las categorías que la app traía antes por defecto como las que
// suelen aparecer literalmente en extractos de banca española (p.ej.
// "Gastos del hogar", "Restauración", "Cuidados personales"...).
const ICON_KEYWORDS = [
    { icon: '🛒', keywords: ['Supermercados y alimentación', 'supermercado', 'alimentación'] },
    { icon: '🍴', keywords: ['Cafeterías y restaurantes', 'restaurante', 'cafeteria', 'bar '] },
    { icon: '🚌', keywords: ['Transporte público', 'transporte publico'] },
    { icon: '⛽', keywords: ['gasolina', 'combustible'] },
	{ icon: '🚗', keywords: ['taller', 'avería','coche','vehículo'] },
    { icon: '🏠', keywords: ['comunidad', 'vecinos'] },
    { icon: '🧹', keywords: ['gastos del hogar', 'hogar'] },
    { icon: '👗', keywords: ['accesorios', 'ropa', 'calzado'] },
    { icon: '💡', keywords: ['suministro', 'luz', 'agua', 'gas ','fibra','internet','movil'] },
    { icon: '🧾', keywords: ['impuesto', 'tasa'] },
    { icon: '🎭', keywords: ['ocio', 'cultura', 'cine'] },
    { icon: '💊', keywords: ['salud', 'farmacia', 'medic'] },
    { icon: '📚', keywords: ['educacion', 'colegio', 'universidad','formación'] },
    { icon: '💼', keywords: ['nomina', 'salario'] },
    { icon: '🐾', keywords: ['mascota','perros','gatos'] },
    { icon: '💇', keywords: ['cuidado', 'peluqueria', 'estetica'] },
    { icon: '🏛️', keywords: ['banco', 'pension', 'comision'] },
    { icon: '📈', keywords: ['inversion', 'dividendo'] },
    { icon: '🎁', keywords: ['regalo'] },
    { icon: '↩️', keywords: ['reembolso', 'devolucion'] },
    { icon: '🛡️', keywords: ['seguro'] },
    { icon: '💻', keywords: ['tecnologia', 'suscripcion', 'software'] },
    { icon: '📋', keywords: ['vario'] }
];

const CategoryService = {
    DEFAULT_INCOME_CATEGORIES,
    DEFAULT_EXPENSE_CATEGORIES,
    FALLBACK_ICON,

    _normalize(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    },

    slugify(text) {
        return this._normalize(text)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'otros';
    },

    /** Icono más apropiado para un nombre de categoría nuevo, según ICON_KEYWORDS — o el genérico si no hay coincidencia */
    _iconFor(label) {
        const norm = this._normalize(label);
        const match = ICON_KEYWORDS.find(entry => entry.keywords.some(kw => norm.includes(kw)));
        return match ? match.icon : FALLBACK_ICON;
    },

    defaultsFor(type) {
        return type === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
    },

    /**
     * Lista de categorías disponibles para un tipo, lista para pintar un
     * <select> — con las predefinidas vacías, esto son exactamente las
     * que ya se han creado (importadas, o "Otros ingresos/gastos" si ya
     * hizo falta alguna vez). `customCategories` es una CategoryCollection
     * (o cualquier objeto con `.filter` sobre modelos con .get()).
     */
    allFor(type, customCategories) {
        const defaults = this.defaultsFor(type);
        const seen = new Set(defaults.map(c => c.id));
        const custom = (customCategories ? customCategories.filter(c => c.get('type') === type) : [])
            .map(c => ({ id: c.get('id') || c.id, label: c.get('label'), icon: c.get('icon') || FALLBACK_ICON }))
            .filter(c => !seen.has(c.id));
        return [...defaults, ...custom];
    },

    /** Busca una categoría por su id, para icono/label al pintar un movimiento */
    findById(type, id, customCategories) {
        return this.allFor(type, customCategories).find(c => c.id === id) || null;
    },

    /**
     * Dado un texto libre (p.ej. "Alimentación" de un extracto bancario),
     * busca una categoría ya creada cuyo label normalizado coincida, y
     * devuelve su id. Si no hay ninguna, la CREA (se añade a
     * `customCategories`; la persistencia la dispara quien llame a esto)
     * con el icono más apropiado según ICON_KEYWORDS, y devuelve su id
     * recién creado.
     *
     * Si `rawLabel` viene vacío (el fichero no trae categoría/
     * subcategoría), se usa "Otros ingresos"/"Otros gastos" como
     * cualquier otra categoría — se crea la primera vez que hace falta,
     * igual que cualquier categoría importada, sin ningún caso especial.
     * @param CategoryModel constructor del modelo Category (para no acoplar este servicio a Backbone directamente)
     * @returns {string} id de categoría a usar
     */
    resolveOrCreate(type, rawLabel, customCategories, CategoryModel) {
        const label = String(rawLabel || '').trim() || (type === 'income' ? 'Otros ingresos' : 'Otros gastos');
        const normLabel = this._normalize(label);

        const existingCustom = customCategories.find(c => c.get('type') === type && this._normalize(c.get('label')) === normLabel);
        if (existingCustom) return existingCustom.get('id') || existingCustom.id;

        const baseId = this.slugify(label);
        const idTaken = customCategories.some(c => (c.get('id') || c.id) === baseId);
        const finalId = idTaken ? `${baseId}-${Date.now().toString(36).slice(-4)}` : baseId;

        const model = new CategoryModel({ id: finalId, label, icon: this._iconFor(label), type });
        customCategories.add(model);
        return finalId;
    },

    /**
     * Agrega el importe total de GASTO por categoría, para un conjunto de
     * transacciones ya filtradas (respeta cualquier combinación de
     * filtros activos — no sabe nada de filtros, solo agrega lo que le
     * pasen). Devuelve un array ordenado de mayor a menor importe, listo
     * para pintar como gráfica de barras horizontales.
     */
    groupExpensesByCategory(transactions, customCategories) {
        const totals = {}; // categoryId -> importe acumulado
        AccountingService.effectiveTransactions(transactions, transactions).forEach(t => {
            if (t.get('type') !== 'expense') return;
            const catId = t.get('category') || '';
            totals[catId] = (totals[catId] || 0) + t.get('amount');
        });
        return Object.entries(totals)
            .filter(([, amount]) => amount > 0.005)
            .map(([catId, amount]) => {
                const cat = this.findById('expense', catId, customCategories);
                return { id: catId, label: cat ? cat.label : 'Sin categoría', icon: cat ? cat.icon : '❓', amount };
            })
            .sort((a, b) => b.amount - a.amount);
    }
};

export default CategoryService;
