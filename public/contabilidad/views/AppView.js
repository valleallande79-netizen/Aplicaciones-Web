import StatsBarView from './stats/StatsBarView.js';
import AccountTabsView from './accounts/AccountTabsView.js';
import HolderStripView from './holders/HolderStripView.js';
import TxnListView from './transactions/TxnListView.js';
import FilterPanelView from './transactions/FilterPanelView.js';
import TxnModalView from './transactions/TxnModalView.js';
import SavingsPanelView from './savings/SavingsPanelView.js';
import ExpenseChartView from './stats/ExpenseChartView.js';
import FilterService from '../services/FilterService.js';
import Transaction from '../models/Transaction.js';

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
            filters: FilterService.emptyFilters(),
            filterOpen: false,
            // FIX: el estado de años colapsados/expandidos vivía dentro de
            // TxnListView, pero AppView crea una instancia NUEVA de
            // TxnListView en cada render() (tras cualquier guardado, borrado
            // o cambio de filtro). Eso reseteaba el colapso a cada rato.
            // Ahora vive aquí, persiste entre renders, y se pasa por
            // referencia — TxnListView solo lo lee/muta, no es su dueño.
            collapsedYears: {},
            collapsedMonths: {} // mismo motivo, para el colapso de meses dentro de cada año
        };

        this.txnModal = new TxnModalView({ accounts: this.accounts, categories: this.categories });
        this._bindModalEvents();

        this.listenTo(this.accounts, 'add remove change', this.render);
        this.listenTo(this.transactions, 'add remove change', this.render);
    },

    render() {
        this.$el.empty();

        this.statsView = new StatsBarView({ accounts: this.accounts, transactions: this.transactions, state: this.state });
        this.$el.append(this.statsView.render().el);

        this.tabsView = new AccountTabsView({ accounts: this.accounts, transactions: this.transactions, activeAcc: this.state.activeAcc });
        this.tabsView.on('account:selected', id => this.setActiveAccount(id));
        this.tabsView.on('accounts:manage', () => this.trigger('accounts:manage'));
        this.tabsView.on('account:credentials', id => this.trigger('credentials:open', this.accounts.get(id)));
        this.$el.append(this.tabsView.render().el);

        this.stripView = new HolderStripView({
            accounts: this.accounts, transactions: this.transactions,
            activeAcc: this.state.activeAcc, activeHolder: this.state.activeHolder
        });
        this.stripView.on('holder:selected', id => this.setActiveHolder(id));
        this.$el.append(this.stripView.render().el);

        this._renderMainPanel();

        // Grafica de gasto por categoria: SIEMPRE visible (Todas o cuenta
        // individual), reutilizando el mismo array `filtered` que ya
        // calculo _renderMainPanel() para filtros/lista — así respeta
        // exactamente la misma combinación de filtros activos, sin
        // recalcular nada por su cuenta.
        this.expenseChartView = new ExpenseChartView({ categories: this.categories });
        this.expenseChartView.setTransactions(this._lastFiltered);
        this.$el.append(this.expenseChartView.render().el);

        if (this.state.activeAcc === 'all') {
            this.savingsView = new SavingsPanelView({ accounts: this.accounts, transactions: this.transactions });
            this.$el.append(this.savingsView.render().el);
        }

        return this;
    },

    _renderMainPanel() {
        const $panel = $('<div class="main-panel"></div>');
        const hasFilters = FilterService.hasActiveFilters(this.state.filters);
        const $toolbar = $(`<div class="panel-toolbar">
            <span class="panel-title">Historial de movimientos</span>
            <div style="display:flex;gap:.4rem">
                <button class="btn btn-outline btn-sm toolbar-bulk-btn">☑ Editar en bloque</button>
                <button class="btn btn-outline btn-sm toolbar-filter-btn ${hasFilters ? 'af' : ''}">
                    ⚙ Filtros${hasFilters ? ' •' : ''}
                </button>
            </div>
        </div>`);
        $toolbar.find('.toolbar-filter-btn').on('click', () => this.toggleFilters());
        $panel.append($toolbar);

        const baseTxns = this._baseTransactions();
        const filtered = FilterService.apply(baseTxns, this.state.filters)
            .sort((a, b) => new Date(b.get('date')) - new Date(a.get('date')));
        this._lastFiltered = filtered;

        $toolbar.find('.toolbar-bulk-btn').on('click', () => this.trigger('bulk-edit:open', filtered));

        this.filterView = new FilterPanelView({
            accounts: this.accounts,
            categories: this.categories,
            transactionCollection: this.transactions,
            filters: this.state.filters,
            activeAcc: this.state.activeAcc,
            resultCount: filtered.length,
            totalCount: baseTxns.length
        });
        this.filterView.setOpen(this.state.filterOpen);
        this.filterView.on('filter:change', ({ key, value }) => this.onFilterChange(key, value));
        this.filterView.on('filter:clear', () => this.clearFilters());
        $panel.append(this.filterView.render().el);

        this.listView = new TxnListView({ accounts: this.accounts, categories: this.categories, collapsed: this.state.collapsedYears, collapsedMonths: this.state.collapsedMonths });
        this.listView.on('txn:edit',   m => this.txnModal.open(m));
        this.listView.on('txn:delete', m => this.deleteTransaction(m));
        this.listView.setTransactions(filtered);
        $panel.append(this.listView.render().el);

        this.$el.append($panel);
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
        this.state.filters.accId = '';
        this.state.filters.holderId = '';
        this.render();
    },

    setActiveHolder(id) {
        this.state.activeHolder = id;
        this.state.filters.holderId = '';
        this.render();
    },

    toggleFilters() {
        this.state.filterOpen = !this.state.filterOpen;
        this.render();
    },

    onFilterChange(key, value) {
        this.state.filters[key] = value;
        if (key === 'type') this.state.filters.cat = '';
        this.state.filterOpen = true;
        this.render();
    },

    clearFilters() {
        this.state.filters = FilterService.emptyFilters();
        this.render();
    },

    openNewTransaction() { this.txnModal.open(null); },

    deleteTransaction(model) {
        if (!confirm('¿Eliminar este movimiento?')) return;
        this.transactions.remove(model);
        this.transactions.persist();
        this.trigger('toast', 'Movimiento eliminado', 'success');
    },

    _bindModalEvents() {
        this.txnModal.on('txn:save', (attrs, existingModel) => {
            if (existingModel) {
                existingModel.set(attrs);
            } else {
                this.transactions.add(new Transaction(attrs));
            }
            this.transactions.persist();
            this.render();
            this.trigger('toast', existingModel ? 'Movimiento actualizado' : 'Movimiento guardado', 'success');
        });
        this.txnModal.on('txn:invalid', msg => this.trigger('toast', msg, 'error'));
    }
});

export default AppView;
