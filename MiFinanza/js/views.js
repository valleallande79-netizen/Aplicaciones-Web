var FilaView = Backbone.View.extend({
    tagName: "tr",
    template: null,

    events: {
        "click .eliminar": "eliminar",
        "blur .celda": "actualizar",
        "change .tipo": "actualizar",
        "change .fecha": "actualizar",
		"change .categoria": "actualizar"

    },

    initialize: function () {
        var self = this;

        if (!FilaView.cachedTemplate) {
            $.get("js/templates/fila.html", function (tpl) {
                FilaView.cachedTemplate = _.template(tpl);
                self.template = FilaView.cachedTemplate;
                self.render();
            });
        } else {
            this.template = FilaView.cachedTemplate;
        }

        this.listenTo(this.model, "change", this.render);
        this.listenTo(this.model, "destroy", this.remove);
    },

    render: function () {
        if (!this.template) return this;
        this.$el.html(this.template(this.model.toJSON()));
		// 🔥 Asegurar que la clase ingreso/gasto se actualiza correctamente 
		const tipo = this.model.get("tipo"); 
		const celda = this.$(".cantidad"); 
		celda.removeClass("ingreso gasto"); 
		celda.addClass(tipo);
        return this;
    },

    actualizar: function () {
        let raw = this.$(".cantidad").text().replace("€", "").replace("-", "").trim();

        this.model.set({
            concepto: this.$(".concepto").text(),
            cantidad: parseFloat(raw) || 0,
            tipo: this.$(".tipo").val(),
			categoria: this.$(".categoria").val(),
            fecha: this.$(".fecha").val()
        });
		console.log("Guardando categoría:", this.$(".categoria").val());
        this.model.save();
        this.trigger("updateTotal");
    },

    eliminar: function () {
        this.model.destroy();
        this.trigger("updateTotal");
    }
});


var GridView = Backbone.View.extend({
    el: "#grid",

    initialize: function () {
        this.listenTo(this.collection, "add", this.agregarFila);
        this.listenTo(this.collection, "reset", this.render);
        this.listenTo(this.collection, "change:fecha", this.reordenar);
		this.listenTo(Backbone, "filtros:cambiados", this.calcularTotalFiltrado);

    },

    render: function () {
        this.$el.empty();
        this.collection.each(this.agregarFila, this);
        return this;
    },

    agregarFila: function (mov) {
        var fila = new FilaView({ model: mov });
        this.listenTo(fila, "updateTotal", this.calcularTotal);
        this.$el.append(fila.render().el);
        this.calcularTotal();
    },

    reordenar: function () {
        this.collection.sort();
        this.render();
    },

    /* calcularTotal: function () {
        var total = 0;
        this.collection.each(function (m) {
            var cant = parseFloat(m.get("cantidad")) || 0;
            total += m.get("tipo") === "ingreso" ? cant : -cant;
        });
        $("#total").text(total.toFixed(2));
    }, */
	
	calcularTotal: function () {
		var total = 0;
		var totalIngresos = 0;
		var totalGastos = 0;

		this.collection.each(function (m) {
			var cant = parseFloat(m.get("cantidad")) || 0;
			if (m.get("tipo") === "ingreso") {
				total += cant;
				totalIngresos += cant;
			} else {
				total -= cant;
				totalGastos += cant;
			}
		});

		// mantener el comportamiento original para #total (saldo neto)
		$("#total").text(total.toFixed(2));

		// nuevos elementos: ingresos y gastos
		$("#totalIngresos").text(totalIngresos.toFixed(2));
		$("#totalGastos").text(totalGastos.toFixed(2));
		$("#totalIngresos, #totalGastos, #total").css({ "font-size": "1.25rem", "font-weight": "600" });
		// aplicar clase según signo (mínimos cambios) 
		$("#total").removeClass("positivo negativo"); 
		if (total > 0) { 
			$("#total").addClass("positivo"); 
		} else if (total < 0) { 
			$("#total").addClass("negativo"); 
		}

	},

	
	calcularTotalFiltrado: function () {
		var total = 0;
		var totalIngresos = 0;
		var totalGastos = 0;

		$("#grid tr:visible").each(function () {
			var $tr = $(this);

			var cantidadRaw = $tr.find(".cantidad").text()
				.replace("€", "")
				.replace("-", "")
				.trim();

			var cantidad = parseFloat(cantidadRaw) || 0;
			var tipo = $tr.find(".tipo").val();

			if (tipo === "ingreso") {
				total += cantidad;
				totalIngresos += cantidad;
			} else {
				total -= cantidad;
				totalGastos += cantidad;
			}
		});

		$("#total").text(total.toFixed(2));
		$("#totalIngresos").text(totalIngresos.toFixed(2));
		$("#totalGastos").text(totalGastos.toFixed(2));
		$("#totalIngresos, #totalGastos, #total").css({ "font-size": "1.25rem", "font-weight": "600" });
		// aplicar clase según signo (mínimos cambios) 
		$("#total").removeClass("positivo negativo"); 
		if (total > 0) { 
			$("#total").addClass("positivo"); 
		} else if (total < 0) { 
			$("#total").addClass("negativo"); 
		}
		
	}


});



