import SplitExpenseService from './SplitExpenseService.js';
import FormatService from './FormatService.js';
import AccountingService from './AccountingService.js';

/** Reglas puras para repartir en lote los gastos de un titular agrupado. */
const BulkSplitExpenseService = {
    buildPreview(group, accounts, transactions, options = {}) {
        const models = transactions.models || transactions || [];
        const start = options.periodStart || '';
        const end = options.periodEnd || '';
        const entryByAccount = new Map(group.entries.map(entry => [entry.accountId, entry.holderId]));
        // Fuente única de verdad contable: incluye tanto devoluciones
        // enlazadas por originalTransactionId como compensaciones históricas
        // inferidas de forma no ambigua por cuenta, titular, importe, fecha
        // y descripción compatible.
        const compensationMap = AccountingService.compensationMap(transactions);
        const compensatedIds = new Set(compensationMap.keys());

        return models
            .filter(t => t.get('type') === 'expense' && !t.get('parentTransactionId'))
            .filter(t => entryByAccount.get(t.get('accountId')) === t.get('holderId'))
            .filter(t => !start || String(t.get('date')).slice(0, 7) >= start)
            .filter(t => !end || String(t.get('date')).slice(0, 7) <= end)
            .map(parent => {
                const account = accounts.get(parent.get('accountId'));
                const originId = entryByAccount.get(parent.get('accountId'));
                const destinations = account
                    ? account.holders.filter(holder => holder.id !== originId)
                    : [];
                let status = 'ready';
                let reason = '';
                if (SplitExpenseService.isSplitParent(parent, transactions)) {
                    status = 'skipped'; reason = 'Ya está descompuesto';
                } else if (compensatedIds.has(parent.id)) {
                    const refund = compensationMap.get(parent.id);
                    const isExplicit = refund && refund.get('originalTransactionId') === parent.id;
                    status = 'skipped';
                    reason = isExplicit
                        ? 'Tiene una devolución vinculada'
                        : 'Compensado por una devolución histórica';
                } else if (!destinations.length) {
                    status = 'skipped'; reason = 'La cuenta no tiene otros titulares';
                } else if (SplitExpenseService.cents(parent.get('amount')) < destinations.length) {
                    status = 'skipped'; reason = `Importe insuficiente para ${destinations.length} titulares`;
                }
                const allocations = status === 'ready'
                    ? this.equalAllocations(parent, destinations)
                    : [];
                return { parent, account, destinations, allocations, status, reason, selected: status === 'ready' };
            })
            .sort((left, right) => String(right.parent.get('date')).localeCompare(String(left.parent.get('date'))));
    },

    equalAllocations(parent, destinations) {
        const total = SplitExpenseService.cents(parent.get('amount'));
        const ordered = [...destinations].sort((a, b) =>
            String(a.get('name')).localeCompare(String(b.get('name')), 'es', { sensitivity: 'base' })
        );
        const base = Math.floor(total / ordered.length);
        let remainder = total % ordered.length;
        return ordered.map(holder => {
            const cents = base + (remainder-- > 0 ? 1 : 0);
            return {
                amount: cents / 100,
                category: parent.get('category'),
                holderId: holder.id,
                holderName: holder.get('name'),
                description: parent.get('description') || ''
            };
        });
    },

    execute(items, transactions, batchId = FormatService.generateId('splitbatch')) {
        const selected = items.filter(item => item.status === 'ready' && item.selected);
        const created = [];
        selected.forEach(item => {
            item.allocations.forEach(allocation => {
                const attrs = SplitExpenseService.buildChildAttrs(item.parent, allocation);
                attrs.splitBatchId = batchId;
                attrs.splitSource = 'bulk-holder';
                created.push(attrs);
            });
        });
        return { batchId, selected, created };
    }
};

export default BulkSplitExpenseService;
