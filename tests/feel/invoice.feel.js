// FEEL used by processes/invoice-to-pay.bpmn (kept here for engine tests).
exports.validation = `{
  items: if invoice.items = null then [] else invoice.items,
  lineErrors: for l in items return
    if abs(l.quantity * l.unit_price - l.line_total) > 0.01
    then "Line " + string(l.line_number) + " (" + l.product + "): quantity x unit price does not equal line total" else null,
  errors: concatenate(
    if invoice.invoice_number = null or invoice.invoice_number = "" then ["Missing invoice number"] else [],
    if invoice.supplier_vat = null or invoice.supplier_vat = "" then ["Missing supplier VAT number"] else [],
    if count(items) = 0 then ["No line items"] else [],
    lineErrors[item != null],
    if abs(sum(concatenate([0], for l in items return l.line_total)) - invoice.subtotal) > 0.01 then ["Line totals do not add up to the subtotal"] else [],
    if abs(invoice.subtotal * 0.15 - invoice.vat_amount) > 0.01 then ["VAT is not 15% of the subtotal"] else [],
    if abs(invoice.subtotal + invoice.vat_amount - invoice.total_due) > 0.01 then ["Subtotal + VAT does not equal the total due"] else []
  ),
  valid: count(errors) = 0
}`;
exports.duplicateCheck = `{
  wantedVat: invoice.supplier_vat,
  wantedNumber: invoice.invoice_number,
  supplierHistory: erpInvoiceHistory[item.supplier_vat = wantedVat],
  exactMatches: supplierHistory[item.invoice_number = wantedNumber],
  isDuplicate: count(exactMatches) > 0
}`;
exports.approvalRequest = `{
  aiFlags: if agent.responseJson.flags = null then [] else agent.responseJson.flags,
  matchFlagged: matchResult.status != "MATCHED",
  aiFlagged: count(aiFlags) > 0,
  flagged: matchFlagged or aiFlagged,
  reasons: concatenate(
    if matchFlagged then ["3-way match: " + matchResult.summary + " (variance R" + string(matchResult.varianceAmount) + ")"] else [],
    for f in aiFlags return "AI: " + f.detail
  ),
  flagReason: if count(reasons) = 0 then "Clean 3-way match; AI review found no issues" else string join(reasons, " | ")
}`;
exports.payment = `{
  months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  parts: if invoice.due_date = null then [] else split(invoice.due_date, " "),
  monthNo: if count(parts) = 3 then index of(months, parts[2])[1] else null,
  dueDate: if monthNo = null then null else date(number(parts[3]), monthNo, number(parts[1])),
  payOn: if dueDate = null then today() else dueDate,
  amount: invoice.total_due,
  supplier: invoice.supplier_name,
  invoiceNumber: invoice.invoice_number,
  note: if dueDate = null then "Due date could not be read from the invoice - scheduled for the next run" else "Scheduled for due date"
}`;
