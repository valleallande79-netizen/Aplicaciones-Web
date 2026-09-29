/**
 * AccountingService — criterio analitico comun.
 * Excluye devoluciones, gastos compensados y gastos no contabilizados.
 * Mantiene ambos movimientos en el saldo bancario y en el historial.
 */
const STOP_WORDS = new Set([
    'pago', 'compra', 'tarjeta', 'cargo', 'abono', 'devolucion',
    'reembolso', 'reintegro', 'operacion', 'movimiento', 'recibo',
    'eur', 'euros', 'en', 'de', 'del', 'la', 'el', 'los', 'las',
    'es', 'sl', 'sa', 'com', 'tj'
]);

const AccountingService = {
    normalizeWords(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
    },

    descriptionsMatch(left, right) {
        const leftWords = new Set(this.normalizeWords(left));
        const rightWords = new Set(this.normalizeWords(right));
        return leftWords.size > 0 && rightWords.size > 0 &&
            [...leftWords].some(word => rightWords.has(word));
    },

    compensationMap(referenceTransactions) {
        const models = referenceTransactions.models || referenceTransactions || [];
        const expenses = models.filter(transaction => transaction.get('type') === 'expense');
        const compensations = new Map();

        models
            .filter(transaction => transaction.get('type') === 'return')
            .forEach(refund => {
                const linkedId = refund.get('originalTransactionId');
                const linkedExpense = linkedId && expenses.find(expense => expense.id === linkedId);

                if (linkedExpense) {
                    compensations.set(linkedExpense.id, refund);
                    return;
                }

                const refundDate = new Date(`${refund.get('date')}T12:00:00`);
                const candidates = expenses.filter(expense =>
                    expense.get('accountId') === refund.get('accountId') &&
                    expense.get('holderId') === refund.get('holderId') &&
                    Math.round(Number(expense.get('amount')) * 100) ===
                        Math.round(Number(refund.get('amount')) * 100) &&
                    new Date(`${expense.get('date')}T12:00:00`) <= refundDate &&
                    this.descriptionsMatch(
                        expense.get('description'),
                        refund.get('description')
                    )
                );

                // No asociar visualmente una devolucion si hay ambiguedad.
                if (candidates.length === 1) {
                    compensations.set(candidates[0].id, refund);
                }
            });

        return compensations;
    },

    compensatedExpenseIds(referenceTransactions) {
        return new Set(this.compensationMap(referenceTransactions).keys());
    },

    effectiveTransactions(transactions, referenceTransactions = transactions) {
        const models = transactions.models || transactions || [];
        const compensatedIds = this.compensatedExpenseIds(referenceTransactions);
        const referenceModels = referenceTransactions.models || referenceTransactions || [];
        const splitParentIds = new Set(referenceModels
            .filter(transaction => transaction.get('parentTransactionId'))
            .map(transaction => transaction.get('parentTransactionId')));

        return models.filter(transaction =>
            transaction.get('type') !== 'return' &&
            transaction.get('type') !== 'excluded-expense' &&
            !splitParentIds.has(transaction.id) &&
            !(
                transaction.get('type') === 'expense' &&
                compensatedIds.has(transaction.id)
            )
        );
    },

    summary(transactions, referenceTransactions = transactions) {
        const effective = this.effectiveTransactions(transactions, referenceTransactions);
        const income = effective
            .filter(transaction => transaction.get('type') === 'income')
            .reduce((sum, transaction) => sum + transaction.get('amount'), 0);
        const expense = effective
            .filter(transaction => transaction.get('type') === 'expense')
            .reduce((sum, transaction) => sum + transaction.get('amount'), 0);

        return { income, expense, savings: income - expense };
    }
};

export default AccountingService;
