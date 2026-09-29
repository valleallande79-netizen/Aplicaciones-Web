import TxnItemView from './TxnItemView.js';
import FormatService from '../../services/FormatService.js';
import AccountingService from '../../services/AccountingService.js';
import MovementDisplayService from '../../services/MovementDisplayService.js';

const MONTH_NAMES = FormatService.monthNames();

/**
 * TxnListView — lista de movimientos agrupados por año y, dentro de cada
 * año, por mes — ambos niveles colapsables de forma independiente.
 * Composición: delega el renderizado de cada fila a TxnItemView (SRP)
 * y re-emite sus eventos hacia arriba (edit/delete) sin conocer su
 * implementación.
 *
 * Dos mapas de colapso, ambos referencias compartidas con AppView (igual
 * razón que ya motivó lo mismo para los años: esta vista se recrea en
 * cada render() de AppView, así que el estado tiene que vivir fuera de
 * ella para sobrevivir entre renders — si no, cada guardado/filtro
 * volvería a expandir todo).
 *  - collapsed:       por año, clave = año ("2026")
 *  - collapsedMonths: por año+mes, clave = "año-mes" ("2026-7") — el mes
 *    solo con el año evitaría colisión entre julio de años distintos.
 */
const TxnListView = Backbone.View.extend({
    className: 'txn-list-container',

    events: {
        'click .yg-header': 'onToggleYear',
        'click .mg-header': 'onToggleMonth',
        'click .btn-yr[data-action="expand"]':  'onExpandAll',
        'click .btn-yr[data-action="collapse"]': 'onCollapseAll'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.transactions = options.transactions;
        this.referenceTransactions = options.referenceTransactions || options.transactions;
        this.collapsed = options.collapsed || {};
        this.collapsedMonths = options.collapsedMonths || {};
        this.childViews = [];
    },

    /** @param transactions array plano de modelos Transaction ya filtrados */
    setTransactions(transactions) {
        this.transactions = transactions;
        return this;
    },

    render() {
        this._cleanupChildren();

        const analyticalTransactions = this.transactions || [];
        const displayTransactions = MovementDisplayService.toDisplayTransactions(
            analyticalTransactions,
            this.referenceTransactions
        );

        if (!displayTransactions.length) {
            this.$el.html(`<div class="empty"><h3>Sin resultados</h3><p>Prueba a cambiar o limpiar los filtros.</p></div>`);
            return this;
        }

        // Agrupar por año y, dentro de cada año, por mes.
        const yearGroups = {};
        const currentYear = new Date().getFullYear();
        displayTransactions.forEach(t => {
            const d = new Date(t.get('date'));
            const y = d.getFullYear(), m = d.getMonth();
            yearGroups[y] = yearGroups[y] || {};
            (yearGroups[y][m] = yearGroups[y][m] || []).push(t);
        });
        const years = Object.keys(yearGroups).sort((a, b) => b - a);

        let html = '';
        if (years.length > 1) {
            html += `<div class="year-controls">
                <button class="btn-yr" data-action="expand">Expandir todo</button>
                <button class="btn-yr" data-action="collapse">Colapsar todo</button>
            </div>`;
        }

        years.forEach(yr => {
            const monthsInYear = yearGroups[yr];
            const monthKeys = Object.keys(monthsInYear).sort((a, b) => b - a);
            const yt = monthKeys.flatMap(m => monthsInYear[m]);

            const yCollapsed = !!this.collapsed[yr];
            const yearAnalytical = analyticalTransactions.filter(transaction =>
                new Date(transaction.get('date')).getFullYear() === Number(yr)
            );
            const { income: yInc, expense: yExp, savings: net } = AccountingService.summary(yearAnalytical, this.referenceTransactions);
            const curBadge = parseInt(yr) === currentYear ? `<span class="yg-badge yb-current">Año actual</span>` : '';

            html += `<div class="year-group" data-yr="${yr}">
                <div class="yg-header${yCollapsed ? ' collapsed' : ''}">
                    <div class="yg-left">
                        <span class="yg-chevron">${yCollapsed ? '▶' : '▼'}</span>
                        <span class="yg-year">${yr}${curBadge}</span>
                        <span class="yg-count">${yt.length} mov.</span>
                    </div>
                    <div class="yg-right">
                        ${yInc > 0 ? `<span class="yg-badge yb-income">+${FormatService.currency(yInc)}</span>` : ''}
                        ${yExp > 0 ? `<span class="yg-badge yb-expense">−${FormatService.currency(yExp)}</span>` : ''}
                        <span class="yg-badge yb-net ${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${FormatService.currency(net)}</span>
                    </div>
                </div>
                <div class="yg-items${yCollapsed ? ' hidden' : ''}" data-yr-items="${yr}">`;

            monthKeys.forEach(mi => {
                const mt = monthsInYear[mi];
                const monthKey = `${yr}-${mi}`;
                const mCollapsed = !!this.collapsedMonths[monthKey];
                const monthAnalytical = analyticalTransactions.filter(transaction => {
                    const date = new Date(transaction.get('date'));
                    return date.getFullYear() === Number(yr) && date.getMonth() === Number(mi);
                });
                const { savings: mNet } = AccountingService.summary(monthAnalytical, this.referenceTransactions);

                html += `<div class="month-group" data-month-key="${monthKey}">
                    <div class="mg-header${mCollapsed ? ' collapsed' : ''}">
                        <div class="mg-left">
                            <span class="mg-chevron">${mCollapsed ? '▶' : '▼'}</span>
                            <span class="mg-name">${MONTH_NAMES[mi]}</span>
                            <span class="mg-count">${mt.length} mov.</span>
                        </div>
                        <div class="mg-right">
                            <span class="mg-net ${mNet >= 0 ? 'pos' : 'neg'}">${mNet >= 0 ? '+' : ''}${FormatService.currency(mNet)}</span>
                        </div>
                    </div>
                    <div class="mg-items${mCollapsed ? ' hidden' : ''}" data-month-items="${monthKey}"></div>
                </div>`;
            });

            html += `</div></div>`;
        });

        this.$el.html(html);

        // montar sub-vistas por fila dentro de cada grupo de mes
        years.forEach(yr => {
            const monthsInYear = yearGroups[yr];
            Object.keys(monthsInYear).forEach(mi => {
                const monthKey = `${yr}-${mi}`;
                const $container = this.$(`.mg-items[data-month-items="${monthKey}"]`);
                monthsInYear[mi].forEach(txnModel => {
                    const itemView = new TxnItemView({
                        model: txnModel,
                        accounts: this.accounts,
                        categories: this.categories,
                        referenceTransactions: this.referenceTransactions
                    });
                    itemView.on('txn:edit',   m => this.trigger('txn:edit', m));
                    itemView.on('txn:delete', m => this.trigger('txn:delete', m));
                    itemView.on('txn:split', m => this.trigger('txn:split', m));
                    itemView.render();
                    $container.append(itemView.el);
                    this.childViews.push(itemView);
                });
            });
        });

        return this;
    },

    onToggleYear(e) {
        const yr = $(e.currentTarget).closest('.year-group').data('yr');
        if (this.collapsed[yr]) delete this.collapsed[yr]; else this.collapsed[yr] = true;
        this.render();
    },

    onToggleMonth(e) {
        const key = $(e.currentTarget).closest('.month-group').data('month-key');
        if (this.collapsedMonths[key]) delete this.collapsedMonths[key]; else this.collapsedMonths[key] = true;
        this.render();
    },

    onExpandAll()   { Object.keys(this.collapsed).forEach(y => delete this.collapsed[y]); this.render(); },
    onCollapseAll() {
        Object.keys(this._groupYears()).forEach(y => { this.collapsed[y] = true; });
        this.render();
    },

    _groupYears() {
        const g = {};
        (this.transactions || []).forEach(t => { g[new Date(t.get('date')).getFullYear()] = 1; });
        return g;
    },

    _cleanupChildren() {
        this.childViews.forEach(v => v.remove());
        this.childViews = [];
    },

    remove() {
        this._cleanupChildren();
        return Backbone.View.prototype.remove.call(this);
    }
});

export default TxnListView;
