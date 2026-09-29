import AccountCollection from './collections/AccountCollection.js';
import TransactionCollection from './collections/TransactionCollection.js';
import CategoryCollection from './collections/CategoryCollection.js';
import ApiService from './services/ApiService.js';
import AppView from './views/AppView.js';
import AccountsModalView from './views/accounts/AccountsModalView.js';
import AccountFormView from './views/accounts/AccountFormView.js';
import CredentialsModalView from './views/accounts/CredentialsModalView.js';
import ImportModalView from './views/transactions/ImportModalView.js';
import BulkEditModalView from './views/transactions/BulkEditModalView.js';
import Account from './models/Account.js';
import Transaction from './models/Transaction.js';
import AppRouter from './routers/AppRouter.js';

/**
 * app.js — Bootstrap. Instancia modelos raíz, conecta las vistas
 * "modales" (fuera del árbol principal) y arranca el Router.
 * Es el ÚNICO archivo que conoce el orden de arranque completo.
 */
async function main() {
    const accounts = new AccountCollection();
    const transactions = new TransactionCollection();
    const categories = new CategoryCollection();

    await ApiService.bootstrap(accounts, transactions, categories);

    const appView = new AppView({ accounts, transactions, categories });
    appView.render();

    // Botón "Nuevo movimiento" del header
    $('#btn-new-txn').on('click', () => appView.openNewTransaction());

    // Toasts
    const showToast = (msg, type) => {
        const el = $(`<div class="toast">${msg}</div>`).css('background', type === 'success' ? '#10b981' : '#ef4444');
        $('body').append(el);
        setTimeout(() => { el.css('opacity', 0); setTimeout(() => el.remove(), 300); }, 2800);
    };
    appView.on('toast', showToast);

    // Modal de gestión de cuentas + formulario (viven fuera del árbol de AppView
    // porque son overlays globales, pero se comunican con el mismo estado)
    const accountsModal = new AccountsModalView({ accounts, transactions });
    const accountForm = new AccountFormView({ accounts, transactions });

    appView.on('accounts:manage', () => accountsModal.open());

    accountsModal.on('account:new', () => { accountsModal.close(); accountForm.open(null); });
    accountsModal.on('account:edit', id => { accountsModal.close(); accountForm.open(accounts.get(id)); });
    accountsModal.on('account:delete', id => {
        if (transactions.some(t => t.involvesAccount(id))) {
            showToast('No puedes eliminar una cuenta con movimientos', 'error'); return;
        }
        if (!confirm('¿Eliminar esta cuenta?')) return;
        accounts.remove(id);
        accounts.persist();
        if (appView.state.activeAcc === id) appView.setActiveAccount('all');
        accountsModal.render();
        showToast('Cuenta eliminada', 'success');
    });

    accountForm.on('toast', showToast);
    accountForm.on('account:save', (attrs, existingModel) => {
        if (existingModel) {
            existingModel.set({ name: attrs.name, bank: attrs.bank, color: attrs.color, initialBalance: attrs.initialBalance });
            existingModel.holders.set(attrs.holders); // sync add/update/remove por id
        } else {
            accounts.add(new Account(attrs));
        }
        accounts.persist();
        accountsModal.render();
        appView.render();
        showToast(existingModel ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
    });

    // Modal de credenciales bancarias por cuenta (candado en cada pestaña)
    const credentialsModal = new CredentialsModalView({ accounts });
    appView.on('credentials:open', account => credentialsModal.open(account));
    credentialsModal.on('toast', showToast);
    credentialsModal.on('credentials:save', (account, blob) => {
        account.set('credentials', blob);
        accounts.persist();
        showToast('Credenciales guardadas (cifradas)', 'success');
    });

    // Importar movimientos pegados desde la página de movimientos del banco
    const importModal = new ImportModalView({ accounts, transactions, categories });
    $('#btn-import').on('click', () => importModal.open());
    importModal.on('import:confirm', attrsList => {
        attrsList.forEach(attrs => transactions.add(new Transaction(attrs)));
        transactions.persist();
        appView.render();
        showToast(`${attrsList.length} movimiento${attrsList.length !== 1 ? 's' : ''} importado${attrsList.length !== 1 ? 's' : ''}`, 'success');
    });

    // Editar en bloque (categoría/titular/borrado sobre varios movimientos a la vez)
    const bulkEditModal = new BulkEditModalView({ accounts, transactions, categories });
    appView.on('bulk-edit:open', candidateTxns => bulkEditModal.open(candidateTxns));
    bulkEditModal.on('toast', showToast);
    // No hace falta appView.render() aquí: BulkEditModalView muta `transactions`
    // (la misma colección que ya escucha AppView), así que el 'change'/'remove'
    // dispara el re-render automático por sí solo.

    // Router: sincroniza URL con estado de navegación
    const router = new AppRouter({ appView });
    Backbone.history.start();
}

main();
