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

    initialize() {
        // Cola de escritura: impide que dos POST concurrentes terminen fuera
        // de orden y que una respuesta antigua sobrescriba repartos recientes.
        this._persistQueue = Promise.resolve();
        this._persistRevision = 0;
        this._persistedRevision = 0;
    },

    comparator(t) { return -new Date(t.get('date')).getTime(); }, // más reciente primero

    persist() {
        const revision = ++this._persistRevision;

        // El snapshot se toma cuando la escritura alcanza la cabecera de la
        // cola, no al solicitarla. Asi, una segunda accion siempre incluye
        // los cambios mas recientes realizados mientras se guardaba la primera.
        const write = async () => {
            const payload = JSON.stringify(this.toJSON());
            await $.ajax({
                url: this.url,
                method: 'POST',
                contentType: 'application/json',
                data: payload
            });
            this._persistedRevision = revision;
            this.trigger('persist:success', { revision, count: this.length });
            return { revision, count: this.length };
        };

        this._persistQueue = this._persistQueue
            .catch(() => undefined)
            .then(write)
            .catch(error => {
                this.trigger('persist:error', error);
                throw error;
            });
        return this._persistQueue;
    },

    hasPendingPersist() {
        return this._persistedRevision < this._persistRevision;
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
