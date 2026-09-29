/**
 * Category — categoría personalizada de ingreso/gasto, creada dinámicamente
 * (p.ej. al importar movimientos con una categoría del banco que no
 * existía todavía en la app). Las categorías PREDEFINIDAS no son modelos
 * — viven como datos estáticos en CategoryService; este modelo es solo
 * para las que el usuario (o una importación) añade sobre la marcha.
 */
const Category = Backbone.Model.extend({
    defaults: {
        label: '',
        icon: '🏷️',
        type: 'expense' // 'income' | 'expense'
    }
});

export default Category;
