import AccountingService from './AccountingService.js';

/**
 * SavingsService — agrega income/expense por titular deduplicado y por mes.
 * SRP: extrae toda la lógica de agregación que antes vivía embebida en
 * _renderSavingsPanel(). La vista solo pinta el resultado ya calculado.
 */
const SavingsService = {

    /** Titulares deduplicados por nombre, con sus entradas {accountId, holderId, initBal} */
    dedupedHolders(accounts) {
        const byName = {};
        accounts.each(acc => {
            acc.holders.each(h => {
                const key = h.get('name').trim().toLowerCase();
                if (!byName[key]) byName[key] = { name: h.get('name'), ids: [] };
                byName[key].ids.push({ accountId: acc.id, holderId: h.id, initBal: h.get('initialBalance') || 0 });
            });
        });
        return Object.values(byName);
    },

    /**
     * Construye la matriz año→mes→titular con delta y acumulado.
     * Devuelve una estructura de datos pura, sin HTML.
     */
    buildMatrix(accounts, transactions) {
        const holders = this.dedupedHolders(accounts);
        if (!holders.length) return null;

        // La colección completa es la referencia necesaria para resolver
        // devoluciones vinculadas, incluidas las de otro mes y los vínculos
        // antiguos que apuntaban a un id temporal de importación.
        const sourceTransactions = transactions.filter(t =>
            t.get('type') === 'income' ||
            t.get('type') === 'expense' ||
            t.get('type') === 'return' ||
            t.get('type') === 'excluded-expense'
        );
        if (!sourceTransactions.length) return null;

        // AccountingService es la única fuente de verdad contable: elimina
        // devoluciones, sus gastos totalmente compensados y los gastos
        // marcados como no contabilizables antes de agregar por titular.
        const relevant = AccountingService.effectiveTransactions(
            sourceTransactions,
            transactions
        );

        // Conservamos los años de la colección original para que un año que
        // solo contenga pares compensados siga apareciendo con importe cero.
        const years = [...new Set(
            sourceTransactions.map(t => +t.get('date').substr(0, 4))
        )].sort();

        const cumInit = {};
        holders.forEach(h => { cumInit[h.name] = h.ids.reduce((s, e) => s + e.initBal, 0); });
        const cum = { ...cumInit };

        const rows = years.map(year => {
            const months = [];
            const yearNet = {};
            holders.forEach(h => { yearNet[h.name] = 0; });

            for (let mi = 0; mi < 12; mi++) {
                const key = `${year}-${String(mi + 1).padStart(2, '0')}`;
                const monthTxns = relevant.filter(t => t.get('date').startsWith(key));

                const cells = holders.map(h => {
                    let net = 0;
                    h.ids.forEach(e => {
                        const ht = monthTxns.filter(t => t.get('holderId') === e.holderId);
                        const inc = ht.filter(t => t.get('type') === 'income').reduce((s, t) => s + t.get('amount'), 0);
                        const exp = ht.filter(t => t.get('type') === 'expense').reduce((s, t) => s + t.get('amount'), 0);
                        net += inc - exp;
                    });
                    cum[h.name] += net;
                    yearNet[h.name] += net;
                    const blank = Math.abs(net) < 0.005 && Math.abs(cum[h.name] - cumInit[h.name]) < 0.005;
                    return { holderName: h.name, net, cumulative: cum[h.name], blank };
                });

                months.push({ monthIndex: mi, cells, allBlank: cells.every(c => c.blank) });
            }

            const totals = holders.map(h => ({
                holderName: h.name,
                net: yearNet[h.name],
                cumulative: cum[h.name]
            }));

            return { year, months, totals };
        });

        return { holders, rows };
    }
};

export default SavingsService;
