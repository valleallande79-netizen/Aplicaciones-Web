/**
 * Transaction — Movimiento contable (income, expense, transfer, holder-transfer).
 * SRP: solo valida su propia forma; no conoce cuentas ni saldos.
 * OCP: nuevas reglas de validación por tipo se añaden en TYPE_VALIDATORS
 * sin tener que modificar el cuerpo de validate().
 */
const TYPE_VALIDATORS = {
  'income': a => !a.category ? 'La categoría es obligatoria' : null,
  'expense': a => !a.category ? 'La categoría es obligatoria' : null,
  'excluded-expense': a => !a.category ? 'La categoría es obligatoria' : null,
  'return': a => !a.category || !a.holderId || !a.originalTransactionId ? 'La devolución debe estar vinculada a un gasto del mismo titular' : null,
  'transfer': a => !a.toAccountId ? 'Selecciona una cuenta destino' : a.toAccountId===a.accountId ? 'Las cuentas deben ser distintas' : null,
  'holder-transfer': a => !a.holderId || !a.toHolderId ? 'Selecciona titulares origen y destino' : a.holderId===a.toHolderId ? 'Los titulares deben ser distintos' : null
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
        description: '',
        originalTransactionId: null,
        returnDetection: null,
        parentTransactionId: null,
        isAnalyticalSplit: false
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
    isSplitChild() { return !!this.get('parentTransactionId'); },
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
