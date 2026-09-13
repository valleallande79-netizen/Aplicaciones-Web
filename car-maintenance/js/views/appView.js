// Vista principal de la aplicación
var AppView = Backbone.View.extend({
    el: '#main-content',

    template: _.template($('#app-template').html()),

    events: {
        'submit #maintenance-form':      'addMaintenance',
        'click .car-tab':                'switchCar',
        'click .btn-rename-car':         'renameCar',
        'click #btn-add-maintenance':    'openModal',
        'click .modal-overlay':          'closeModal',
        'click .modal-close':            'closeModal',
        'click .year-group-header':      'toggleYearGroup',
        'click #btn-toggle-filters':     'toggleFilterPanel',
        'click #btn-clear-filters':      'clearFilters',
        'change #filter-type':           'applyFilters',
        'change #filter-year':           'applyFilters',
        'input #filter-text':            'applyFilters'
    },

    initialize: function() {
        var self = this;
        this.carNames        = { car1: 'Coche 1', car2: 'Coche 2' };
        this.collapsedYears  = {};
        this.filters         = { type: '', year: '', text: '' };
        this.filterPanelOpen = false;

        this.collection = new MaintenanceCollection();
        this.listenTo(this.collection, 'add remove reset change', this.renderStats);
        this.listenTo(this.collection, 'add remove reset change', this.renderMaintenanceList);
        this.listenTo(this.collection, 'carChanged', this.onCarChanged);

        fetch('/api/car-names')
            .then(function(r) { return r.json(); })
            .then(function(names) {
                if (names && names.car1) self.carNames = names;
                self.render();
            })
            .catch(function() { self.render(); });
    },

    render: function() {
        var stats = this.collection.getStats();
        this.$el.html(this.template({
            totalMaintenance: stats.total,
            nextService:      stats.nextService
        }));
        this.renderCarTabs();
        this.renderFilterPanel();
        this.renderMaintenanceList();
        this.setTodayDate();
        return this;
    },

    // ── Car tabs ─────────────────────────────────────────────────────────────

    renderCarTabs: function() {
        var self = this;
        var activeCarId = this.collection.activeCarId;
        var html = '<div class="car-tabs-wrapper"><div class="car-tabs">';
        ['car1', 'car2'].forEach(function(carId) {
            var active = carId === activeCarId ? 'active' : '';
            html +=
                '<button class="car-tab ' + active + '" data-car="' + carId + '">' +
                '🚗 ' + self.carNames[carId] +
                '<span class="btn-rename-car" data-car="' + carId + '" title="Renombrar">✏️</span>' +
                '</button>';
        });
        html += '</div></div>';
        this.$('.dashboard').before(html);
    },

    onCarChanged: function() {
        this.$('.car-tab').removeClass('active');
        this.$('.car-tab[data-car="' + this.collection.activeCarId + '"]').addClass('active');
        this.updateFilterYearOptions();
        this.renderStats();
        this.renderMaintenanceList();
    },

    switchCar: function(e) {
        if ($(e.target).hasClass('btn-rename-car')) return;
        this.collection.setActiveCar($(e.currentTarget).data('car'));
    },

    renameCar: function(e) {
        e.stopPropagation();
        var self  = this;
        var carId = $(e.target).data('car');
        var name  = prompt('Nuevo nombre:', this.carNames[carId]);
        if (name && name.trim()) {
            this.carNames[carId] = name.trim();
            fetch('/api/car-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(self.carNames)
            }).catch(function(err) { console.error(err); });
            this.$('.car-tabs-wrapper').remove();
            this.renderCarTabs();
            this.onCarChanged();
        }
    },

    // ── Stats ─────────────────────────────────────────────────────────────────

    renderStats: function() {
        var stats = this.collection.getStats();
        this.$('.stat-number').first().text(stats.total);
        this.$('.stat-text').first().text(stats.nextService);
    },

    // ── Filter panel ──────────────────────────────────────────────────────────

    renderFilterPanel: function() {
        var panelHtml =
            '<button id="btn-toggle-filters" class="btn-toggle-filters' +
                (this._hasActiveFilters() ? ' has-filters' : '') + '">' +
                '<span class="filter-icon">⚙</span>' +
                '<span class="filter-btn-label">Filtros</span>' +
                (this._hasActiveFilters() ? '<span class="filter-dot"></span>' : '') +
            '</button>' +

            '<div id="filter-panel" class="filter-panel' + (this.filterPanelOpen ? ' open' : '') + '">' +
                '<div class="filter-panel-inner">' +
                    '<div class="filter-panel-header">' +
                        '<span class="filter-panel-title">🔍 Filtros</span>' +
                        '<button id="btn-clear-filters" class="btn-clear-filters">✕ Limpiar</button>' +
                    '</div>' +

                    '<div class="filter-group">' +
                        '<label class="filter-label">Tipo</label>' +
                        '<select id="filter-type" class="filter-select">' +
                            '<option value="">Todos los tipos</option>' +
                            '<option value="cambio-aceite">Cambio de Aceite</option>' +
                            '<option value="revision-frenos">Revisión de Frenos</option>' +
                            '<option value="cambio-filtros">Cambio de Filtros</option>' +
                            '<option value="revision-neumaticos-delanteros">Neumáticos Delanteros</option>' +
                            '<option value="revision-neumaticos-traseros">Neumáticos Traseros</option>' +
                            '<option value="inspeccion-general">ITV</option>' +
                            '<option value="urea">Cambio Ad-Blue</option>' +
                            '<option value="otros">Otros</option>' +
                        '</select>' +
                    '</div>' +

                    '<div class="filter-group">' +
                        '<label class="filter-label">Año</label>' +
                        '<select id="filter-year" class="filter-select">' +
                            '<option value="">Todos los años</option>' +
                        '</select>' +
                    '</div>' +

                    '<div class="filter-group">' +
                        '<label class="filter-label">Buscar texto</label>' +
                        '<input type="text" id="filter-text" class="filter-input"' +
                            ' placeholder="Taller, notas…" autocomplete="off">' +
                    '</div>' +

                    '<div id="filter-results-info" class="filter-results-info"></div>' +
                '</div>' +
            '</div>';

        this.$('.maintenance-list').before(panelHtml);

        // Restaurar valores
        if (this.filters.type) this.$('#filter-type').val(this.filters.type);
        if (this.filters.year) this.$('#filter-year').val(this.filters.year);
        if (this.filters.text) this.$('#filter-text').val(this.filters.text);

        this.updateFilterYearOptions();
    },

    updateFilterYearOptions: function() {
        var $sel = this.$('#filter-year');
        if (!$sel.length) return;
        var current = $sel.val();
        $sel.find('option:not(:first)').remove();
        this._getActiveYears().forEach(function(y) {
            $sel.append('<option value="' + y + '">' + y + '</option>');
        });
        if (current) $sel.val(current);
    },

    _getActiveYears: function() {
        var years = {};
        this.collection.getActiveCar().forEach(function(m) {
            years[new Date(m.get('date')).getFullYear()] = true;
        });
        return Object.keys(years).sort(function(a, b) { return b - a; });
    },

    toggleFilterPanel: function() {
        this.filterPanelOpen = !this.filterPanelOpen;
        this.$('#filter-panel').toggleClass('open', this.filterPanelOpen);
        this.$('#btn-toggle-filters').toggleClass('active', this.filterPanelOpen);
    },

    applyFilters: function() {
        this.filters.type = this.$('#filter-type').val();
        this.filters.year = this.$('#filter-year').val();
        this.filters.text = this.$('#filter-text').val().toLowerCase().trim();
        this._updateFilterToggleButton();
        this.renderMaintenanceList();
    },

    clearFilters: function() {
        this.filters = { type: '', year: '', text: '' };
        this.$('#filter-type').val('');
        this.$('#filter-year').val('');
        this.$('#filter-text').val('');
        this._updateFilterToggleButton();
        this.renderMaintenanceList();
    },

    _hasActiveFilters: function() {
        return !!(this.filters.type || this.filters.year || this.filters.text);
    },

    _updateFilterToggleButton: function() {
        var $btn = this.$('#btn-toggle-filters');
        var has  = this._hasActiveFilters();
        $btn.toggleClass('has-filters', has);
        $btn.find('.filter-dot').remove();
        if (has) $btn.append('<span class="filter-dot"></span>');
    },

    _applyFiltersToModels: function(models) {
        var f = this.filters;
        return models.filter(function(m) {
            if (f.type && m.get('type') !== f.type) return false;
            if (f.year && new Date(m.get('date')).getFullYear() != f.year) return false;
            if (f.text) {
                var hay = [m.get('workshop') || '', m.get('notes') || '', m.get('type') || '']
                    .join(' ').toLowerCase();
                if (hay.indexOf(f.text) === -1) return false;
            }
            return true;
        });
    },

    // ── Year grouping ─────────────────────────────────────────────────────────

    groupByYear: function(models) {
        var groups = {};
        models.forEach(function(m) {
            var y = new Date(m.get('date')).getFullYear();
            if (!groups[y]) groups[y] = [];
            groups[y].push(m);
        });
        return Object.keys(groups)
            .sort(function(a, b) { return b - a; })
            .map(function(y) { return { year: y, models: groups[y] }; });
    },

    // ── Main list render ──────────────────────────────────────────────────────

    renderMaintenanceList: function() {
        var self        = this;
        var $container  = this.$('#maintenance-items');
        $container.empty();

        var allModels = this.collection.getActiveCar();
        allModels.sort(function(a, b) {
            return new Date(b.get('date')) - new Date(a.get('date'));
        });

        var filtered    = this._applyFiltersToModels(allModels);
        var hasFilters  = this._hasActiveFilters();
        var currentYear = new Date().getFullYear();

        // Actualizar info de resultados en el panel
        var $info = this.$('#filter-results-info');
        if ($info.length) {
            $info.html(hasFilters
                ? '<span class="results-count">' + filtered.length + ' de ' + allModels.length + ' registros</span>'
                : '');
        }

        if (filtered.length === 0) {
            $container.html(
                '<div class="empty-state">' +
                    '<h3>' + (hasFilters ? 'Sin resultados' : 'No hay registros para este coche') + '</h3>' +
                    '<p>' + (hasFilters
                        ? 'Prueba a cambiar o limpiar los filtros.'
                        : 'Agrega el primer mantenimiento usando el botón de arriba.') +
                    '</p>' +
                '</div>'
            );
            return;
        }

        var yearGroups = this.groupByYear(filtered);

        // Botones expandir/colapsar todo (solo si >1 año)
        if (yearGroups.length > 1) {
            var $summary = $(
                '<div class="year-summary">' +
                    '<button class="btn-expand-all" id="btn-expand-all">Expandir todo</button>' +
                    '<button class="btn-collapse-all" id="btn-collapse-all">Colapsar todo</button>' +
                '</div>'
            );
            $container.append($summary);
            $summary.find('#btn-expand-all').on('click', function() {
                self.collapsedYears = {};
                self.renderMaintenanceList();
            });
            $summary.find('#btn-collapse-all').on('click', function() {
                yearGroups.forEach(function(g) { self.collapsedYears[g.year] = true; });
                self.renderMaintenanceList();
            });
        }

        yearGroups.forEach(function(group) {
            var year        = group.year;
            var isCollapsed = !!self.collapsedYears[year];
            var count       = group.models.length;
            var totalCost   = group.models.reduce(function(s, m) {
                return s + (parseFloat(m.get('cost')) || 0);
            }, 0);

            // Calcular total del año sin filtros para saber si está filtrado
            var totalInYear = allModels.filter(function(m) {
                return new Date(m.get('date')).getFullYear() == year;
            }).length;
            var isFiltered = hasFilters && count < totalInYear;

            var yearLabel =
                (parseInt(year) === currentYear
                    ? year + ' <span class="year-badge current">Año actual</span>'
                    : year) +
                (isFiltered
                    ? ' <span class="year-badge filtered">' + count + '/' + totalInYear + '</span>'
                    : '');

            var $group = $('<div class="year-group" data-year="' + year + '"></div>');

            $group.append(
                '<div class="year-group-header' + (isCollapsed ? ' collapsed' : '') +
                '" data-year="' + year + '">' +
                    '<div class="year-group-left">' +
                        '<span class="year-toggle-icon">' + (isCollapsed ? '▶' : '▼') + '</span>' +
                        '<span class="year-title">' + yearLabel + '</span>' +
                    '</div>' +
                    '<div class="year-group-meta">' +
                        '<span class="year-count">' + count + ' registro' + (count !== 1 ? 's' : '') + '</span>' +
                        (totalCost > 0
                            ? '<span class="year-cost">€' + totalCost.toFixed(2) + '</span>'
                            : '') +
                    '</div>' +
                '</div>'
            );

            var $items = $('<div class="year-group-items' + (isCollapsed ? ' hidden' : '') + '"></div>');
            group.models.forEach(function(m) {
                $items.append(new MaintenanceView({ model: m }).render().el);
            });

            $group.append($items);
            $container.append($group);
        });
    },

    toggleYearGroup: function(e) {
        var year = $(e.currentTarget).data('year');
        if (this.collapsedYears[year]) {
            delete this.collapsedYears[year];
        } else {
            this.collapsedYears[year] = true;
        }
        var collapsed = !!this.collapsedYears[year];
        $(e.currentTarget).toggleClass('collapsed', collapsed)
            .find('.year-toggle-icon').text(collapsed ? '▶' : '▼');
        $(e.currentTarget).next('.year-group-items').toggleClass('hidden', collapsed);
    },

    // ── Modal / form ──────────────────────────────────────────────────────────

    setTodayDate: function() {
        this.$('#date').val(new Date().toISOString().split('T')[0]);
    },

    openModal: function() {
        this.$('#maintenance-modal').addClass('active');
    },

    closeModal: function(e) {
        if (e && e.target !== e.currentTarget) return;
        this.$('#maintenance-modal').removeClass('active');
    },

    addMaintenance: function(e) {
        e.preventDefault();
        var maintenance = new MaintenanceModel({
            carId:    this.collection.activeCarId,
            type:     this.$('#type').val(),
            date:     this.$('#date').val(),
            mileage:  parseInt(this.$('#mileage').val()),
            cost:     parseFloat(this.$('#cost').val()) || 0,
            workshop: this.$('#workshop').val(),
            notes:    this.$('#notes').val()
        });
        if (maintenance.isValid()) {
            this.collection.add(maintenance);
            this.clearForm();
            this.closeModal();
            this.updateFilterYearOptions();
            this.showSuccessMessage('Mantenimiento agregado correctamente');
        } else {
            this.showErrorMessage(maintenance.validationError.join(', '));
        }
    },

    clearForm: function() {
        this.$('#maintenance-form')[0].reset();
        this.setTodayDate();
    },

    // ── Notifications ─────────────────────────────────────────────────────────

    showSuccessMessage: function(msg) { this.showMessage(msg, 'success'); },
    showErrorMessage:   function(msg) { this.showMessage(msg, 'error'); },

    showMessage: function(message, type) {
        this.$('.message').remove();
        var $m = $(
            '<div class="message" style="position:fixed;top:20px;right:20px;' +
            'background:' + (type === 'success' ? '#4CAF50' : '#f44336') + ';' +
            'color:white;padding:1rem 2rem;border-radius:8px;' +
            'box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:3000;max-width:300px;">' +
            message + '</div>'
        );
        $('body').append($m);
        setTimeout(function() { $m.fadeOut(300, function() { $m.remove(); }); }, 3000);
    }
});
