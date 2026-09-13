// Modelo para un registro de mantenimiento
var MaintenanceModel = Backbone.Model.extend({
    defaults: {
        carId: 'car1',
        type: '',
        date: '',
        mileage: 0,
        cost: 0,
        workshop: '',
        notes: '',
        createdAt: null
    },

    initialize: function() {
        if (!this.get('id')) {
            this.set('id', this.generateId());
        }
        if (!this.get('createdAt')) {
            this.set('createdAt', new Date().toISOString());
        }
    },

    generateId: function() {
        return 'maintenance_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    validate: function(attrs) {
        var errors = [];
        
        if (!attrs.type) {
            errors.push('El tipo de mantenimiento es requerido');
        }
        
        if (!attrs.date) {
            errors.push('La fecha es requerida');
        }
        
        if (!attrs.mileage || attrs.mileage <= 0) {
            errors.push('El kilometraje debe ser mayor a 0');
        }
        
        if (attrs.cost < 0) {
            errors.push('El costo no puede ser negativo');
        }
        
        return errors.length > 0 ? errors : false;
    },

    // Formatear el tipo para mostrar
    getFormattedType: function() {
        var types = {
            'cambio-aceite': 'Cambio de Aceite',
            'revision-frenos': 'Revisión de Frenos',
            'cambio-filtros': 'Cambio de Filtros',
            'revision-neumaticos-delanteros': 'Cambio de Neumáticos DELANTEROS',
			'revision-neumaticos-traseros': 'Cambio de Neumáticos TRASEROS',
            'inspeccion-general': 'ITV',
			'urea': 'Cambio Ad-Blue',
            'otros': 'Otros'
        };
        return types[this.get('type')] || this.get('type');
    },

    // Formatear la fecha
    getFormattedDate: function() {
        var date = new Date(this.get('date'));
        return date.toLocaleDateString('es-ES');
    }
});
