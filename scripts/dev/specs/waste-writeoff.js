// Spec for processes/waste-writeoff.bpmn (staff-initiated write-off -> Approval Routing -> stock signal).
const MOCK_BASE = `if mockDataBaseUrl = null then "https://raw.githubusercontent.com/coder01128/camunda-invoice-orchestration/main/mock-data" else mockDataBaseUrl`;

module.exports = {
  id: "waste-writeoff",
  name: "Waste / Spoilage Write-off",
  doc: "Started from Tasklist (start form waste-writeoff) or API with {outlet, sku, quantity, reason, loggedBy, notes}. Priced at cost from the mock product list, approved via Approval Routing on value, then broadcasts stock-level-changed.",
  nodes: [
    { id: "Start_waste", type: "start", name: "Write-off logged", form: "waste-writeoff", col: 0, row: 0 },
    { id: "FetchCost", type: "service", name: "Look up unit cost (mock ERP)", col: 1, row: 0,
      mockUrl: `=(${MOCK_BASE}) + "/erp.json"`, resultExpression: "={erpProducts: response.body.products}" },
    { id: "PriceWriteOff", type: "script", name: "Price write-off", col: 2, row: 0, result: "writeOff",
      expr: `={wantedSku: sku, p: (erpProducts[item.sku = wantedSku])[1],
  outlet: outlet, sku: sku, product: p.product, quantity: quantity, unitCost: p.unit_cost,
  value: decimal(quantity * p.unit_cost, 2), reason: reason, loggedBy: loggedBy, notes: notes}`,
      doc: "FEEL note: inside a filter, a bare name resolves to the list item first, so the process variable sku is bound to wantedSku before filtering." },
    { id: "ApproveWriteOff", type: "call", name: "Approval Routing", process: "approval-routing", col: 3, row: 0,
      in: [["=writeOff.value", "amount"], ['="waste"', "category"],
           ['="Write-off: " + string(writeOff.quantity) + " x " + writeOff.product + " (" + writeOff.reason + "), logged by " + writeOff.loggedBy', "flagReason"],
           ["=false", "flagged"], ['="WASTE-" + writeOff.outlet + "-" + writeOff.sku', "sourceRef"], ['="Write-off: " + writeOff.product', "supplier"]],
      out: [["=approvalOutcome", "writeOffApproval"]] },
    { id: "Gw_approved", type: "gateway", name: "Approved?", col: 4, row: 0, default: "Flow_Gw_approved_End_rejected" },
    { id: "StockAdjusted", type: "signalThrow", name: "Stock written off", signal: "stock-level-changed", col: 5, row: 0,
      in: [["=[{sku: writeOff.sku, qtyChange: -writeOff.quantity}]", "stockMovements"], ["=writeOff.outlet", "outlet"],
           ['="waste-writeoff"', "source"], ['="WASTE-" + writeOff.outlet + "-" + writeOff.sku', "sourceRef"]] },
    { id: "End_written", type: "end", name: "Written off", col: 6, row: 0 },
    { id: "End_rejected", type: "end", name: "Write-off rejected", col: 5, row: 1 },
  ],
  edges: [
    { from: "Start_waste", to: "FetchCost" }, { from: "FetchCost", to: "PriceWriteOff" }, { from: "PriceWriteOff", to: "ApproveWriteOff" },
    { from: "ApproveWriteOff", to: "Gw_approved" },
    { from: "Gw_approved", to: "StockAdjusted", name: "approved", cond: "=writeOffApproval.approved = true" },
    { from: "Gw_approved", to: "End_rejected", name: "rejected" },
    { from: "StockAdjusted", to: "End_written" },
  ],
};
