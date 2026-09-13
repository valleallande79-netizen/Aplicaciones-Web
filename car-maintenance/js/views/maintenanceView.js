// Vista para un registro individual de mantenimiento
var MaintenanceView = Backbone.View.extend({
    tagName: 'div',
    className: 'maintenance-item',
    
    template: _.template($('#maintenance-template').html()),

    events: {
        'click .btn-edit': 'editMaintenance',
        'click .btn-delete': 'deleteMaintenance'
    },

    initialize: function() {
        this.listenTo(this.model, 'change', this.render);
        this.listenTo(this.model, 'destroy', this.remove);
    },

    render: function() {
        var data = this.model.toJSON();
        data.date = this.model.getFormattedDate();
        this.$el.html(this.template(data));
        return this;
    },

    editMaintenance: function(e) {
        e.preventDefault();
        // Aquí podrías abrir un modal o formulario de edición
        // Por simplicidad, usaremos prompts
        this.openEditForm();
    },

    openEditForm: function() {
        var model = this.model;
        
        // Crear un formulario de edición simple
        var editHtml = `
            <div class="edit-form" style="background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000; max-width: 500px; width: 90%;">
                <h3>Editar Mantenimiento</h3>
                <form id="edit-maintenance-form">
                    <input type="hidden" id="edit-id" value="${model.get('id')}">
                    <div style="margin-bottom: 1rem;">
                        <label>Tipo:</label>
                        <select id="edit-type" style="width: 100%; padding: 0.5rem;">
                            <option value="cambio-aceite" ${model.get('type') === 'cambio-aceite' ? 'selected' : ''}>Cambio de Aceite</option>
                            <option value="revision-frenos" ${model.get('type') === 'revision-frenos' ? 'selected' : ''}>Revisión de Frenos</option>
                            <option value="cambio-filtros" ${model.get('type') === 'cambio-filtros' ? 'selected' : ''}>Cambio de Filtros (GASOLEO,AIRE)</option>
                            <option value="revision-neumaticos-delanteros" ${model.get('type') === 'revision-neumaticos-delanteros' ? 'selected' : ''}>Cambio de Neumáticos DELANTEROS</option>
							<option value="revision-neumaticos-traseros" ${model.get('type') === 'revision-neumaticos-traseros' ? 'selected' : ''}>Cambio de Neumáticos TRASEROS</option>
                            <option value="inspeccion-general" ${model.get('type') === 'inspeccion-general' ? 'selected' : ''}>ITV</option>
							<option value="urea" ${model.get('type') === 'urea' ? 'selected' : ''}>Cambio Ad-Blue</option>
                            <option value="otros" ${model.get('type') === 'otros' ? 'selected' : ''}>Otros</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>Fecha:</label>
                        <input type="date" id="edit-date" value="${model.get('date')}" style="width: 100%; padding: 0.5rem;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>Kilometraje:</label>
                        <input type="number" id="edit-mileage" value="${model.get('mileage')}" style="width: 100%; padding: 0.5rem;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>Costo (€):</label>
                        <input type="number" step="0.01" id="edit-cost" value="${model.get('cost')}" style="width: 100%; padding: 0.5rem;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>Taller:</label>
                        <input type="text" id="edit-workshop" value="${model.get('workshop')}" style="width: 100%; padding: 0.5rem;">
                    </div>
                    <div style="margin-bottom: 1rem;">
                        <label>Notas:</label>
                        <textarea id="edit-notes" rows="3" style="width: 100%; padding: 0.5rem;">${model.get('notes')}</textarea>
                    </div>
                    <div style="text-align: right;">
                        <button type="button" id="cancel-edit" style="margin-right: 1rem; padding: 0.5rem 1rem; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Cancelar</button>
                        <button type="submit" style="padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Guardar</button>
                    </div>
                </form>
            </div>
            <div class="overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999;"></div>
        `;
        
        $('body').append(editHtml);
        
        // Event listeners para el formulario de edición
        $('#cancel-edit, .overlay').on('click', function() {
            $('.edit-form, .overlay').remove();
        });
        
        $('#edit-maintenance-form').on('submit', function(e) {
            e.preventDefault();
            
            var updatedData = {
                type: $('#edit-type').val(),
                date: $('#edit-date').val(),
                mileage: parseInt($('#edit-mileage').val()),
                cost: parseFloat($('#edit-cost').val()) || 0,
                workshop: $('#edit-workshop').val(),
                notes: $('#edit-notes').val()
            };
            
            model.set(updatedData);
            $('.edit-form, .overlay').remove();
        });
    },

    deleteMaintenance: function(e) {
        e.preventDefault();
        if (confirm('¿Estás seguro de que quieres eliminar este registro?')) {
            this.model.destroy();
        }
    }
});
