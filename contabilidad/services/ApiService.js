/**
 * ApiService — envoltorio fino sobre las colecciones para el arranque inicial.
 * Con Backbone.sync ya integrado en las Collections (persist()/fetch()),
 * este servicio solo coordina la carga concurrente inicial.
 */
const ApiService = {
    async bootstrap(accountCollection, transactionCollection, categoryCollection) {
        await Promise.all([
            accountCollection.fetch(),
            transactionCollection.fetch(),
            categoryCollection ? categoryCollection.fetch() : Promise.resolve()
        ]);
        accountCollection.ensureDefault();
    }
};

export default ApiService;
