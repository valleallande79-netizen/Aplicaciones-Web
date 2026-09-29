/**
 * MovementDisplayService - proyeccion comun de registros analiticos a
 * movimientos bancarios visibles.
 */
const MovementDisplayService = {
    toDisplayTransactions(transactions, referenceTransactions = transactions) {
        const analyticalModels = transactions.models || transactions || [];
        const referenceModels = referenceTransactions.models || referenceTransactions || [];
        const referenceById = new Map(
            referenceModels.map(transaction => [transaction.id, transaction])
        );
        const displayById = new Map();

        analyticalModels.forEach(transaction => {
            const parentId = transaction.get('parentTransactionId');
            const displayTransaction = parentId
                ? referenceById.get(parentId)
                : transaction;
            if (displayTransaction) displayById.set(displayTransaction.id, displayTransaction);
        });

        return [...displayById.values()];
    }
};

export default MovementDisplayService;
