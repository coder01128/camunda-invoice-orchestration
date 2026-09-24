// Spec for processes/stock-reorder.bpmn (loop-closer, started by the stock-level-changed signal).
const MOCK_BASE = `if mockDataBaseUrl = null then "https://raw.githubusercontent.com/coder01128/camunda-invoice-orchestration/main/mock-data" else mockDataBaseUrl`;

const reorderCheck = `{
  checks: for m in stockMovements return {
    sku: m.sku,
    param: (erpStockParams[item.sku = m.sku and item.outlet = outlet])[1],
    level: if m.level != null then m.level else if param = null then null else param.on_hand + m.qtyChange
  },
  lines: for c in checks[item.param != null and item.level != null and item.level < item.param.reorder_point] return {
    sku: c.sku,
    product: (erpProducts[item.sku = c.sku].product)[1],
    supplierId: (erpProducts[item.sku = c.sku].supplier_id)[1],
    level: c.level,
    reorderPoint: c.param.reorder_point,
    orderQty: c.param.reorder_qty,
    unitCost: (erpProducts[item.sku = c.sku].unit_cost)[1],
    lineValue: decimal(c.param.reorder_qty * (erpProducts[item.sku = c.sku].unit_cost)[1], 2)
  },
  total: if count(lines) = 0 then 0 else decimal(sum(for l in lines return l.lineValue), 2)
}`;

module.exports = {
  id: "stock-reorder",
  name: "Stock Reorder",
  doc: "Loop-closer. Started by signal stock-level-changed {stockMovements[{sku, qtyChange|level}], outlet, source, sourceRef} from Goods Receipt 3-Way Match, Waste Write-off or Pour-Cost Reconciliation. Stock levels are computed from fictional mock on-hand figures; a real build reads live inventory.",
  nodes: [
    { id: "Start_signal", type: "signalStart", name: "Stock level changed", signal: "stock-level-changed", col: 0, row: 0 },
    { id: "FetchStock", type: "service", name: "Fetch stock parameters (mock ERP)", col: 1, row: 0,
      mockUrl: `=(${MOCK_BASE}) + "/erp.json"`,
      resultExpression: "={erpStockParams: response.body.stockParams, erpProducts: response.body.products}" },
    { id: "CheckReorder", type: "script", name: "Check reorder points", col: 2, row: 0, expr: "=" + reorderCheck, result: "reorderCheck" },
    { id: "Gw_reorder", type: "gateway", name: "Below reorder point?", col: 3, row: 0, default: "Flow_Gw_reorder_End_ok" },
    { id: "DraftRequisition", type: "script", name: "Draft purchase requisition", col: 4, row: 0, result: "requisition",
      expr: `={outlet: outlet, source: source, sourceRef: sourceRef, lines: reorderCheck.lines, total: reorderCheck.total,
  summary: string join(for l in reorderCheck.lines return l.product + " at " + string(l.level) + " (reorder point " + string(l.reorderPoint) + ", order " + string(l.orderQty) + ")", "; ")}` },
    { id: "ApproveRequisition", type: "call", name: "Approval Routing", process: "approval-routing", col: 5, row: 0,
      in: [["=requisition.total", "amount"], ['="stock-requisition"', "category"],
           ['="Reorder after " + source + ": " + requisition.summary', "flagReason"], ["=false", "flagged"],
           ['="REQ-" + outlet + "-" + string(today())', "sourceRef"], ['="Requisition (" + string(count(requisition.lines)) + " lines)"', "supplier"]],
      out: [["=approvalOutcome", "requisitionApproval"]] },
    { id: "Gw_approved", type: "gateway", name: "Approved?", col: 6, row: 0, default: "Flow_Gw_approved_End_rejected" },
    { id: "RaisePo", type: "script", name: "Raise purchase order (mock)", col: 7, row: 0, result: "purchaseOrder",
      doc: "Mock only: no supplier or purchasing system is called. The supplier's invoice for this order would enter Invoice-to-Pay on arrival.",
      expr: `={poNumber: "PO-MOCK-" + outlet + "-" + string(today()), status: "ISSUED (mock - no purchasing system connected)", outlet: outlet, lines: requisition.lines, total: requisition.total}` },
    { id: "End_po", type: "end", name: "PO issued", col: 8, row: 0 },
    { id: "End_ok", type: "end", name: "Stock OK", col: 4, row: 1 },
    { id: "End_rejected", type: "end", name: "Requisition rejected", col: 7, row: 1 },
  ],
  edges: [
    { from: "Start_signal", to: "FetchStock" }, { from: "FetchStock", to: "CheckReorder" }, { from: "CheckReorder", to: "Gw_reorder" },
    { from: "Gw_reorder", to: "DraftRequisition", name: "yes", cond: "=count(reorderCheck.lines) > 0" },
    { from: "Gw_reorder", to: "End_ok", name: "no" },
    { from: "DraftRequisition", to: "ApproveRequisition" }, { from: "ApproveRequisition", to: "Gw_approved" },
    { from: "Gw_approved", to: "RaisePo", name: "approved", cond: "=requisitionApproval.approved = true" },
    { from: "Gw_approved", to: "End_rejected", name: "rejected" },
    { from: "RaisePo", to: "End_po" },
  ],
};
