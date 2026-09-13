// Colección de registros de mantenimiento
var MaintenanceCollection = Backbone.Collection.extend({
    model: MaintenanceModel,

    initialize: function() {
        this.activeCarId = 'car1';
        this.on('add remove change', this.saveToStorage, this);
        this.loadFromStorage();
    },

    // Guardar en servidor
    saveToStorage: function() {
        fetch('/api/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.toJSON())
        }).catch(function(e) {
            console.error('Error guardando en servidor:', e);
        });
    },

    // Cargar desde servidor
    loadFromStorage: function() {
        var self = this;
        fetch('/api/maintenance')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (Array.isArray(data)) {
                    self.reset(data, { silent: true });
                    self.trigger('reset');
                }
            })
            .catch(function(e) {
                console.error('Error cargando datos del servidor:', e);
            });
    },

    // Cambiar coche activo
    setActiveCar: function(carId) {
        this.activeCarId = carId;
        this.trigger('carChanged');
    },

    // Obtener modelos filtrados por coche activo
    getActiveCar: function() {
        return this.filter(function(model) {
            return model.get('carId') === this.activeCarId;
        }, this);
    },

    // Ordenar por fecha (más reciente primero)
    comparator: function(model) {
        return -new Date(model.get('date')).getTime();
    },

    // Obtener estadísticas (filtradas por coche activo)
    getStats: function() {
        var activeCar = this.getActiveCar();

        var totalCost = _.reduce(activeCar, function(sum, model) {
            return sum + (parseFloat(model.get('cost')) || 0);
        }, 0);

        var lastOilChange = _.find(activeCar, function(model) {
            var description = model.get('type') || '';
            return description.toLowerCase().indexOf('aceite') !== -1;
        });

        var nextServiceDate = 'No programado';
        if (lastOilChange) {
            var lastDate = new Date(lastOilChange.get('date'));
            var nextDate = new Date(lastDate);
            nextDate.setMonth(nextDate.getMonth() + 18);
            nextServiceDate = nextDate.toLocaleDateString('es-ES');
        }

        return {
            total: activeCar.length,
            totalCost: totalCost,
            nextService: nextServiceDate,
            lastMileage: lastOilChange ? lastOilChange.get('mileage') : 0
        };
    },

    // Filtrar por tipo
    filterByType: function(type) {
        if (!type) return this;
        return new MaintenanceCollection(this.filter(function(model) {
            return model.get('type') === type;
        }));
    },

    // Buscar por texto
    search: function(query) {
        if (!query) return this;
        query = query.toLowerCase();
        return new MaintenanceCollection(this.filter(function(model) {
            return model.get('type').toLowerCase().indexOf(query) !== -1 ||
                   model.get('workshop').toLowerCase().indexOf(query) !== -1 ||
                   model.get('notes').toLowerCase().indexOf(query) !== -1;
        }));
    }
});
