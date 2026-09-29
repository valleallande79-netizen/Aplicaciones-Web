/**
 * OptionSortService - orden alfabetico comun para opciones de combos.
 * No modifica las colecciones originales y, por tanto, no altera ids,
 * modelos ni preselecciones basadas en value.
 */
const COLLATOR = new Intl.Collator('es', {
    sensitivity: 'base',
    numeric: true,
    ignorePunctuation: true
});

const OptionSortService = {
    byText(items, getText) {
        return [...items].sort((left, right) =>
            COLLATOR.compare(
                String(getText(left) || '').trim(),
                String(getText(right) || '').trim()
            )
        );
    },

    modelsBy(modelCollection, attribute = 'name') {
        const models = modelCollection.models || modelCollection || [];
        return this.byText(models, model => model.get(attribute));
    },

    categories(categories) {
        return this.byText(categories, category => category.label);
    },

    namedObjects(items) {
        return this.byText(items, item => item.name);
    }
};

export default OptionSortService;
