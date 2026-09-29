/**
 * SplitExpenseService - reglas de dominio para descomponer un gasto.
 * El padre conserva el apunte bancario. Los hijos son imputaciones
 * analiticas y nunca cambian de cuenta ni afectan al saldo bancario.
 */
const SplitExpenseService = {
    childrenOf(parentOrId, transactions) {
        const parentId = typeof parentOrId === 'string' ? parentOrId : parentOrId.id;
        const models = transactions.models || transactions || [];
        return models.filter(t => t.get('parentTransactionId') === parentId);
    },

    parentOf(child, transactions) {
        const parentId = child && child.get('parentTransactionId');
        return parentId ? transactions.get(parentId) : null;
    },

    isChild(transaction) {
        return !!transaction.get('parentTransactionId');
    },

    isSplitParent(transaction, transactions) {
        return this.childrenOf(transaction, transactions).length > 0;
    },


    /**
     * Fecha y cuenta son propiedades bancarias del padre. Los hijos solo
     * pueden variar importe, categoria, titular y descripcion analitica.
     * Devuelve el numero de hijos que necesitaban reparacion.
     */
    syncInheritedFields(parent, transactions, options = {}) {
        const inherited = {
            date: parent.get('date'),
            accountId: parent.get('accountId'),
            type: 'expense'
        };
        let changed = 0;
        this.childrenOf(parent, transactions).forEach(child => {
            const differs = Object.entries(inherited)
                .some(([key, value]) => child.get(key) !== value);
            if (!differs) return;
            child.set(inherited, { silent: !!options.silent });
            changed += 1;
        });
        return changed;
    },


    categoryState(parent, transactions) {
        const children = this.childrenOf(parent, transactions);
        const categories = new Set(children.map(child => child.get('category') || ''));
        return {
            children,
            categories,
            uniform: categories.size <= 1,
            current: categories.size === 1 ? [...categories][0] : null
        };
    },

    syncCategory(parent, transactions, category, options = {}) {
        let changed = 0;
        this.childrenOf(parent, transactions).forEach(child => {
            if (child.get('category') === category) return;
            child.set('category', category, { silent: !!options.silent });
            changed += 1;
        });
        return changed;
    },

    /** Repara repartos antiguos desincronizados al cargar la aplicacion. */
    normalizeInheritedFields(transactions, options = {}) {
        const models = transactions.models || transactions || [];
        const parentIds = new Set(models
            .filter(transaction => transaction.get('parentTransactionId'))
            .map(transaction => transaction.get('parentTransactionId')));
        let changed = 0;
        parentIds.forEach(parentId => {
            const parent = transactions.get
                ? transactions.get(parentId)
                : models.find(transaction => transaction.id === parentId);
            if (parent) changed += this.syncInheritedFields(parent, transactions, options);
        });
        return changed;
    },

    cents(value) {
        return Math.round(Number(value || 0) * 100);
    },

    allocationTotal(children) {
        return children.reduce((sum, child) => sum + this.cents(
            child.get ? child.get('amount') : child.amount
        ), 0);
    },

    validate(parent, allocations) {
        if (!parent || parent.get('type') !== 'expense' || this.isChild(parent)) {
            return 'Solo se pueden descomponer gastos principales.';
        }
        if (!Array.isArray(allocations) || allocations.length < 2) {
            return 'La descomposición debe contener al menos dos subgastos.';
        }
        const invalid = allocations.some(item =>
            this.cents(item.amount) <= 0 || !item.category || !item.holderId
        );
        if (invalid) return 'Cada subgasto debe tener importe, categoría y titular.';
        const parentCents = this.cents(parent.get('amount'));
        const allocatedCents = this.allocationTotal(allocations);
        if (parentCents !== allocatedCents) {
            return `Los subgastos deben sumar exactamente ${(parentCents / 100).toFixed(2)} €.`;
        }
        return null;
    },

    buildChildAttrs(parent, allocation, existingId = null) {
        return {
            id: existingId || undefined,
            type: 'expense',
            amount: this.cents(allocation.amount) / 100,
            date: parent.get('date'),
            accountId: parent.get('accountId'),
            holderId: allocation.holderId,
            category: allocation.category,
            description: allocation.description || parent.get('description') || '',
            parentTransactionId: parent.id,
            isAnalyticalSplit: true,
            toAccountId: null,
            toHolderId: null,
            originalTransactionId: null,
            returnDetection: null
        };
    }
};

export default SplitExpenseService;
