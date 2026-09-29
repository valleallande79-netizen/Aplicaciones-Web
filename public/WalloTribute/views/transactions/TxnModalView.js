import CategoryService from '../../services/CategoryService.js';
import Transaction from '../../models/Transaction.js';
import ReturnValidationService from '../../services/ReturnValidationService.js';
import FormatService from '../../services/FormatService.js';
import OptionSortService from '../../services/OptionSortService.js';

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
        'change #txn-holder':        'onSpecialCriteriaChange',
        'change #txn-h-from':         'onOriginHolderChange',
        'change #txn-amount':        'onSpecialCriteriaChange',
        'change #txn-date':          'onSpecialCriteriaChange',
        'click #btn-save-txn':      'onSave',
        // FIX: faltaba cerrar al hacer clic fuera del cuadro (en el overlay
        // oscuro), presente en el monolito via onclick="App._overlayClose(...)".
        'click': 'onOverlayClick'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.categories = options.categories;
        this.transactions = options.transactions;
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
        this.specialMode = (this.curType === 'expense' || this.curType === 'excluded-expense') ? 'exclude' : 'return';
        this.originAccountId = model ? model.get('accountId') : null;
        this.originHolderId = model ? model.get('holderId') : null;
        // Estado de seleccion del formulario durante toda la apertura del modal.
        // Sobrevive a los repintados que provoca la conmutacion de tipo.
        this.selectedAccountId = this.originAccountId;
        this.selectedHolderId = this.originHolderId;

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
            this._captureCurrentSelection();
        }
        this._configureSpecialButton();
        this._applySpecialFieldPolicy();
        if (this.curType === 'return') this._renderReturnCandidates(model ? model.get('originalTransactionId') : null);
        this.$el.addClass('active');
    },

    close() { this.$el.removeClass('active'); this.editingModel = null; },

    // Cierra solo si el clic fue directamente sobre el overlay (this.el),
    // no sobre el contenido del modal — igual que _overlayClose(event, id)
    // en el monolito, que comparaba e.target===document.getElementById(id).
    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    onTypeClick(e) {
        // Capturar primero los valores visibles. _applyType reconstruye los
        // <option> y, sin esta captura, el navegador vuelve a la primera cuenta.
        this._captureCurrentSelection();

        const requested = $(e.currentTarget).attr('id').replace('tt-', '');
        const type = requested === 'return' && this.specialMode === 'exclude'
            ? 'excluded-expense'
            : requested;

        this.curType = type;
        this._applyType(type);
        this._restoreCurrentSelection();
        this._applySpecialFieldPolicy();
        if (type === 'return') this._renderReturnCandidates();
    },

    _configureSpecialButton() {
        this.$('#tt-return').text(this.specialMode === 'exclude' ? '⊘ No contabilizar' : '↩️ Devolución');
    },

    _captureCurrentSelection() {
        const accountId = this.$('#txn-acc').val();
        if (accountId) this.selectedAccountId = accountId;

        // El titular origen vive en #txn-holder para ingreso/gasto y en
        // #txn-h-from para traspasos. Capturamos el control correspondiente
        // al tipo visible para que la conmutación no pierda la selección.
        const usesOriginHolder = this.curType === 'transfer' ||
            this.curType === 'holder-transfer';
        const holderId = usesOriginHolder
            ? this.$('#txn-h-from').val()
            : this.$('#txn-holder').val();
        this.selectedHolderId = holderId || null;
    },

    _restoreCurrentSelection() {
        const accountId = this.selectedAccountId || this.originAccountId;
        if (!accountId || !this.accounts.get(accountId)) return;

        this.$('#txn-acc').val(accountId);
        this._refreshHolderFields(accountId, false);

        const account = this.accounts.get(accountId);
        const holderExists = this.selectedHolderId &&
            account && account.holders.get(this.selectedHolderId);
        const holderId = holderExists ? this.selectedHolderId : '';

        // Los tipos ordinarios usan #txn-holder; Traspaso y Titulares usan
        // #txn-h-from como titular origen. Se sincronizan ambos controles.
        this.$('#txn-holder').val(holderId);
        this.$('#txn-h-from').val(holderId);
    },

    _restoreOriginSelection() {
        // Se mantiene como punto unico para los modos especiales, pero ya no
        // fuerza siempre los datos iniciales: conserva la seleccion vigente.
        if (!this.editingModel ||
            (this.curType !== 'return' && this.curType !== 'excluded-expense')) return;
        this._restoreCurrentSelection();
    },

    _applySpecialFieldPolicy() {
        const isEditing = !!this.editingModel;
        const locksStandardOrigin = isEditing &&
            (this.curType === 'return' || this.curType === 'excluded-expense');
        const locksTransferOrigin = isEditing &&
            (this.curType === 'transfer' || this.curType === 'holder-transfer');
        const locksAccount = locksStandardOrigin || locksTransferOrigin;

        // Al editar, los modos especiales y los dos tipos de traspaso
        // conservan el origen del movimiento. Al crear un movimiento nuevo,
        // todos los campos de origen siguen siendo editables.
        this.$('#txn-acc').prop('disabled', locksAccount);
        this.$('#txn-holder').prop('disabled', locksStandardOrigin);
        this.$('#txn-h-from').prop('disabled', locksTransferOrigin);

        this.$('#lbl-acc').text(locksAccount ? 'Cuenta origen del movimiento' : 'Cuenta');
        this.$('#lbl-holder').text(
            locksStandardOrigin ? 'Titular del movimiento original' : 'Atribuir a titular'
        );
    },

    _applyType(type) {
        ['income', 'expense', 'return', 'transfer', 'holder-transfer'].forEach(t => {
            const active = t === 'return' ? (type === 'return' || type === 'excluded-expense') : t === type;
            this.$(`#tt-${t}`).attr('class', `type-tab ${t}${active ? ' active' : ''}`);
        });

        const isHT = type === 'holder-transfer';
        const isTr = type === 'transfer';
        const isReturn = type === 'return';
        const isExcluded = type === 'excluded-expense';
        const isSrc = !isHT && !isTr;
        const hasCategorySelector = type === 'income' || type === 'expense' || isExcluded;

        this.$('#grp-cat').toggle(hasCategorySelector);
        this.$('#grp-return-expense').toggle(isReturn);
        if (hasCategorySelector) {
            const cats = OptionSortService.categories(CategoryService.allFor(isExcluded ? 'expense' : type, this.categories));
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

        const accOpts = OptionSortService.modelsBy(this.accounts).map(a => `<option value="${a.id}">${a.get('name')} — ${a.get('bank')}</option>`).join('');
        this.$('#txn-acc').html(accOpts);
        this.$('#txn-to-acc').html(accOpts);

        const defAcc = this.defaultAccountId || (this.accounts.first() && this.accounts.first().id);
        if (defAcc) this.$('#txn-acc').val(defAcc);

        const btnCls = { income: 'btn-income', expense: 'btn-expense', transfer: 'btn-transfer', 'holder-transfer': 'btn-htrans' }[type] || 'btn-primary';
        this.$('#btn-save-txn').attr('class', `btn ${btnCls} btn-sm`);

        this._refreshHolderFields(this.$('#txn-acc').val(), false);
    },

    onAccountChange(e) {
        this.selectedAccountId = e.target.value;
        this.selectedHolderId = null;
        this._refreshHolderFields(e.target.value, true);
        this.onSpecialCriteriaChange();
    },

    onOriginHolderChange(e) {
        this.selectedHolderId = e.target.value || null;
    },

    onSpecialCriteriaChange(e) {
        if (e && e.currentTarget && e.currentTarget.id === 'txn-holder') {
            this.selectedHolderId = this.$('#txn-holder').val() || null;
        }
        if (this.curType === 'return') this._renderReturnCandidates();
    },

    _returnCandidateAttrs() { return { type:'return', amount:parseFloat(this.$('#txn-amount').val()), date:this.$('#txn-date').val(), accountId:this.$('#txn-acc').val(), holderId:this.$('#txn-holder').val() || null }; },

    _renderReturnCandidates(selectedId=null) {
        const current=selectedId || this.$('#txn-original-expense').val();
        const candidates=ReturnValidationService.candidates(this._returnCandidateAttrs(), this.transactions, this.editingModel ? this.editingModel.id : null);
        const options=OptionSortService.byText(candidates, e => e.get('description') || '').map(e => `<option value="${e.id}">${FormatService.dateShort(e.get('date'))} · ${e.get('description') || 'Sin descripción'} · ${FormatService.currency(e.get('amount'))}</option>`);
        this.$('#txn-original-expense').html(options.length ? `<option value="">Selecciona un gasto</option>${options.join('')}` : '<option value="">No hay gastos compatibles</option>');
        if (current && candidates.some(e=>e.id===current)) this.$('#txn-original-expense').val(current);
    },

    // FIX: handler que faltaba por completo (no estaba ni en `events` ni
    // implementado). El monolito refresca los titulares de la cuenta DESTINO
    // cuando cambias `#txn-to-acc` en un traspaso entre cuentas — sin esto,
    // el desplegable "Titular destino" se queda con las opciones de la
    // cuenta anterior (o vacío) al cambiar la cuenta destino.
    onToAccountChange() {
        if (this.curType !== 'transfer') return;
        const toAcc = this.accounts.get(this.$('#txn-to-acc').val());
        const toHolders = toAcc && toAcc.hasHolders() ? OptionSortService.modelsBy(toAcc.holders) : [];
        const toHOpts = toHolders.map(h => `<option value="${h.id}">${h.get('name')}</option>`).join('');
        this.$('#txn-h-to').html(toHOpts || '<option value="">Sin titular</option>');

        const fromAcc = this.accounts.get(this.$('#txn-acc').val());
        const fromHolders = fromAcc && fromAcc.hasHolders() ? OptionSortService.modelsBy(fromAcc.holders) : [];
        this.$('#grp-holders-row').toggle(fromHolders.length > 0 || toHolders.length > 0);
    },

    _refreshHolderFields(accId, resetHolders) {
        const acc = this.accounts.get(accId);
        const holders = acc && acc.hasHolders() ? OptionSortService.modelsBy(acc.holders) : [];
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
            const toHolders = toAcc && toAcc.hasHolders() ? OptionSortService.modelsBy(toAcc.holders) : [];
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
        } else if (this.curType === 'return') {
            attrs.holderId = this.$('#txn-holder').val() || null;
            attrs.originalTransactionId = this.$('#txn-original-expense').val() || null;
            const original = attrs.originalTransactionId ? this.transactions.get(attrs.originalTransactionId) : null;
            attrs.category = original ? original.get('category') : '';
            attrs.returnDetection = { source: 'manual', confidence: 1, status: 'confirmed' };
            const error = ReturnValidationService.validate(attrs, this.transactions, this.editingModel ? this.editingModel.id : null);
            if (error) { this.trigger('txn:invalid', error); return; }
        } else {
            attrs.category = this.$('#txn-cat').val();
            if (this.$('#grp-holder').is(':visible')) attrs.holderId = this.$('#txn-holder').val() || null;
            if (this.curType === 'excluded-expense') attrs.returnDetection = { source:'manual', confidence:1, status:'excluded' };
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
