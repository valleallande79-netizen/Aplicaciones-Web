import CategoryService from '../../services/CategoryService.js';
import Transaction from '../../models/Transaction.js';

/**
 * TxnModalView — modal de creación/edición de movimiento.
 * Controla su propio estado interno de formulario (curType) pero
 * DELEGA la persistencia: emite 'txn:save' con los atributos resultantes,
 * y es el controlador quien decide crear/actualizar en la colección.
 */
const TxnModalView = Backbone.View.extend({
    el: '#modal-txn',

    events: {
        'click .modal-x, .modal-ft .btn-outline': 'close',
        'click .type-tab':          'onTypeClick',
        'change #txn-acc':          'onAccountChange',
        'change #txn-to-acc':       'onToAccountChange',
        'click #btn-save-txn':      'onSave',
        // FIX: faltaba cerrar al hacer clic fuera del cuadro (en el overlay
        // oscuro), presente en el monolito via onclick="App._overlayClose(...)".
        'click': 'onOverlayClick'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.curType = 'income';
        this.editingModel = null;
    },

    open(model) {
        this.editingModel = model || null;
        // curType se fija AQUÍ, antes de tocar el DOM. Es intencional: en el
        // monolito original, curType no se sincronizaba al editar un movimiento
        // (setType(type, false) dejaba this.curType obsoleto), lo que corrompía
        // los traspasos entre titulares al guardarlos tras editarlos. Si se
        // reordena esta línea después de _applyType()/_refreshHolderFields(),
        // se reintroduce ese bug.
        this.curType = model ? model.get('type') : 'income';

        this.$('#txn-title').text(model ? 'Editar movimiento' : 'Nuevo movimiento');
        this.$('#txn-id').val(model ? model.id : '');
        this.$('#txn-date').val(model ? model.get('date') : new Date().toISOString().split('T')[0]);
        this.$('#txn-amount').val(model ? model.get('amount') : '');
        this.$('#txn-desc').val(model ? model.get('description') || '' : '');

        this._applyType(this.curType);

        if (model) {
            this.$('#txn-acc').val(model.get('accountId'));
            this._refreshHolderFields(model.get('accountId'), false);
            if (model.get('toAccountId')) this.$('#txn-to-acc').val(model.get('toAccountId'));
            if (model.get('category'))    this.$('#txn-cat').val(model.get('category'));
            if (model.get('holderId')) {
                this.$('#txn-holder').val(model.get('holderId'));
                this.$('#txn-h-from').val(model.get('holderId'));
            }
            if (model.get('toHolderId')) this.$('#txn-h-to').val(model.get('toHolderId'));
        }

        this.$el.addClass('active');
    },

    close() { this.$el.removeClass('active'); this.editingModel = null; },

    // Cierra solo si el clic fue directamente sobre el overlay (this.el),
    // no sobre el contenido del modal — igual que _overlayClose(event, id)
    // en el monolito, que comparaba e.target===document.getElementById(id).
    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    onTypeClick(e) {
        const type = $(e.currentTarget).attr('id').replace('tt-', '');
        this.curType = type;
        this._applyType(type);
    },

    _applyType(type) {
        ['income', 'expense', 'transfer', 'holder-transfer'].forEach(t => {
            this.$(`#tt-${t}`).attr('class', `type-tab ${t}${t === type ? ' active' : ''}`);
        });

        const isHT = type === 'holder-transfer';
        const isTr = type === 'transfer';
        const isSrc = !isHT && !isTr;

        this.$('#grp-cat').toggle(isSrc);
        if (isSrc) {
            const cats = CategoryService.allFor(type, this.categories);
            this.$('#txn-cat').html(cats.map(c => `<option value="${c.id}">${c.icon} ${c.label}</option>`).join(''));
        }
        this.$('#grp-to-acc').toggle(isTr);
        // Como el monolito: solo se oculta aqui para income/expense.
        // Para isTr/isHT la visibilidad real la decide _refreshHolderFields()
        // (llamada al final de este metodo), segun si la cuenta tiene titulares.
        if (isSrc) this.$('#grp-holders-row').hide();
        this.$('#grp-holder').hide();

        // FIX: faltaba este cambio de etiquetas (presente en el monolito).
        // Para 'transfer' los campos son "Titular origen/destino"; para
        // 'holder-transfer' son "De (titular)" / "A (titular)".
        const $lhFrom = this.$('#grp-holders-row .form-group:first-child label');
        const $lhTo = this.$('#grp-holders-row .form-group:last-child label');
        if (isTr) {
            $lhFrom.text('Titular origen');
            $lhTo.text('Titular destino');
        } else {
            $lhFrom.text('De (titular)');
            $lhTo.text('A (titular)');
        }

        const accOpts = this.accounts.map(a => `<option value="${a.id}">${a.get('name')} — ${a.get('bank')}</option>`).join('');
        this.$('#txn-acc').html(accOpts);
        this.$('#txn-to-acc').html(accOpts);

        const defAcc = this.defaultAccountId || (this.accounts.first() && this.accounts.first().id);
        if (defAcc) this.$('#txn-acc').val(defAcc);

        const btnCls = { income: 'btn-income', expense: 'btn-expense', transfer: 'btn-transfer', 'holder-transfer': 'btn-htrans' }[type] || 'btn-primary';
        this.$('#btn-save-txn').attr('class', `btn ${btnCls} btn-sm`);

        this._refreshHolderFields(this.$('#txn-acc').val(), false);
    },

    onAccountChange(e) { this._refreshHolderFields(e.target.value, true); },

    // FIX: handler que faltaba por completo (no estaba ni en `events` ni
    // implementado). El monolito refresca los titulares de la cuenta DESTINO
    // cuando cambias `#txn-to-acc` en un traspaso entre cuentas — sin esto,
    // el desplegable "Titular destino" se queda con las opciones de la
    // cuenta anterior (o vacío) al cambiar la cuenta destino.
    onToAccountChange() {
        if (this.curType !== 'transfer') return;
        const toAcc = this.accounts.get(this.$('#txn-to-acc').val());
        const toHolders = toAcc && toAcc.hasHolders() ? toAcc.holders.models : [];
        const toHOpts = toHolders.map(h => `<option value="${h.id}">${h.get('name')}</option>`).join('');
        this.$('#txn-h-to').html(toHOpts || '<option value="">Sin titular</option>');

        const fromAcc = this.accounts.get(this.$('#txn-acc').val());
        const fromHolders = fromAcc && fromAcc.hasHolders() ? fromAcc.holders.models : [];
        this.$('#grp-holders-row').toggle(fromHolders.length > 0 || toHolders.length > 0);
    },

    _refreshHolderFields(accId, resetHolders) {
        const acc = this.accounts.get(accId);
        const holders = acc && acc.hasHolders() ? acc.holders.models : [];
        const isHT = this.curType === 'holder-transfer';
        const isTr = this.curType === 'transfer';

        const hOpts = holders.map(h => `<option value="${h.id}">${h.get('name')}</option>`).join('');

        if (isHT) {
            this.$('#txn-h-from').html(hOpts);
            this.$('#txn-h-to').html(hOpts);
            this.$('#grp-holders-row').toggle(holders.length >= 2);
            this.$('#grp-holder').hide();
            if (resetHolders && holders.length >= 2) {
                this.$('#txn-h-from').val(holders[0].id);
                this.$('#txn-h-to').val(holders[1].id);
            }
        } else if (isTr) {
            // FIX: rama que faltaba por completo. traspaso entre cuentas:
            // "Titular origen" = titulares de la cuenta origen (accId, la
            // que acaba de cambiar); "Titular destino" = titulares de la
            // cuenta destino actualmente seleccionada en #txn-to-acc.
            this.$('#txn-h-from').html(hOpts || '<option value="">Sin titular</option>');
            const toAcc = this.accounts.get(this.$('#txn-to-acc').val());
            const toHolders = toAcc && toAcc.hasHolders() ? toAcc.holders.models : [];
            const toHOpts = toHolders.map(h => `<option value="${h.id}">${h.get('name')}</option>`).join('');
            this.$('#txn-h-to').html(toHOpts || '<option value="">Sin titular</option>');
            this.$('#grp-holders-row').toggle(holders.length > 0 || toHolders.length > 0);
            this.$('#grp-holder').hide();
        } else {
            this.$('#txn-holder').html(`<option value="">Sin asignar</option>${hOpts}`);
            this.$('#grp-holder').toggle(holders.length > 0);
            this.$('#grp-holders-row').hide();
        }
    },

    onSave() {
        const attrs = {
            id: this.$('#txn-id').val() || undefined,
            type: this.curType,
            amount: parseFloat(this.$('#txn-amount').val()),
            date: this.$('#txn-date').val(),
            accountId: this.$('#txn-acc').val(),
            description: this.$('#txn-desc').val().trim(),
            category: '', toAccountId: null, holderId: null, toHolderId: null
        };

        if (this.curType === 'transfer') {
            attrs.toAccountId = this.$('#txn-to-acc').val();
            // FIX: faltaba leer estos dos campos por completo — cualquier
            // traspaso entre cuentas creado/editado aquí perdía SIEMPRE la
            // atribución de titular origen/destino (holderId/toHolderId
            // quedaban en null pase lo que pase en el formulario).
            const fromVal = this.$('#txn-h-from').val();
            const toVal = this.$('#txn-h-to').val();
            if (fromVal) attrs.holderId = fromVal;
            if (toVal) attrs.toHolderId = toVal;
        } else if (this.curType === 'holder-transfer') {
            attrs.holderId = this.$('#txn-h-from').val();
            attrs.toHolderId = this.$('#txn-h-to').val();
        } else {
            attrs.category = this.$('#txn-cat').val();
            if (this.$('#grp-holder').is(':visible')) attrs.holderId = this.$('#txn-holder').val() || null;
        }

        // Validación vía el propio modelo (reutiliza Transaction.validate)
        const tempModel = new Transaction(attrs, { validate: false });
        const errors = tempModel.validate(attrs);
        if (errors) {
            this.trigger('txn:invalid', errors[0].message);
            return;
        }

        this.trigger('txn:save', attrs, this.editingModel);
        this.close();
    }
});

export default TxnModalView;
