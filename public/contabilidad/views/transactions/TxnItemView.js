import FormatService from '../../services/FormatService.js';
import CategoryService from '../../services/CategoryService.js';

/**
 * TxnItemView — una fila de movimiento. Componente atómico y reutilizable.
 * Recibe accounts y categories (colecciones) por referencia para resolver
 * nombres/colores/iconos. Las categorías predefinidas + personalizadas
 * viven en CategoryService — única fuente de verdad, ya no hay un array
 * duplicado aquí (antes INCOME_CATS/EXPENSE_CATS vivían solo en este
 * fichero; TxnModalView y FilterPanelView usan la misma fuente).
 */
const TxnItemView = Backbone.View.extend({
    tagName: 'div',
    className: 'txn',

    events: {
        'click .btn-icon.edit':   'onEdit',
        'click .btn-icon.delete': 'onDelete'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
    },

    render() {
        const t = this.model;
        const type = t.get('type');
        const cat = (type === 'income' || type === 'expense')
            ? CategoryService.findById(type, t.get('category'), this.categories)
            : null;
        const isHT = t.isHolderTransfer();
        const icon = cat ? cat.icon : (type === 'transfer' ? '🔄' : isHT ? '👥' : '❓');
        const label = cat ? cat.label : (type === 'transfer' ? 'Traspaso cuentas' : isHT ? 'Traspaso titulares' : '—');

        const acc = this.accounts.get(t.get('accountId'));
        const accTo = t.get('toAccountId') ? this.accounts.get(t.get('toAccountId')) : null;
        const hFrom = t.get('holderId') && acc ? acc.holders.get(t.get('holderId')) : null;
        const hTo = t.get('toHolderId') && acc ? acc.holders.get(t.get('toHolderId')) : null;

        const date = FormatService.dateShort(t.get('date'));
        const amtStr = FormatService.signedAmount(type, t.get('amount'));

        let holderBadge = '';
        if (isHT && hFrom && hTo) {
            holderBadge = `<span class="holder-pill">${hFrom.get('name')}</span><span class="txn-arrow">→</span><span class="holder-pill">${hTo.get('name')}</span>`;
        } else if (hFrom) {
            holderBadge = `<span class="holder-pill">👤 ${hFrom.get('name')}</span>`;
        }

        this.$el.html(`
            <span class="txn-dot ${type}"></span>
            <span class="txn-ico">${icon}</span>
            <div class="txn-body">
                <div class="txn-top">
                    <span class="txn-cat">${label}</span>
                    ${t.get('description') ? `<span class="txn-desc">— ${t.get('description')}</span>` : ''}
                </div>
                <div class="txn-bot">
                    <span class="txn-date">${date}</span>
                    ${acc ? `<span class="acc-pill" style="background:${acc.get('color')}">${acc.get('name')}</span>` : ''}
                    ${accTo ? `<span class="txn-arrow">→</span><span class="acc-pill" style="background:${accTo.get('color')}">${accTo.get('name')}</span>` : ''}
                    ${holderBadge}
                </div>
            </div>
            <span class="txn-amt ${type}">${amtStr}</span>
            <div class="txn-acts">
                <button class="btn-icon edit" title="Editar">✏️</button>
                <button class="btn-icon delete" title="Eliminar">🗑️</button>
            </div>
        `);
        return this;
    },

    onEdit() { this.trigger('txn:edit', this.model); },
    onDelete() { this.trigger('txn:delete', this.model); }
});

export default TxnItemView;
