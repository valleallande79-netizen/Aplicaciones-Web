/** Ventana movil de meses usada por el filtro global de periodo. */
const PeriodRangeService = {
    monthKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    },

    dateFromKey(key) {
        const match = String(key || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return new Date();
        return new Date(Number(match[1]), Number(match[2]) - 1, 1);
    },

    shiftKey(key, months) {
        const date = this.dateFromKey(key);
        return this.monthKey(new Date(date.getFullYear(), date.getMonth() + months, 1));
    },

    build(referenceDate = new Date()) {
        return Array.from({ length: 12 }, (_, index) => {
            const date = new Date(
                referenceDate.getFullYear(),
                referenceDate.getMonth() - 11 + index,
                1
            );
            return {
                key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
                month: date.getMonth(),
                year: date.getFullYear(),
                monthLabel: new Intl.DateTimeFormat('es-ES', { month: 'short' })
                    .format(date).replace('.', ''),
                yearLabel: String(date.getFullYear())
            };
        });
    },

    indexForKey(months, key, fallback) {
        const index = months.findIndex(month => month.key === key);
        return index >= 0 ? index : fallback;
    }
};

export default PeriodRangeService;
