/**
 * VaultService — cifrado/descifrado de credenciales bancarias.
 *
 * Diseño: UNA sola contraseña maestra para toda la app ("el vault"),
 * derivada con PBKDF2 a una clave AES-GCM. La clave derivada vive
 * SOLO en memoria (variable de módulo) durante la sesión del navegador
 * — nunca se persiste, nunca viaja al servidor. Lo único que se guarda
 * en accounts.json por cada cuenta es {salt, iv, ciphertext}, todo en
 * base64; sin la contraseña maestra esos campos son ruido.
 *
 * La primera vez que el usuario introduce una contraseña (en cualquier
 * cuenta) esa contraseña PASA A SER la maestra: se genera una sal nueva
 * y se cachea la clave. Las siguientes veces, se deriva la clave con la
 * sal ya existente y se verifica descifrando cualquier blob que ya
 * exista — si falla (fallo de autenticación GCM), la contraseña es
 * incorrecta.
 *
 * SRP: este módulo solo sabe de criptografía; no sabe de cuentas,
 * vistas ni persistencia HTTP.
 */
const VaultService = {
    _key: null,   // CryptoKey en memoria, null = vault bloqueado
    _salt: null,  // base64, misma sal para todas las cuentas de este vault

    isUnlocked() { return !!this._key; },

    lock() { this._key = null; this._salt = null; },

    /**
     * SubtleCrypto (crypto.subtle) solo existe en "contextos seguros":
     * https:// o bien http://localhost / http://127.0.0.1. Servido por IP
     * de red en http:// plano (p.ej. http://192.168.x.x:8080/...), el
     * navegador lo deja `undefined` — y cualquier llamada revienta con un
     * TypeError críptico ("Cannot read properties of undefined").
     * Esta comprobación permite dar un mensaje claro en vez de eso.
     */
    isAvailable() {
        return typeof window !== 'undefined'
            && !!window.isSecureContext
            && !!(window.crypto && window.crypto.subtle);
    },

    /** true si CUALQUIER cuenta ya tiene credenciales guardadas (vault ya inicializado alguna vez) */
    hasAnyStoredCredentials(accounts) {
        return !!this._findExistingCredentials(accounts);
    },

    /**
     * Intenta desbloquear (o inicializar) el vault con la contraseña dada.
     * @param password string
     * @param accounts AccountCollection — para localizar una sal/ciphertext existentes
     * @returns Promise<void> — resuelve si desbloquea correctamente, rechaza si la contraseña es incorrecta
     */
    async unlock(password, accounts) {
        if (!this.isAvailable()) {
            throw new Error(
                'Este navegador no permite cifrado aquí porque la página no se sirve en un contexto seguro. ' +
                'Entra usando http://localhost:8080/contabilidad/ (no la IP de red) o configura HTTPS.'
            );
        }
        const existing = this._findExistingCredentials(accounts);

        if (existing) {
            // Vault ya inicializado por otra cuenta: reutilizar su sal y
            // verificar la contraseña intentando descifrar su blob.
            const key = await this._deriveKey(password, existing.salt);
            try {
                await this._decryptRaw(key, existing.iv, existing.ciphertext);
            } catch {
                throw new Error('Contraseña incorrecta');
            }
            this._key = key;
            this._salt = existing.salt;
        } else {
            // Primer uso en toda la app: esta contraseña pasa a ser la maestra.
            const saltBytes = crypto.getRandomValues(new Uint8Array(16));
            const salt = this._toB64(saltBytes);
            this._key = await this._deriveKey(password, salt);
            this._salt = salt;
        }
    },

    /** Cifra un objeto plano → {salt, iv, ciphertext} (todo string base64) */
    async encrypt(plainObj) {
        if (!this.isUnlocked()) throw new Error('Vault bloqueado');
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(JSON.stringify(plainObj));
        const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this._key, data);
        return { salt: this._salt, iv: this._toB64(iv), ciphertext: this._toB64(new Uint8Array(cipherBuf)) };
    },

    /** Descifra {salt, iv, ciphertext} → objeto plano original */
    async decrypt(blob) {
        if (!this.isUnlocked()) throw new Error('Vault bloqueado');
        const plainBuf = await this._decryptRaw(this._key, blob.iv, blob.ciphertext);
        return JSON.parse(new TextDecoder().decode(plainBuf));
    },

    // ── Internos ──────────────────────────────────────────────
    async _deriveKey(password, saltB64) {
        const saltBytes = this._fromB64(saltB64);
        const baseKey = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBytes, iterations: 210000, hash: 'SHA-256' },
            baseKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    async _decryptRaw(key, ivB64, ciphertextB64) {
        const iv = this._fromB64(ivB64);
        const data = this._fromB64(ciphertextB64);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    },

    _findExistingCredentials(accounts) {
        for (const acc of accounts.models) {
            const c = acc.get('credentials');
            if (c && c.salt && c.iv && c.ciphertext) return c;
        }
        return null;
    },

    _toB64(bytes) { return btoa(String.fromCharCode(...bytes)); },
    _fromB64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
};

export default VaultService;
