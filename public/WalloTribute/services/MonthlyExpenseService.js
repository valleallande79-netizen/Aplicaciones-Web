import AccountingService from './AccountingService.js';

/**
 * MonthlyExpenseService - agrega gasto efectivo en una ventana de 12 meses.
 * La ventana empieza once meses antes y termina en el mes actual.
 */
const MonthlyExpenseService = {
    build(transactions, referenceTransactions = transactions, referenceDate = new Date()) {
        const effective = AccountingService.effectiveTransactions(
            transactions,
            referenceTransactions
        );

        return Array.from({ length: 12 }, (_, offset) => {
            const date = new Date(
                referenceDate.getFullYear(),
                referenceDate.getMonth() - 11 + offset,
                1
            );
            const year = date.getFullYear();
            const month = date.getMonth();
            const amount = effective
                .filter(transaction => {
                    if (transaction.get('type') !== 'expense') return false;
                    const transactionDate = new Date(`${transaction.get('date')}T12:00:00`);
                    return transactionDate.getFullYear() === year &&
                        transactionDate.getMonth() === month;
                })
                .reduce((sum, transaction) => sum + Number(transaction.get('amount') || 0), 0);

            return {
                year,
                month,
                amount,
                label: new Intl.DateTimeFormat('es-ES', {
                    month: 'short',
                    year: 'numeric'
                }).format(date).replace('.', '')
            };
        });
    }
};

export default MonthlyExpenseService;
