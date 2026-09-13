/**
 * AppRouter — Controlador de navegación (patrón MVC clásico de Backbone:
 * el Router ES el controlador; las Views son "vista + parte de controlador
 * de UI local"; los Models/Collections son el Modelo).
 *
 * Traduce la URL (#/cuenta/:id, #/cuenta/:id/titular/:hid) a llamadas
 * sobre AppView, permitiendo compartir enlaces directos a una vista
 * concreta y usar atrás/adelante del navegador.
 */
const AppRouter = Backbone.Router.extend({
    routes: {
        '':                                'showAll',
        'cuenta/:accId':                   'showAccount',
        'cuenta/:accId/titular/:holderId': 'showAccountHolder'
    },

    initialize(options) {
        this.appView = options.appView;
    },

    showAll() {
        this.appView.setActiveAccount('all');
    },

    showAccount(accId) {
        this.appView.setActiveAccount(accId);
    },

    showAccountHolder(accId, holderId) {
        this.appView.setActiveAccount(accId);
        this.appView.setActiveHolder(holderId);
    }
});

export default AppRouter;
