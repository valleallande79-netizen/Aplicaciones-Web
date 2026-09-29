import AccountTabsView from './accounts/AccountTabsView.js';
import HolderStripView from './holders/HolderStripView.js';
import TxnListView from './transactions/TxnListView.js';
import FilterPanelView from './transactions/FilterPanelView.js';
import TxnModalView from './transactions/TxnModalView.js';
import SavingsPanelView from './savings/SavingsPanelView.js';
import ExpenseChartView from './stats/ExpenseChartView.js';
import MonthlyExpenseChartView from './stats/MonthlyExpenseChartView.js';
import FilterService from '../services/FilterService.js';
import Transaction from '../models/Transaction.js';
import ReturnDetectionService from '../services/ReturnDetectionService.js';
import AccountingService from '../services/AccountingService.js';
import SplitExpenseService from '../services/SplitExpenseService.js';
import MovementDisplayService from '../services/MovementDisplayService.js';


/**
 * AppView — orquestador raíz ("controlador" en el patrón MVC de Backbone).
 * Mantiene el ÚNICO estado de navegación (activeAcc/activeHolder/filters)
 * y lo pasa hacia abajo a subvistas de solo-lectura. Las subvistas
 * NUNCA mutan este estado directamente: emiten eventos, y AppView decide.
 * Esto es Dependency Inversion aplicado a nivel de vistas: las hijas
 * dependen de una interfaz de eventos, no de la implementación del padre.
 */
