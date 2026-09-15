const BAD_FINANCIAL = "('REFUNDED','PARTIALLY_REFUNDED','VOIDED')";
const BAD_RETURN = "('RETURNED','INSPECTION_COMPLETE')";
const GOOD_DELIVERY = "('DELIVERED','PICKED_UP','FULFILLED','MARKED_AS_FULFILLED')";

export function validOrderSql(alias = '') {
  const p = alias ? `${alias}.` : '';
  return `${p}cancelled=0
    AND UPPER(COALESCE(${p}financial_status,'')) NOT IN ${BAD_FINANCIAL}
    AND UPPER(COALESCE(${p}return_status,'NO_RETURN')) NOT IN ${BAD_RETURN}
    AND UPPER(COALESCE(${p}fulfillment_status,''))='FULFILLED'
    AND (COALESCE(${p}delivery_status,'')='' OR UPPER(${p}delivery_status) IN ${GOOD_DELIVERY})`;
}

export function isExcludedShopifyOrder(order: {
  cancelledAt?: string | null;
  displayFinancialStatus?: string | null;
  returnStatus?: string | null;
  displayFulfillmentStatus?: string | null;
  fulfillments?: { status?: string | null; displayStatus?: string | null; deliveredAt?: string | null }[] | null;
}) {
  const financial = String(order.displayFinancialStatus || '').toUpperCase();
  const returns = String(order.returnStatus || 'NO_RETURN').toUpperCase();
  const fulfillment = String(order.displayFulfillmentStatus || '').toUpperCase();
  const shipmentStatuses = (order.fulfillments || [])
    .map((f) => String(f?.displayStatus || '').toUpperCase())
    .filter(Boolean);
  const hasExplicitShipmentStatus = shipmentStatuses.length > 0;
  const shipmentCompleted = !hasExplicitShipmentStatus || shipmentStatuses.every((s) =>
    ['DELIVERED', 'PICKED_UP', 'FULFILLED', 'MARKED_AS_FULFILLED'].includes(s)
  );

  return Boolean(order.cancelledAt)
    || ['REFUNDED', 'PARTIALLY_REFUNDED', 'VOIDED'].includes(financial)
    || ['RETURNED', 'INSPECTION_COMPLETE'].includes(returns)
    || fulfillment !== 'FULFILLED'
    || !shipmentCompleted;
}

export function deliveryStatusFromOrder(order: {
  fulfillments?: { status?: string | null; displayStatus?: string | null; deliveredAt?: string | null }[] | null;
}) {
  const fulfillments = order.fulfillments || [];
  if (!fulfillments.length) return '';
  if (fulfillments.some((f) => f?.deliveredAt || String(f?.displayStatus || '').toUpperCase() === 'DELIVERED')) return 'DELIVERED';
  if (fulfillments.some((f) => String(f?.displayStatus || '').toUpperCase() === 'PICKED_UP')) return 'PICKED_UP';
  const statuses = fulfillments.map((f) => String(f?.displayStatus || '').toUpperCase()).filter(Boolean);
  if (statuses.every((s) => ['FULFILLED', 'MARKED_AS_FULFILLED'].includes(s))) return statuses[0] || '';
  return statuses.find((s) => !['FULFILLED', 'MARKED_AS_FULFILLED'].includes(s)) || statuses[0] || '';
}
