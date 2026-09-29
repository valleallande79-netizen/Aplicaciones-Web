/**
 * IncompleteTransactionService — localiza movimientos sin datos de origen.
 * SRP: solo define cuando un movimiento necesita revision inicial.
 */
const IncompleteTransactionService = {
    needsReview(transaction) {
        return !transaction.get('accountId') || !transaction.get('holderId');
    },

    find(transactions) {
        return transactions.filter(transaction => this.needsReview(transaction));
    }
};

export default IncompleteTransactionService;
