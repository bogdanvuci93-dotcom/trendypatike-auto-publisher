const BAD_FINANCIAL = "('REFUNDED','PARTIALLY_REFUNDED','VOIDED')";
const BAD_RETURN = "('RETURNED','INSPECTION_COMPLETE')";

export function validOrderSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}cancelled=0 AND UPPER(COALESCE(${p}financial_status,'')) NOT IN ${BAD_FINANCIAL} AND UPPER(COALESCE(${p}return_status,'NO_RETURN')) NOT IN ${BAD_RETURN}`;
}

export function isExcludedShopifyOrder(order: {
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  returnStatus?: string | null;
}) {
  const financial = String(order.displayFinancialStatus || '').toUpperCase();
  const returns = String(order.returnStatus || 'NO_RETURN').toUpperCase();
  return Boolean(order.cancelledAt)
    || ['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED'].includes(financial)
    || ['RETURNED', 'INSPECTION_COMPLETE'].includes(returns);
}
