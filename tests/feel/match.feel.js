// FEEL used by processes/goods-receipt-match.bpmn, kept here so it can be tested on a real engine.
exports.matchCtx = `{
  supplier: (erpSuppliers[item.supplier_vat = invoice.supplier_vat])[1],
  po: if invoice.po_number != null then (erpPurchaseOrders[item.po_number = invoice.po_number])[1]
      else if supplier = null then null
      else (erpPurchaseOrders[item.supplier_id = supplier.supplier_id and item.status = "OPEN"])[1],
  grn: if po = null then null else (erpGoodsReceipts[item.po_number = po.po_number])[1]
}`;
exports.lineChecks = `for l in invoice.items return {
  product: l.product, volume: l.volume,
  lineSku: (erpProducts[item.product = l.product and item.volume = l.volume].sku)[1],
  poLine: if lineSku = null then null else (matchCtx.po.lines[item.sku = lineSku])[1],
  grnLine: if lineSku = null or matchCtx.grn = null then null else (matchCtx.grn.lines[item.sku = lineSku])[1],
  invoicedQty: l.quantity, invoicedPrice: l.unit_price,
  orderedQty: if poLine = null then 0 else poLine.quantity,
  poPrice: if poLine = null then null else poLine.unit_price,
  receivedQty: if grnLine = null then 0 else grnLine.received,
  damagedQty: if grnLine = null then 0 else grnLine.damaged,
  acceptedQty: receivedQty - damagedQty,
  substitutedWith: if grnLine = null then null else grnLine.substituted_with,
  issues: [
    if poLine = null then "NOT_ON_PO" else null,
    if poLine != null and invoicedQty > orderedQty then "QTY_ABOVE_PO" else null,
    if substitutedWith != null then "SUBSTITUTED" else null,
    if damagedQty > 0 then "DAMAGED" else null,
    if poLine != null and substitutedWith = null and receivedQty < invoicedQty then "SHORT_DELIVERED" else null,
    if poPrice != null and abs(invoicedPrice - poPrice) > 0.005 then "PRICE_VARIANCE" else null
  ][item != null],
  varianceAmount: decimal(max([0, invoicedQty - acceptedQty]) * invoicedPrice
                  + (if poPrice = null then 0 else max([0, invoicedPrice - poPrice]) * min([invoicedQty, acceptedQty])), 2)
}`;
exports.matchResult = `{
  status: if count(lineChecks[count(item.issues) > 0]) = 0 then "MATCHED" else "DISCREPANCY",
  supplierId: matchCtx.supplier.supplier_id,
  poNumber: matchCtx.po.po_number,
  grnNumber: matchCtx.grn.grn_number,
  outlet: matchCtx.po.outlet,
  discrepancies: for d in lineChecks[count(item.issues) > 0] return
    {sku: d.lineSku, product: d.product, issues: d.issues, invoicedQty: d.invoicedQty, orderedQty: d.orderedQty,
     receivedQty: d.receivedQty, acceptedQty: d.acceptedQty, invoicedPrice: d.invoicedPrice, poPrice: d.poPrice,
     substitutedWith: d.substitutedWith, varianceAmount: d.varianceAmount},
  varianceAmount: decimal(sum(for d in lineChecks return d.varianceAmount), 2),
  summary: if count(lineChecks[count(item.issues) > 0]) = 0 then "Invoice matches PO and goods receipt"
           else string join(for d in lineChecks[count(item.issues) > 0] return d.product + ": " + string join(d.issues, ", "), "; ")
}`;
exports.stockMovements = `for c in lineChecks[item.lineSku != null] return {sku: c.lineSku, qtyChange: c.acceptedQty}`;
