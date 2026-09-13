/**
 * Holder — Titular de una cuenta.
 * SRP: solo conoce sus propios atributos y validación local.
 * No sabe nada de balances calculados ni de transacciones (eso es de BalanceService).
 */
const Holder = Backbone.Model.extend({
    defaults: {
        name: '',
        initialBalance: 0
    },

    validate(attrs) {
        const errors = [];
        if (!attrs.name || !attrs.name.trim()) {
            errors.push({ field: 'name', message: 'El nombre del titular es obligatorio' });
        }
        if (isNaN(parseFloat(attrs.initialBalance))) {
            errors.push({ field: 'initialBalance', message: 'Saldo inicial inválido' });
        }
        return errors.length ? errors : undefined;
    },

    // Genera id temporal en cliente (compatible con formato legacy nh_<ts>_<rand>)
    initialize() {
        if (!this.id && !this.get('id')) {
            this.set('id', `nh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
        }
    }
});

export default Holder;
