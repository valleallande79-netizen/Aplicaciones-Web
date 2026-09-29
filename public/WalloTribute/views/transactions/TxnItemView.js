import FormatService from '../../services/FormatService.js';
import CategoryService from '../../services/CategoryService.js';
import AccountingService from '../../services/AccountingService.js';
import SplitExpenseService from '../../services/SplitExpenseService.js';

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
        'click .btn-icon.delete': 'onDelete',
        'click .btn-icon.split': 'onSplit'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.referenceTransactions = options.referenceTransactions || [];
    },

    render() {
        const t = this.model;
        const type = t.get('type');
        const cat = (type === 'income' || type === 'expense' || type === 'return' || type === 'excluded-expense')
            ? CategoryService.findById(type, t.get('category'), this.categories)
            : null;
        const isHT = t.isHolderTransfer();
        const icon = type === 'return' ? '↩️' : type === 'excluded-expense' ? '⊘' : cat ? cat.icon : (type === 'transfer' ? '🔄' : isHT ? '👥' : '❓');
        const label = type === 'return' ? 'Devolución' : type === 'excluded-expense' ? 'No contabilizado' : cat ? cat.label : (type === 'transfer' ? 'Traspaso cuentas' : isHT ? 'Traspaso titulares' : '—');

        const acc = this.accounts.get(t.get('accountId'));
        const accTo = t.get('toAccountId') ? this.accounts.get(t.get('toAccountId')) : null;
        const hFrom = t.get('holderId') && acc ? acc.holders.get(t.get('holderId')) : null;
        const hTo = t.get('toHolderId') && acc ? acc.holders.get(t.get('toHolderId')) : null;

        const date = FormatService.dateShort(t.get('date'));
        const amtStr = FormatService.signedAmount(type, t.get('amount'));
        const fullDescription = t.get('description') || '';
        const shortDescription = this._abbreviate(fullDescription, 28);
        const compensation = type === 'expense'
            ? AccountingService.compensationMap(this.referenceTransactions).get(t.id)
            : null;
        const compensationBadge = compensation
            ? `<span class="txn-compensated" title="Este gasto queda fuera de los cálculos analíticos">↩ Compensado por devolución · ${FormatService.dateShort(compensation.get('date'))}</span>`
            : '';
        const splitChildren = type === 'expense' ? SplitExpenseService.childrenOf(t, this.referenceTransactions) : [];
        const splitBadge = splitChildren.length ? `<span class="split-parent-badge">✂ ${splitChildren.length} subgastos</span>` : '';
        const canSplit = type === 'expense' && !t.get('parentTransactionId') && !compensation;
        const splitButton = type === 'expense' && !t.get('parentTransactionId')
            ? canSplit
                ? `<button class="btn-icon split" title="Descomponer gasto">✂</button>`
                : `<button class="btn-icon split split-blocked" disabled title="No se puede descomponer: gasto compensado por devolución">✂</button>`
            : '';
        const splitHtml = splitChildren.length ? `<div class="split-children">${splitChildren.map(child => {
            const childCat = CategoryService.findById('expense', child.get('category'), this.categories);
            const childHolder = acc && acc.holders.get(child.get('holderId'));
            const childCompensation = AccountingService.compensationMap(this.referenceTransactions).get(child.id);
            const childHolderName = childHolder ? childHolder.get('name') : '';
            const childHolderLabel = childHolder ? this._initials(childHolderName) : '—';
            return `<div class="split-child"><span title="${this._esc(childHolderName || 'Sin titular')}">${childCat ? childCat.icon + ' ' + this._esc(childCat.label) : 'Sin categoría'} · <b class="split-holder-initials">${childHolderLabel}</b>${childCompensation ? ' · ↩ compensado' : ''}</span><strong>${FormatService.currency(child.get('amount'))}</strong></div>`;
        }).join('')}</div>` : '';

        let holderBadge = '';
        if (isHT && hFrom && hTo) {
            holderBadge = `<span class="holder-pill">${hFrom.get('name')}</span><span class="txn-arrow">→</span><span class="holder-pill">${hTo.get('name')}</span>`;
        } else if (hFrom) {
            const holderName = hFrom.get('name');
            holderBadge = `<span class="holder-pill txn-holder-compact" title="${this._esc(holderName)}">👤 ${this._initials(holderName)}</span>`;
        }

        this.$el.toggleClass('txn-has-split', splitChildren.length > 0);
        this.$el.html(`
            <div class="txn-primary-column">
                <span class="txn-dot ${type}"></span>
                <span class="txn-ico">${icon}</span>
                <div class="txn-body">
                    <div class="txn-top">
                        <span class="txn-cat">${this._esc(label)}</span>
                        ${fullDescription ? `<span class="txn-desc" title="${this._esc(fullDescription)}">— ${this._esc(shortDescription)}</span>` : ''}
                    </div>
                    <div class="txn-bot">
                        <span class="txn-date">${date}</span>
                        ${acc ? `<span class="acc-pill txn-account-compact" title="${this._esc(acc.get('name'))}" style="background:${acc.get('color')}">${this._esc(acc.get('name'))}</span>` : ''}
                        ${accTo ? `<span class="txn-arrow">→</span><span class="acc-pill" style="background:${accTo.get('color')}">${this._esc(accTo.get('name'))}</span>` : ''}
                        ${holderBadge}
                    </div>
                </div>
            </div>
            <div class="txn-allocation-column">${splitHtml}${compensationBadge}</div>
            <div class="txn-total-column">
                <span class="txn-amt ${type}">${amtStr}</span>
                <div class="txn-acts">
                    ${splitButton}<button class="btn-icon edit" title="Editar">✏️</button>
                    <button class="btn-icon delete" title="Eliminar">🗑️</button>
                </div>
            </div>
        `);
        return this;
    },

    _abbreviate(value, maxLength) {
        const text = String(value || '').trim();
        return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    },

    _esc(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[char]));
    },

    _initials(value) {
        return String(value || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(word => word.charAt(0).toLocaleUpperCase('es'))
            .join('') || '—';
    },

    onEdit() { this.trigger('txn:edit', this.model); },
    onSplit() { this.trigger('txn:split', this.model); },
    onDelete() { this.trigger('txn:delete', this.model); }
});

export default TxnItemView;
