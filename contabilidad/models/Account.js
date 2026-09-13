import Holder from './Holder.js';

/**
 * HolderCollection — colección tipada de titulares de una cuenta.
 */
const HolderCollection = Backbone.Collection.extend({
    model: Holder
});

/**
 * Account — Cuenta bancaria.
 * SRP: gestiona su propia identidad, color, banco y su lista de titulares.
 * NO calcula saldos (eso vive en BalanceService, que opera sobre
 * Account + TransactionCollection). Esto evita que el modelo dependa
 * de las transacciones (inversión de dependencias / bajo acoplamiento).
 */
const Account = Backbone.Model.extend({
    defaults: {
        name: '',
        bank: '',
        color: '#3b82f6',
        initialBalance: 0
    },

    initialize(attrs) {
        if (!this.id && !this.get('id')) {
            this.set('id', `acc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
        }
        // holders como sub-colección real de Backbone, no array plano
        this.holders = new HolderCollection(attrs.holders || []);
        this.holders.on('add remove change', () => this.trigger('holders:change', this));
    },

    validate(attrs) {
        const errors = [];
        if (!attrs.name || !attrs.name.trim()) errors.push({ field: 'name', message: 'El nombre es obligatorio' });
        if (!attrs.bank || !attrs.bank.trim()) errors.push({ field: 'bank', message: 'La entidad bancaria es obligatoria' });
        return errors.length ? errors : undefined;
    },

    hasHolders() {
        return this.holders.length > 0;
    },

    // Serialización incluyendo holders (para persistencia vía ApiService)
    toJSON() {
        const json = Backbone.Model.prototype.toJSON.call(this);
        json.holders = this.holders.toJSON();
        return json;
    }
});

export default Account;
export { HolderCollection };
