import VaultService from '../../services/VaultService.js';

/**
 * CredentialsModalView — modal dedicado de credenciales bancarias (Usuario,
 * Clave 1er nivel, Clave 2º nivel) para UNA cuenta concreta.
 *
 * Estados:
 *  - VAULT BLOQUEADO: pide la contraseña maestra (primera vez: la define).
 *  - VAULT DESABLOQUEADO: descifra y muestra los campos de esta cuenta
 *    (enmascarados, con revelar/copiar), listos para editar y guardar.
 *
 * El cifrado real vive en VaultService; esta vista solo orquesta el
 * formulario y delega el guardado (evento 'credentials:save').
 */
const CredentialsModalView = Backbone.View.extend({
    el: '#modal-credentials',

    events: {
        'click .modal-x, .modal-ft .btn-outline': 'close',
        'click': 'onOverlayClick',
        'click #cred-unlock-btn':      'onUnlock',
        'keydown #cred-unlock-pass':   'onUnlockKeydown',
        'click .cred-toggle-visibility': 'onToggleVisibility',
        'click .cred-copy':            'onCopy',
        'click #btn-save-credentials': 'onSave',
        'click #btn-lock-vault':       'onLockVault'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.account = null;
        this.decrypted = null; // { username, level1, level2 } tras descifrar, o null
    },

    async open(account) {
        this.account = account;
        this.decrypted = null;
        this.$el.addClass('active');
        await this._renderState();
    },

    close() { this.$el.removeClass('active'); },
    onOverlayClick(e) { if (e.target === this.el) this.close(); },

    async _renderState() {
        const acc = this.account;
        this.$('#cred-modal-title').text(`🔒 Credenciales — ${acc.get('name')}`);

        if (!VaultService.isUnlocked()) {
            this._renderLockedForm();
            return;
        }

        const blob = acc.get('credentials');
        if (blob) {
            try {
                this.decrypted = await VaultService.decrypt(blob);
            } catch {
                // No debería pasar si el vault está desbloqueado con la
                // contraseña correcta, pero por si el blob está corrupto.
                this.decrypted = { username: '', level1: '', level2: '' };
            }
        } else {
            this.decrypted = { username: '', level1: '', level2: '' };
        }
        this._renderUnlockedForm();
    },

    _renderLockedForm() {
        if (!VaultService.isAvailable()) {
            this._renderUnavailableNotice();
            return;
        }
        const isFirstEver = !VaultService.hasAnyStoredCredentials(this.accounts);
        this.$('#cred-body').html(`
            <div class="cred-locked">
                <div class="cred-locked-icon">🔒</div>
                <p class="cred-locked-text">
                    ${isFirstEver
                        ? 'Aún no has definido una contraseña maestra. La que introduzcas aquí protegerá las credenciales de <strong>todas</strong> las cuentas.'
                        : 'Introduce la contraseña maestra para ver o editar las credenciales de esta cuenta.'}
                </p>
                <div class="form-group">
                    <label>${isFirstEver ? 'Nueva contraseña maestra' : 'Contraseña maestra'}</label>
                    <input type="password" id="cred-unlock-pass" placeholder="••••••••" autocomplete="off">
                </div>
                <p class="cred-error" id="cred-unlock-error" style="display:none"></p>
            </div>
        `);
        this.$('#cred-footer').html(`
            <button class="btn btn-outline btn-sm">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="cred-unlock-btn">Desbloquear</button>
        `);
        setTimeout(() => this.$('#cred-unlock-pass').trigger('focus'), 50);
    },

    /**
     * Se muestra cuando SubtleCrypto no está disponible: la página se está
     * sirviendo por IP de red en http:// plano (no es "contexto seguro").
     * En vez del formulario, se explica el problema y cómo resolverlo,
     * en lugar de dejar que el usuario escriba una contraseña que fallará
     * con un TypeError críptico al primer intento.
     */
    _renderUnavailableNotice() {
        const { protocol, hostname, port } = window.location;
        const isHttps = protocol === 'https:';
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        const localUrl = `http://localhost${port ? ':' + port : ''}/contabilidad/`;

        this.$('#cred-body').html(`
            <div class="cred-locked">
                <div class="cred-locked-icon">⚠️</div>
                <p class="cred-locked-text">
                    Este navegador no permite cifrado aquí porque la página no
                    se está sirviendo en un <strong>contexto seguro</strong>
                    (https:// o localhost). Ahora mismo estás en
                    <code>${protocol}//${hostname}${port ? ':' + port : ''}</code>.
                </p>
                <p class="cred-locked-text" style="text-align:left">
                    ${!isHttps && !isLocal
                        ? `Solución más rápida: entra desde <strong>este mismo ordenador</strong> usando<br>
                           <code>${localUrl}</code> en vez de la IP de red.<br><br>
                           Para acceder desde otros dispositivos de la red necesitarás
                           configurar HTTPS en el servidor (por ejemplo con un
                           certificado autofirmado o un proxy inverso).`
                        : 'Revisa que el navegador soporte Web Crypto y que no haya una extensión bloqueándolo.'}
                </p>
            </div>
        `);
        this.$('#cred-footer').html(`<button class="btn btn-outline btn-sm">Cerrar</button>`);
    },

    _renderUnlockedForm() {
        const d = this.decrypted;
        const field = (id, label, value, hint) => `
            <div class="form-group">
                <label>${label}</label>
                <div class="cred-field">
                    <input type="password" id="${id}" value="${this._esc(value)}" placeholder="${hint || ''}">
                    <button type="button" class="cred-icon-btn cred-toggle-visibility" data-target="${id}" title="Mostrar/ocultar">👁️</button>
                    <button type="button" class="cred-icon-btn cred-copy" data-target="${id}" title="Copiar">📋</button>
                </div>
            </div>`;

        this.$('#cred-body').html(`
            <div class="cred-unlocked-hint">
                <span>🔓 Vault desbloqueado para esta sesión</span>
                <button type="button" class="cred-lock-link" id="btn-lock-vault">Bloquear ahora</button>
            </div>
            ${field('cred-username', 'Usuario', d.username, 'usuario de banca online')}
            ${field('cred-level1', 'Clave 1er nivel', d.level1, 'contraseña de acceso')}
            ${field('cred-level2', 'Clave 2º nivel', d.level2, 'PIN / respuesta de seguridad')}
        `);
        this.$('#cred-footer').html(`
            <button class="btn btn-outline btn-sm">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="btn-save-credentials">Guardar credenciales</button>
        `);
    },

    async onUnlock() {
        const pass = this.$('#cred-unlock-pass').val();
        if (!pass) return;
        this.$('#cred-unlock-error').hide();
        try {
            await VaultService.unlock(pass, this.accounts);
            await this._renderState();
        } catch (err) {
            this.$('#cred-unlock-error').text(err.message || 'Contraseña incorrecta').show();
        }
    },

    onUnlockKeydown(e) { if (e.key === 'Enter') this.onUnlock(); },

    onToggleVisibility(e) {
        const id = $(e.currentTarget).data('target');
        const $input = this.$(`#${id}`);
        $input.attr('type', $input.attr('type') === 'password' ? 'text' : 'password');
    },

    async onCopy(e) {
        const id = $(e.currentTarget).data('target');
        const value = this.$(`#${id}`).val();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            this.trigger('toast', 'Copiado al portapapeles', 'success');
        } catch {
            this.trigger('toast', 'No se pudo copiar', 'error');
        }
    },

    onLockVault() {
        VaultService.lock();
        this._renderState();
    },

    async onSave() {
        const plain = {
            username: this.$('#cred-username').val().trim(),
            level1: this.$('#cred-level1').val(),
            level2: this.$('#cred-level2').val()
        };
        const blob = await VaultService.encrypt(plain);
        this.trigger('credentials:save', this.account, blob);
        this.close();
    },

    _esc(s) { return String(s || '').replace(/"/g, '&quot;'); }
});

export default CredentialsModalView;
