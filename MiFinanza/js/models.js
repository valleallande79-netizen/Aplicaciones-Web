var Movimiento = Backbone.Model.extend({
    defaults: {
        concepto: "",
        cantidad: 0,
        tipo: "ingreso",
		categoria: "", // NUEVO
        fecha: new Date().toISOString().slice(0, 10) // YYYY-MM-DD por defecto
    }
});

