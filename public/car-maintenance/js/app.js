// Inicialización de la aplicación
$(document).ready(function() {
    // Verificar que las dependencias estén cargadas
    if (typeof Backbone === 'undefined') {
        console.error('Backbone.js no está cargado');
        return;
    }
    
    if (typeof _ === 'undefined') {
        console.error('Underscore.js no está cargado');
        return;
    }
    
    if (typeof $ === 'undefined') {
        console.error('jQuery no está cargado');
        return;
    }
    
    // Configurar Backbone.LocalStorage si está disponible
    if (typeof Backbone.LocalStorage === 'undefined') {
        // Implementación simple de LocalStorage para Backbone
        Backbone.LocalStorage = function(name) {
            this.name = name;
        };
        
        Backbone.LocalStorage.prototype = {
            create: function(model) {
                return this.save(model);
            },
            
            update: function(model) {
                return this.save(model);
            },
            
            save: function(model) {
                var data = this.getData();
                data[model.id || model.cid] = model.toJSON();
                localStorage.setItem(this.name, JSON.stringify(data));
                return model.toJSON();
            },
            
            find: function(model) {
                var data = this.getData();
                return data[model.id];
            },
            
            findAll: function() {
                var data = this.getData();
                return _.values(data);
            },
            
            destroy: function(model) {
                var data = this.getData();
                delete data[model.id];
                localStorage.setItem(this.name, JSON.stringify(data));
                return model.toJSON();
            },
            
            getData: function() {
                var data = localStorage.getItem(this.name);
                return data ? JSON.parse(data) : {};
            }
        };
        
        // Sync method
        Backbone.LocalStorage.sync = function(method, model, options) {
            var store = model.localStorage || model.collection.localStorage;
            var resp, errorMessage;
            
            try {
                switch (method) {
                    case 'read':
                        resp = model.id ? store.find(model) : store.findAll();
                        break;
                    case 'create':
                        resp = store.create(model);
                        break;
                    case 'update':
                        resp = store.update(model);
                        break;
                    case 'delete':
                        resp = store.destroy(model);
                        break;
                }
            } catch (error) {
                if (error.code === 22 && store._storageSize() === 0) {
                    errorMessage = "Private browsing is unsupported";
                } else {
                    errorMessage = error.message;
                }
            }
            
            if (resp) {
                if (options && options.success) {
                    options.success(resp);
                }
                if (model.trigger) {
                    model.trigger('sync', model, resp, options);
                }
            } else {
                errorMessage = errorMessage ? errorMessage : "Record Not Found";
                if (options && options.error) {
                    options.error(errorMessage);
                }
                if (model.trigger) {
                    model.trigger('error', model, errorMessage, options);
                }
            }
            
            return resp;
        };
        
        // Override Backbone.sync
        Backbone.sync = function(method, model, options) {
            if (model.localStorage || (model.collection && model.collection.localStorage)) {
                return Backbone.LocalStorage.sync.apply(this, [method, model, options]);
            } else {
                return Backbone.ajaxSync.apply(this, arguments);
            }
        };
    }
    
    // Inicializar la aplicación
    window.app = new AppView();
    
    console.log('Aplicación de mantenimiento del coche inicializada correctamente');
});

// Funciones globales útiles
window.CarMaintenance = {
    // Exportar datos
    exportData: function() {
        if (window.app && window.app.collection) {
            var data = window.app.collection.toJSON();
            var jsonStr = JSON.stringify(data, null, 2);
            
            var blob = new Blob([jsonStr], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            
            var a = document.createElement('a');
            a.href = url;
            a.download = 'mantenimiento-coche-' + new Date().toISOString().split('T')[0] + '.json';
            a.click();
            
            URL.revokeObjectURL(url);
        }
    },
    
    // Importar datos
    importData: function(file) {
        if (!file || !window.app) return;
        
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var data = JSON.parse(e.target.result);
                if (Array.isArray(data)) {
                    window.app.collection.reset(data);
                    window.app.showSuccessMessage('Datos importados correctamente');
                } else {
                    window.app.showErrorMessage('Formato de archivo inválido');
                }
            } catch (error) {
                window.app.showErrorMessage('Error al leer el archivo');
            }
        };
        reader.readAsText(file);
    },
    
    // Limpiar todos los datos
    clearAllData: function() {
        if (confirm('¿Estás seguro de que quieres eliminar todos los datos? Esta acción no se puede deshacer.')) {
            localStorage.removeItem('car-maintenance-data');
            if (window.app && window.app.collection) {
                window.app.collection.reset();
                window.app.showSuccessMessage('Todos los datos han sido eliminados');
            }
        }
    }
};
