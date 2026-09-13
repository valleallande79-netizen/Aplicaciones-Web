import Account from '../models/Account.js';

/**
 * AccountCollection — colección de cuentas.
 * url apunta al endpoint REST existente; Backbone.sync se encarga
 * de GET/POST automáticamente en fetch()/save().
 */
const AccountCollection = Backbone.Collection.extend({
    model: Account,
    url: '/api/WalloTribute/accounts',

    // Igual que el original: si no hay cuentas, crea una por defecto
    ensureDefault() {
        if (this.length === 0) {
            const acc = new Account({ name: 'Cuenta Principal', bank: 'Mi Banco', color: '#3b82f6', initialBalance: 0 });
            this.add(acc);
            this.persist();
        }
    },

    // Persistencia manual (el backend espera un array plano en POST, no REST individual)
    persist() {
        return $.ajax({
            url: this.url,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(this.toJSON())
        });
    },

    findHolderById(holderId) {
        for (const acc of this.models) {
            const h = acc.holders.get(holderId);
            if (h) return { account: acc, holder: h };
        }
        return null;
    },

    // Agrupa titulares por nombre normalizado (para vista "Todas")
    groupHoldersByName() {
        const groups = {};
        this.each(acc => {
            acc.holders.each(h => {
                const key = h.get('name').trim().toLowerCase();
                if (!groups[key]) groups[key] = { name: h.get('name'), entries: [] };
                groups[key].entries.push({ accountId: acc.id, holderId: h.id });
            });
        });
        return Object.values(groups);
    }
});

export default AccountCollection;