const AppView = Backbone.View.extend({
    el: '#app',

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.categories = options.categories;

        this.state = {
            activeAcc: 'all',
            activeHolder: null,
            filters: FilterService.currentPeriodFilters(),
            filterOpen: true,
            accountHolderFilterOpen: true,
            periodWindowEnd: FilterService.currentPeriodFilters().periodEnd,
            // FIX: el estado de años colapsados/expandidos vivía dentro de
            // TxnListView, pero AppView crea una instancia NUEVA de
            // TxnListView en cada render() (tras cualquier guardado, borrado
            // o cambio de filtro). Eso reseteaba el colapso a cada rato.
            // Ahora vive aquí, persiste entre renders, y se pasa por
            // referencia — TxnListView solo lo lee/muta, no es su dueño.
            collapsedYears: this._initialCollapsedYears(),
            collapsedMonths: this._initialCollapsedMonths() // mismo motivo, para el colapso de meses dentro de cada año
        };

        this.txnModal = new TxnModalView({ accounts: this.accounts, categories: this.categories, transactions: this.transactions });
        this._bindModalEvents();

        this.listenTo(this.accounts, 'add remove change', this.render);
        this.listenTo(this.transactions, 'add remove change', this.render);
    },

    _initialCollapsedYears() {
        return this.transactions.reduce((result, transaction) => {
            const date = new Date(transaction.get('date'));
            if (!Number.isNaN(date.getTime())) result[date.getFullYear()] = true;
            return result;
        }, {});
    },

    _initialCollapsedMonths() {
        return this.transactions.reduce((result, transaction) => {
            const date = new Date(transaction.get('date'));
            if (!Number.isNaN(date.getTime())) {
                result[`${date.getFullYear()}-${date.getMonth()}`] = true;
            }
            return result;
        }, {});
    },

    render() {
        this.$el.empty();

        this._renderAccountHolderFilters();

        const baseTransactions = this._baseTransactions();
        const filteredTransactions = this._sorted(
            FilterService.apply(baseTransactions, this.state.filters)
        );
        const effectiveBaseTransactions = AccountingService.effectiveTransactions(
            baseTransactions,
            this.transactions
        );
        const categoryChartTransactions = this._sorted(
            FilterService.apply(effectiveBaseTransactions, this.state.filters)
        );
        const monthlyChartTransactions = this._sorted(
            FilterService.applyForMonthlyExpenseChart(
                effectiveBaseTransactions,
                this.state.filters
            )
        );
        this._lastFiltered = filteredTransactions;
        this._lastCategoryChartFiltered = categoryChartTransactions;
        this._lastMonthlyChartFiltered = monthlyChartTransactions;

        const filteredDisplayTransactions = MovementDisplayService.toDisplayTransactions(
            filteredTransactions,
            this.transactions
        );
        const baseDisplayTransactions = MovementDisplayService.toDisplayTransactions(
            baseTransactions,
            this.transactions
        );

        this._renderGlobalFilters(baseDisplayTransactions, filteredDisplayTransactions);
        this._renderMovementHistory(filteredTransactions);
        this._renderExpenseCharts(categoryChartTransactions, monthlyChartTransactions);

        if (this.state.activeAcc === 'all') {
            this.savingsView = new SavingsPanelView({ accounts: this.accounts, transactions: this.transactions });
            this.$el.append(this.savingsView.render().el);
        }
        return this;
    },

    _renderAccountHolderFilters() {
        const open = this.state.accountHolderFilterOpen;
        const summary = this._accountHolderFilterSummary();
        const $panel = $(`<section class="account-holder-filter-panel${open ? ' open' : ''}">
            <div class="ahf-header" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}">
                <span class="ahf-title">
                    <span class="ahf-chevron">${open ? '▼' : '▶'}</span>
                    🏦 Filtros por cuenta y titular
                </span>
                <span class="ahf-summary">${summary}</span>
            </div>
            <div class="ahf-body${open ? '' : ' hidden'}"></div>
        </section>`);

        const toggle = event => {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event.type === 'keydown') event.preventDefault();
            this.state.accountHolderFilterOpen = !this.state.accountHolderFilterOpen;
            this.render();
        };
        $panel.find('.ahf-header').on('click keydown', toggle);

        this.tabsView = new AccountTabsView({
            accounts: this.accounts,
            transactions: this.transactions,
            activeAcc: this.state.activeAcc
        });
        this.tabsView.on('account:selected', id => this.setActiveAccount(id));
        this.tabsView.on('accounts:manage', () => this.trigger('accounts:manage'));
        this.tabsView.on('account:credentials', id =>
            this.trigger('credentials:open', this.accounts.get(id))
        );
        $panel.find('.ahf-body').append(this.tabsView.render().el);

        this.stripView = new HolderStripView({
            accounts: this.accounts,
            transactions: this.transactions,
            activeAcc: this.state.activeAcc,
            activeHolder: this.state.activeHolder
        });
        this.stripView.on('holder:selected', id => this.setActiveHolder(id));
        this.stripView.on('holder:bulk-split', group => this.trigger('holder:bulk-split', {
            group,
            period: {
                periodStart: this.state.filters.periodStart,
                periodEnd: this.state.filters.periodEnd
            }
        }));
        $panel.find('.ahf-body').append(this.stripView.render().el);
        this.$el.append($panel);
    },

    _accountHolderFilterSummary() {
        const account = this.state.activeAcc === 'all'
            ? null
            : this.accounts.get(this.state.activeAcc);
        const accountLabel = account ? account.get('name') : 'Todas las cuentas';
        if (!this.state.activeHolder) return `${accountLabel} · Todos los titulares`;

        const ids = Array.isArray(this.state.activeHolder)
            ? this.state.activeHolder
            : [this.state.activeHolder];
        let holderName = '';
        this.accounts.each(candidateAccount => {
            if (holderName) return;
            const holder = candidateAccount.holders.get(ids[0]);
            if (holder) holderName = holder.get('name');
        });
        return `${accountLabel} · ${holderName || 'Titular seleccionado'}`;
    },

    _sorted(transactions) {
        return [...transactions].sort((a, b) =>
            new Date(b.get('date')) - new Date(a.get('date'))
        );
    },

    _renderGlobalFilters(baseTransactions, filteredTransactions) {
        const $panel = $('<section class="global-filters-panel"></section>');
        this.filterView = new FilterPanelView({
            categories: this.categories,
            transactionCollection: this.transactions,
            filters: this.state.filters,
            resultCount: filteredTransactions.length,
            totalCount: baseTransactions.length,
            periodWindowEnd: this.state.periodWindowEnd
        });
        this.filterView.setOpen(this.state.filterOpen);
        this.filterView.on('filter:change', ({ key, value }) => this.onFilterChange(key, value));
        this.filterView.on('filter:period-change', range => this.onPeriodChange(range));
        this.filterView.on('filter:period-window-change', payload => this.onPeriodWindowChange(payload));
        this.filterView.on('filter:period-today', () => this.onPeriodToday());
        this.filterView.on('filter:clear', () => this.clearFilters());
        this.filterView.on('filter:toggle', () => this.toggleFilters());
        $panel.append(this.filterView.render().el);
        this.$el.append($panel);
    },

    _renderMovementHistory(filteredTransactions) {
        const $panel = $('<div class="main-panel"></div>');
        const $toolbar = $(`<div class="panel-toolbar">
            <span class="panel-title">Historial de movimientos</span>
            <button class="btn btn-outline btn-sm toolbar-bulk-btn">☑ Editar en bloque</button>
        </div>`);
        $toolbar.find('.toolbar-bulk-btn').on('click', () =>
            this.trigger('bulk-edit:open', filteredTransactions)
        );
        $panel.append($toolbar);

        this.listView = new TxnListView({
            accounts: this.accounts,
            categories: this.categories,
            referenceTransactions: this.transactions,
            collapsed: this.state.collapsedYears,
            collapsedMonths: this.state.collapsedMonths
        });
        this.listView.on('txn:edit', model => this.txnModal.open(model));
        this.listView.on('txn:delete', model => this.deleteTransaction(model));
        this.listView.on('txn:split', model => this.trigger('expense:split', model));
        this.listView.setTransactions(filteredTransactions);
        $panel.append(this.listView.render().el);
        this.$el.append($panel);
    },

    _renderExpenseCharts(categoryChartTransactions, monthlyChartTransactions) {
        this.expenseChartView = new ExpenseChartView({ categories: this.categories });
        this.expenseChartView.setTransactions(
            categoryChartTransactions,
            categoryChartTransactions
        );
        this.expenseChartView.on('category:inspect', ({ categoryId, categoryLabel }) => {
            const categoryTransactions = categoryChartTransactions.filter(transaction =>
                transaction.get('type') === 'expense' &&
                (transaction.get('category') || '') === categoryId
            );
            this.trigger('category-movements:open', {
                categoryLabel,
                transactions: categoryTransactions
            });
        });
        this.$el.append(this.expenseChartView.render().el);

        this.monthlyExpenseChartView = new MonthlyExpenseChartView({
            referenceTransactions: this.transactions
        });
        this.monthlyExpenseChartView.setTransactions(
            monthlyChartTransactions,
            this.transactions
        );
        this.$el.append(this.monthlyExpenseChartView.render().el);
    },

    _baseTransactions() {
        let list = this.state.activeAcc === 'all'
            ? this.transactions.models
            : this.transactions.byAccount(this.state.activeAcc);
        if (this.state.activeHolder) {
            const ids = Array.isArray(this.state.activeHolder) ? this.state.activeHolder : [this.state.activeHolder];
            list = list.filter(t => ids.some(id => t.involvesHolder(id)));
        }
        return list;
    },

    // ── Acciones de estado (equivalentes a los "actions" de un controlador) ──
    setActiveAccount(id) {
        this.state.activeAcc = id;
        this.state.activeHolder = null;
        this.render();
    },

    setActiveHolder(id) {
        this.state.activeHolder = id;
        this.render();
    },

    toggleFilters() {
        this.state.filterOpen = !this.state.filterOpen;
        this.render();
    },

    onPeriodWindowChange({ windowEnd, periodStart, periodEnd }) {
        this.state.periodWindowEnd = windowEnd;
        this.state.filters.periodStart = periodStart;
        this.state.filters.periodEnd = periodEnd;
        this.state.filterOpen = true;
        this.render();
    },

    onPeriodToday() {
        const current = FilterService.currentPeriodFilters();
        this.state.periodWindowEnd = current.periodEnd;
        this.state.filters.periodStart = current.periodStart;
        this.state.filters.periodEnd = current.periodEnd;
        this.state.filterOpen = true;
        this.render();
    },

    onPeriodChange({ periodStart, periodEnd }) {
        this.state.filters.periodStart = periodStart;
        this.state.filters.periodEnd = periodEnd;
        this.state.filterOpen = true;
        this.render();
    },

    onFilterChange(key, value) {
        this.state.filters[key] = value;
        if (key === 'type') this.state.filters.cat = '';
        this.state.filterOpen = true;
        this.render();
    },

    clearFilters() {
        // Limpiar restablece el estado inicial de los filtros adicionales:
        // sin tipo/categoría/texto y con el mes en curso seleccionado.
        const current = FilterService.currentPeriodFilters();
        this.state.filters = current;
        this.state.periodWindowEnd = current.periodEnd;
        this.render();
    },

    openNewTransaction() { this.txnModal.open(null); },

    deleteTransaction(model) {
        const familyIds = new Set([
            model.id,
            ...SplitExpenseService.childrenOf(model, this.transactions).map(child => child.id)
        ]);
        const hasLinkedReturn = this.transactions.some(transaction =>
            transaction.get('type') === 'return' && familyIds.has(transaction.get('originalTransactionId'))
        );
        if (hasLinkedReturn) {
            this.trigger('toast', 'No se puede eliminar: el gasto o uno de sus subgastos tiene una devolución vinculada', 'error');
            return;
        }
        if (!confirm('¿Eliminar este movimiento?')) return;
        SplitExpenseService.childrenOf(model, this.transactions)
            .forEach(child => this.transactions.remove(child));
        this.transactions.remove(model);
        this.transactions.persist();
        this.trigger('toast', 'Movimiento eliminado', 'success');
    },

    _bindModalEvents() {
        this.txnModal.on('txn:save', async (attrs, existingModel) => {
            let finalAttrs = attrs;
            if (!existingModel && attrs.type === 'income') {
                const match = ReturnDetectionService.findMatch(attrs, this.transactions);
                if (match) {
                    const original = match.transaction;
                    const accepted = confirm(`Posible devolución detectada del gasto "${original.get('description') || 'sin descripción'}" del ${original.get('date')} por ${original.get('amount').toFixed(2)} €. ¿Clasificarla como devolución?`);
                    if (accepted) finalAttrs = ReturnDetectionService.classify(attrs, match, 'manual');
                }
            }
            if (existingModel) {
                const isSplitParent = SplitExpenseService.isSplitParent(existingModel, this.transactions);
                let propagateCategory = false;
                if (isSplitParent) {
                    const changesStructure = finalAttrs.type !== 'expense' ||
                        finalAttrs.accountId !== existingModel.get('accountId') ||
                        SplitExpenseService.cents(finalAttrs.amount) !== SplitExpenseService.cents(existingModel.get('amount'));
                    if (changesStructure) {
                        this.trigger('toast', 'Antes de cambiar tipo, cuenta o importe debes eliminar la descomposición del gasto', 'error');
                        return;
                    }

                    const categoryChanged = finalAttrs.category !== existingModel.get('category');
                    if (categoryChanged) {
                        const categoryState = SplitExpenseService.categoryState(existingModel, this.transactions);
                        if (categoryState.uniform) {
                            propagateCategory = true;
                        } else {
                            const accepted = confirm(
                                'Este gasto tiene subgastos con categorías diferentes.\n\n' +
                                '¿Quieres aplicar la nueva categoría a todos los subgastos?\n\n' +
                                'Si cancelas, no se guardará el cambio para evitar que la categoría del padre sea distinta de la categoría analítica de sus hijos.'
                            );
                            if (!accepted) return;
                            propagateCategory = true;
                        }
                    }
                }

                existingModel.set(finalAttrs);
                if (isSplitParent) {
                    // Fecha y cuenta siempre viajan con el padre. Titular y
                    // descripción permanecen independientes en cada hijo.
                    SplitExpenseService.syncInheritedFields(existingModel, this.transactions);
                    if (propagateCategory) {
                        SplitExpenseService.syncCategory(
                            existingModel,
                            this.transactions,
                            finalAttrs.category
                        );
                    }
                }
            } else {
                this.transactions.add(new Transaction(finalAttrs));
            }
            try {
                await this.transactions.persist();
                this.render();
                this.trigger('toast', existingModel ? 'Movimiento actualizado' : 'Movimiento guardado', 'success');
            } catch (error) {
                this.trigger('toast', 'No se pudo guardar el movimiento. No recargues la página y vuelve a intentarlo', 'error');
            }
        });
        this.txnModal.on('txn:invalid', msg => this.trigger('toast', msg, 'error'));
    }
});

export default AppView;
