import SavingsService from '../../services/SavingsService.js';
import FormatService from '../../services/FormatService.js';

const MONTHS = FormatService.monthNames();

/**
 * SavingsPanelView — pinta la matriz de ahorro por titular/mes.
 * Toda la agregación viene resuelta de SavingsService.buildMatrix();
 * esta vista solo transforma datos → HTML (separación cálculo/presentación).
 */
const SavingsPanelView = Backbone.View.extend({
    className: 'savings-panel',

    events: {
        'click .savings-panel-hdr': 'onToggle'
    },

    initialize(options) {
        this.accounts = options.accounts;
        this.transactions = options.transactions;
        this.open = false;
    },

    render() {
        const matrix = SavingsService.buildMatrix(this.accounts, this.transactions);
        if (!matrix) { this.$el.empty(); return this; }

        const svFmt = val => {
            if (Math.abs(val) < 0.005) return `<span class="sv sv-zero">—</span>`;
            return `<span class="sv ${val > 0 ? 'sv-pos' : 'sv-neg'}">${val > 0 ? '+' : ''}${FormatService.currency(val)}</span>`;
        };

        const thHolders = matrix.holders.map(h => {
            const accNames = h.ids.map(e => this.accounts.get(e.accountId)?.get('name') || '').filter(Boolean).join(' · ');
            const tip = accNames ? `<span class="sav-tip">${accNames}</span>` : '';
            return `<th class="th-holder" colspan="2">${h.name}${tip}</th>`;
        }).join('');
        const thSub = matrix.holders.map(() => `<th class="th-delta">Δ Mes</th><th class="th-cum">∑ Acum.</th>`).join('');

        let tbody = '';
        matrix.rows.forEach(({ year, months, totals }) => {
            tbody += `<tr class="tr-yr"><td colspan="${1 + matrix.holders.length * 2}">${year}</td></tr>`;
            months.forEach(m => {
                tbody += `<tr${m.allBlank ? ' class="tr-blank"' : ''}>
                    <td class="td-mes">${MONTHS[m.monthIndex]}</td>
                    ${m.cells.map(c => `<td class="td-delta">${svFmt(c.net)}</td><td class="td-cum">${svFmt(c.cumulative)}</td>`).join('')}
                </tr>`;
            });
            const totCells = totals.map(t => `<td class="td-delta">${svFmt(t.net)}</td><td class="td-cum">${svFmt(t.cumulative)}</td>`).join('');
            tbody += `<tr class="tr-yr-total"><td class="td-mes">Total ${year}</td>${totCells}</tr>`;
        });

        this.$el.html(`
            <div class="savings-panel-hdr">
                <span class="savings-panel-title">
                    <span class="sav-chevron">${this.open ? '▼' : '▶'}</span>
                    📊 Ahorro mensual por titular
                </span>
            </div>
            <div class="savings-panel-body${this.open ? '' : ' hidden'}">
                <table class="sav-tbl">
                    <thead>
                        <tr><th class="th-mes" rowspan="2">Mes</th>${thHolders}</tr>
                        <tr class="tr-sub">${thSub}</tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                </table>
            </div>
        `);
        return this;
    },

    onToggle() {
        this.open = !this.open;
        this.$('.savings-panel-body').toggleClass('hidden', !this.open);
        this.$('.sav-chevron').text(this.open ? '▼' : '▶');
    }
});

export default SavingsPanelView;
