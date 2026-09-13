var Movimientos = Backbone.Collection.extend({
    model: Movimiento,
    localStorage: new Backbone.LocalStorage("MiFinanzasDB"),

    // Ordenar por fecha descendente (más reciente primero)
    comparator: function (m) {
        var fecha = m.get("fecha");
        return fecha ? -new Date(fecha).getTime() : 0;
    }
});