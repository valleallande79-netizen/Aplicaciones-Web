import Category from '../models/Category.js';

/**
 * CategoryCollection — categorías personalizadas (además de las
 * predefinidas de CategoryService). Mismo patrón de persistencia manual
 * que AccountCollection/TransactionCollection: el backend espera un
 * array plano en POST, no REST individual por categoría.
 */
const CategoryCollection = Backbone.Collection.extend({
    model: Category,
    url: '/api/contabilidad/categories',

    persist() {
        return $.ajax({
            url: this.url,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(this.toJSON())
        });
    }
});

export default CategoryCollection;
