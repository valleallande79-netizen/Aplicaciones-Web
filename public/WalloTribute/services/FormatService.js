/**
 * FormatService — única fuente de verdad para formateo (moneda, fechas, ids).
 * Si mañana cambia la moneda o el locale, solo se toca este archivo.
 */
const FormatService = {
    currency(n) {
        return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €';
    },

    dateShort(dateStr) {
        return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    },

    monthName(date) {
        return date.toLocaleString('es-ES', { month: 'long' });
    },

    /**
     * Los 12 nombres de mes en orden (índice 0 = enero), capitalizados.
     * Única fuente de verdad — antes vivía duplicado como array local en
     * SavingsPanelView; ahora también lo usa el filtro por mes.
     */
    monthNames() {
        return Array.from({ length: 12 }, (_, i) => {
            const name = this.monthName(new Date(2000, i, 1));
            return name.charAt(0).toUpperCase() + name.slice(1);
        });
    },

    signedAmount(type, amount) {
        if (type === 'income' || type === 'return') return `+${this.currency(amount)}`;
        if (type === 'expense' || type === 'excluded-expense') return `−${this.currency(amount)}`;
        return this.currency(amount);
    },

    generateId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
};

export default FormatService;
