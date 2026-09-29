/** Candidatos y validación de devoluciones manuales. */
const ReturnValidationService = {
  candidates(attrs, transactions, editingId=null) {
    if (!attrs.accountId || !attrs.holderId || !attrs.date || !attrs.amount) return [];
    const cents=Math.round(Number(attrs.amount)*100), date=new Date(`${attrs.date}T12:00:00`);
    const linked=new Set(transactions.filter(t=>t.get('type')==='return' && t.id!==editingId).map(t=>t.get('originalTransactionId')).filter(Boolean));
    const splitParentIds=new Set(transactions.filter(t=>t.get('parentTransactionId')).map(t=>t.get('parentTransactionId')));
    return transactions.filter(e=>e.get('type')==='expense' && !splitParentIds.has(e.id) && e.get('accountId')===attrs.accountId && e.get('holderId')===attrs.holderId && Math.round(Number(e.get('amount'))*100)===cents && new Date(`${e.get('date')}T12:00:00`)<=date && !linked.has(e.id)).sort((a,b)=>b.get('date').localeCompare(a.get('date')));
  },
  validate(attrs, transactions, editingId=null) {
    const e=transactions.get(attrs.originalTransactionId);
    if (!e || e.get('type')!=='expense') return 'Selecciona el gasto original de la devolución';
    return this.candidates(attrs,transactions,editingId).some(x=>x.id===e.id) ? null : 'El gasto debe tener la misma cuenta, titular e importe, una fecha igual o anterior y no estar ya devuelto';
  }
};
export default ReturnValidationService;
