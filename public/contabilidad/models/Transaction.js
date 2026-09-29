/**
 * Transaction — Movimiento contable (income, expense, transfer, holder-transfer).
 * SRP: solo valida su propia forma; no conoce cuentas ni saldos.
 * OCP: nuevas reglas de validación por tipo se añaden en TYPE_VALIDATORS
 * sin tener que modificar el cuerpo de validate().
 */
const TYPE_VALIDATORS = {
    'income':  attrs => !attrs.category ? 'La categoría es obligatoria' : null,
    'expense': attrs => !attrs.category ? 'La categoría es obligatoria' : null,
    'transfer': attrs => {
        if (!attrs.toAccountId) return 'Selecciona una cuenta destino';
        if (attrs.toAccountId === attrs.accountId) return 'Las cuentas deben ser distintas';
        return null;
    },
    'holder-transfer': attrs => {
        if (!attrs.holderId || !attrs.toHolderId) return 'Selecciona titulares origen y destino';
        if (attrs.holderId === attrs.toHolderId) return 'Los titulares deben ser distintos';
        return null;
    }
};

const Transaction = Backbone.Model.extend({
    defaults: {
        type: 'income',
        amount: 0,
        date: null,
        accountId: null,
        toAccountId: null,
        category: '',
        holderId: null,
        toHolderId: null,
        description: ''
    },

    initialize() {
        if (!this.id && !this.get('id')) {
            this.set('id', `txn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`);
        }
        if (!this.get('createdAt')) {
            this.set('createdAt', new Date().toISOString());
        }
    },

    validate(attrs) {
        const errors = [];
        if (!attrs.amount || attrs.amount <= 0) errors.push({ field: 'amount', message: 'El importe debe ser mayor que 0' });
        if (!attrs.date) errors.push({ field: 'date', message: 'Selecciona una fecha' });
        if (!attrs.accountId) errors.push({ field: 'accountId', message: 'Selecciona una cuenta' });

        const typeCheck = TYPE_VALIDATORS[attrs.type];
        if (typeCheck) {
            const msg = typeCheck(attrs);
            if (msg) errors.push({ field: 'type', message: msg });
        }
        return errors.length ? errors : undefined;
    },

    isIncome()  { return this.get('type') === 'income'; },
    isExpense() { return this.get('type') === 'expense'; },
    isTransfer() { return this.get('type') === 'transfer'; },
    isHolderTransfer() { return this.get('type') === 'holder-transfer'; },

    involvesAccount(accId) {
        return this.get('accountId') === accId || this.get('toAccountId') === accId;
    },

    involvesHolder(holderId) {
        return this.get('holderId') === holderId || this.get('toHolderId') === holderId;
    }
});

export default Transaction;
