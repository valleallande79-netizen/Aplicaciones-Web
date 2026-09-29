/**
 * ReturnDetectionService — identifica devoluciones totales.
 * SRP: solo compara un ingreso positivo con gastos anteriores.
 */
const DEFAULT_POLICY = Object.freeze({ maximumDays: 90, minimumSimilarity: 0.35 });
const STOP_WORDS = new Set(['pago','compra','tarjeta','cargo','abono','devolucion','reembolso','reintegro','operacion','movimiento','recibo','eur','euros','en','de','del','la','el','los','las','es','sl','sa','com']);
const ReturnDetectionService = {
  normalizeWords(text) { return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w)); },
  descriptionSimilarity(a, b) { const left = new Set(this.normalizeWords(a)); const right = new Set(this.normalizeWords(b)); if (!left.size || !right.size) return 0; return [...left].filter(w => right.has(w)).length / Math.min(left.size, right.size); },
  findMatch(attrs, transactions, policy = DEFAULT_POLICY) {
    if (!attrs || attrs.type !== 'income' || !attrs.accountId || !attrs.holderId) return null;
    const cents = Math.round(Number(attrs.amount) * 100); const returnDate = new Date(`${attrs.date}T12:00:00`);
    if (!cents || Number.isNaN(returnDate.getTime())) return null;
    const splitParentIds = new Set(transactions.filter(t => t.get('parentTransactionId')).map(t => t.get('parentTransactionId')));
    const candidates = transactions.filter(t => {
      if (t.get('type') !== 'expense' || splitParentIds.has(t.id) || t.get('accountId') !== attrs.accountId || t.get('holderId') !== attrs.holderId) return false;
      if (Math.round(Number(t.get('amount')) * 100) !== cents || this._isAlreadyReturned(t.id, transactions)) return false;
      const days = (returnDate - new Date(`${t.get('date')}T12:00:00`)) / 86400000;
      return days >= 0 && days <= policy.maximumDays;
    }).map(transaction => ({ transaction, similarity: this.descriptionSimilarity(attrs.description, transaction.get('description')), days: (returnDate - new Date(`${transaction.get('date')}T12:00:00`)) / 86400000 }))
      .filter(x => x.similarity >= policy.minimumSimilarity).sort((a,b) => b.similarity - a.similarity || a.days - b.days);
    if (!candidates.length) return null;
    if (candidates[1] && candidates[0].similarity === candidates[1].similarity && candidates[0].days === candidates[1].days) return null;
    return candidates[0];
  },
  classify(attrs, match, source = 'automatic') { const original = match.transaction; return { ...attrs, type: 'return', category: original.get('category'), originalTransactionId: original.id, returnDetection: { source, confidence: match.similarity, status: 'confirmed' } }; },
  _isAlreadyReturned(expenseId, transactions) { return transactions.some(t => t.get('type') === 'return' && t.get('originalTransactionId') === expenseId); }
};
export { DEFAULT_POLICY };
export default ReturnDetectionService;