var FilterView = Backbone.View.extend({
    el: "#filters",
    template: null,

    events: {
        "input #filtroConcepto": "aplicarFiltros",
        "change #filtroDesde": "aplicarFiltros",
        "change #filtroHasta": "aplicarFiltros",
        "change #filtroTipo": "aplicarFiltros",       // nuevo: filtro por tipo (ingreso/gasto/todos)
        "change #filtroCategoria": "aplicarFiltros", // nuevo: filtro por categoría
        "click #btnLimpiarFiltros": "limpiarFiltros"
    },

    initialize: function () {
        var self = this;

        $.get("js/templates/filters.html", function (tpl) {
            self.template = _.template(tpl);
            self.render();
        });

        // Si se pasó la colección, reaplicar filtros cuando cambie
        if (this.collection) {
            this.listenTo(this.collection, "reset add change remove", this.aplicarFiltros);
        }
    },

    render: function () {
		if (!this.template) return this;
		this.$el.html(this.template());

		// --- Inicio: ajuste mínimo para mantener hasta >= desde ---
		var self = this;
		var $desde = this.$("#filtroDesde");
		var $hasta = this.$("#filtroHasta");

		// Inicializar atributos min/max
		if ($desde.val()) $hasta.attr("min", $desde.val());
		if ($hasta.val()) $desde.attr("max", $hasta.val());

		// Cuando cambia "desde", asegurar que "hasta" sea >= "desde"
		$desde.off("change.enforce").on("change.enforce", function () {
			var desdeVal = $desde.val();
			if (desdeVal) {
				$hasta.attr("min", desdeVal);
				if ($hasta.val() && $hasta.val() < desdeVal) {
					$hasta.val(desdeVal);
				}
			} else {
				$hasta.removeAttr("min");
			}
			// reaplicar filtros tras ajuste
			self.aplicarFiltros();
		});
	
		// Cuando cambia "hasta", asegurar que "desde" sea <= "hasta"
		$hasta.off("change.enforce").on("change.enforce", function () {
			var hastaVal = $hasta.val();
			if (hastaVal) {
				$desde.attr("max", hastaVal);
				if ($desde.val() && $desde.val() > hastaVal) {
					$desde.val(hastaVal);
				}
			} else {
				$desde.removeAttr("max");
			}
			// reaplicar filtros tras ajuste
			self.aplicarFiltros();
		});
		// --- Fin: ajuste mínimo ---
		return this;
	},


    aplicarFiltros: function () {
        var concepto = (this.$("#filtroConcepto").val() || "").toLowerCase();
        var desde = this.$("#filtroDesde").val();
        var hasta = this.$("#filtroHasta").val();
        var tipoFiltro = this.$("#filtroTipo").val(); // e.g., "", "ingreso", "gasto"
        var categoriaFiltro = (this.$("#filtroCategoria").val() || "").toLowerCase();

        $("#grid tr").each(function () {
            var $tr = $(this);

            var textoConcepto = $tr.find(".concepto").text().toLowerCase();
            var fecha = $tr.find(".fecha").val(); // input[type=date] en la fila
            var tipo = $tr.find(".tipo").val();   // select tipo en la fila
            var categoria = ($tr.find(".categoria").val() || "").toLowerCase();

            var coincide = true;

            // Filtro por concepto (subcadena)
            if (concepto && !textoConcepto.includes(concepto)) {
                coincide = false;
            }

            // Filtro por tipo (si se seleccionó uno)
            if (tipoFiltro && tipoFiltro !== "" && tipo !== tipoFiltro) {
                coincide = false;
            }

            // Filtro por categoría (subcadena)
            if (categoriaFiltro && !categoria.includes(categoriaFiltro)) {
                coincide = false;
            }

            // Filtro por fecha (desde/hasta) - comparaciones inclusivas
            if (desde && fecha) {
                if (fecha < desde) coincide = false;
            } else if (desde && !fecha) {
                // si la fila no tiene fecha y hay filtro desde, excluirla
                coincide = false;
            }

            if (hasta && fecha) {
                if (fecha > hasta) coincide = false;
            } else if (hasta && !fecha) {
                coincide = false;
            }

            $tr.toggle(coincide);
        });

        // Recalcular total solo con filas visibles
        Backbone.trigger("filtros:cambiados");
    },

    limpiarFiltros: function () {
        this.$("#filtroConcepto").val("");
        this.$("#filtroDesde").val("");
        this.$("#filtroHasta").val("");
        this.$("#filtroTipo").val("");       // limpiar tipo
        this.$("#filtroCategoria").val("");  // limpiar categoría
        this.aplicarFiltros();
    }
});


