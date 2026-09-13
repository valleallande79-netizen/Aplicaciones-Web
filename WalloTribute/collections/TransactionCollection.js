import Transaction from '../models/Transaction.js';

/**
 * TransactionCollection — colección de movimientos.
 * Expone métodos de consulta puros (sin efectos de vista) que
 * FilterService y BalanceService reutilizan. Esto evita duplicar
 * bucles de filtrado en cada vista (DRY / SRP).
 */
const TransactionCollection = Backbone.Collection.extend({
    model: Transaction,
    url: '/api/WalloTribute/transactions',

    comparator(t) { return -new Date(t.get('date')).getTime(); }, // más reciente primero

    persist() {
        return $.ajax({
            url: this.url,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(this.toJSON())
        });
    },

    byAccount(accountId) {
        return this.filter(t => t.involvesAccount(accountId));
    },

    byHolders(holderIds) {
        const ids = Array.isArray(holderIds) ? holderIds : [holderIds];
        return this.filter(t => ids.some(id => t.involvesHolder(id)));
    },

    byYear(year) {
        return this.filter(t => new Date(t.get('date')).getFullYear() == year);
    },

    availableYears(baseList) {
        const list = baseList || this.models;
        const years = new Set(list.map(t => new Date(t.get('date')).getFullYear()));
        return [...years].sort((a, b) => b - a);
    }
});

export default TransactionCollection;
