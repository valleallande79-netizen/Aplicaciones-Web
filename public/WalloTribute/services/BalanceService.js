import AccountingService from './AccountingService.js';

/**
 * BalanceService — toda la lógica de cálculo de saldos vive aquí.
 * SRP: es el ÚNICO módulo que sabe cómo un movimiento afecta a un saldo.
 * Si mañana se añade un nuevo tipo de movimiento, solo se toca esto
 * (Open/Closed: las vistas y modelos no cambian).
 *
 * Recibe siempre (accounts, transactions) explícitos — sin estado propio —
 * lo que lo hace fácil de testear unitariamente.
 */
const BalanceService = {

    /** Saldo total de una cuenta (todos los titulares + histórico) */
    accountBalance(account, transactions) {
        let balance = (account.get('initialBalance') || 0)
            + account.holders.reduce((s, h) => s + (h.get('initialBalance') || 0), 0);

        transactions.each(t => {
            // Los hijos de un reparto son imputaciones analiticas, no cargos bancarios.
            if (t.get('parentTransactionId')) return;
            const amount = t.get('amount');
            if ((t.get('type') === 'income' || t.get('type') === 'return') && t.get('accountId') === account.id) balance += amount;
            if ((t.get('type') === 'expense' || t.get('type') === 'excluded-expense') && t.get('accountId') === account.id) balance -= amount;
            if (t.get('type') === 'transfer' && t.get('accountId') === account.id) balance -= amount;
            if (t.get('type') === 'transfer' && t.get('toAccountId') === account.id) balance += amount;
            // holder-transfer es interno a la cuenta: no afecta al total de cuenta
        });
        return balance;
    },

    /** Saldo de un titular concreto dentro de una cuenta */
    holderBalance(account, holder, transactions) {
        let balance = holder.get('initialBalance') || 0;

        const analyticalTransactions = AccountingService.effectiveTransactions(
            transactions,
            transactions
        );
        analyticalTransactions.forEach(t => {
            const amount = t.get('amount');
            const type = t.get('type');

            if (t.get('accountId') === account.id) {
                if ((type === 'income' || type === 'return') && t.get('holderId') === holder.id)   balance += amount;
                if ((type === 'expense' || type === 'excluded-expense') && t.get('holderId') === holder.id)   balance -= amount;
                if (type === 'holder-transfer' && t.get('holderId') === holder.id)   balance -= amount;
                if (type === 'holder-transfer' && t.get('toHolderId') === holder.id) balance += amount;
                // FIX: un 'transfer' (traspaso ENTRE cuentas) atribuido a este
                // titular como origen también debe restarle su saldo — antes
                // faltaba esta línea, así que accountBalance() (que sí la
                // aplicaba) dejaba de cuadrar con la suma de holderBalance()
                // de todos los titulares de la cuenta.
                if (type === 'transfer'        && t.get('holderId') === holder.id)   balance -= amount;
            }
            // FIX: si este titular es el destinatario de un 'transfer' que
            // ENTRA en su cuenta (t.toAccountId === account.id), hay que
            // sumárselo. Sin esta línea el titular destino nunca recibía
            // el importe del traspaso entrante.
            if (t.get('toAccountId') === account.id) {
                if (type === 'transfer' && t.get('toHolderId') === holder.id) balance += amount;
            }
        });
        return balance;
    },

    /** Suma de saldos de un titular agrupado (mismo nombre) en varias cuentas */
    groupedHolderBalance(entries, accounts, transactions) {
        return entries.reduce((sum, e) => {
            const account = accounts.get(e.accountId);
            const holder = account && account.holders.get(e.holderId);
            if (!account || !holder) return sum;
            return sum + this.holderBalance(account, holder, transactions);
        }, 0);
    },

    /** Balance total de todas las cuentas */
    totalBalance(accounts, transactions) {
        return accounts.reduce((sum, acc) => sum + this.accountBalance(acc, transactions), 0);
    },

    /** Ingresos/gastos/ahorro de un conjunto de transacciones ya filtradas por mes */
    monthlySummary(transactions, month, year) {
        const monthTxns = transactions.filter(t => {
            const d = new Date(t.get('date'));
            return d.getMonth() === month && d.getFullYear() === year;
        });
        const { income, expense, savings } = AccountingService.summary(monthTxns, transactions);
        return { income, returns: 0, expense, netExpense: expense, savings };
    }
};

export default BalanceService;
