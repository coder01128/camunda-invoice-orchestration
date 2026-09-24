// Spec for processes/pour-cost-reconciliation.bpmn.
const f = require("../../../tests/feel/pourcost.feel.js");
const BASE = `if mockDataBaseUrl = null then "https://raw.githubusercontent.com/coder01128/camunda-invoice-orchestration/main/mock-data" else mockDataBaseUrl`;
const stockSignal = (id, col, row) => ({
  id, type: "signalThrow", name: "Stock levels updated", signal: "stock-level-changed", col, row,
  in: [["=for u in pourCost.usage return {sku: u.countSku, level: u.closingUnits}", "stockMovements"], ["=outlet", "outlet"],
       ['="pour-cost-count"', "source"], ['="POURCOST-" + outlet + "-" + stockCount.period_to', "sourceRef"]] });

module.exports = {
  id: "pour-cost-reconciliation",
  name: "Pour-Cost Reconciliation",
  doc: "Start with {outlet} (optional varianceTolerancePct override; default = cluster variable pourCostTolerance). Compares theoretical usage (POS sales x recipes) with actual usage from the physical count. Over tolerance -> Approval Routing (flagged, so always a human). POS data is a FICTIONAL mock export: no Oracle Simphony integration exists or is claimed.",
  nodes: [
    { id: "Start_pourcost", type: "start", name: "Reconciliation due", col: 0, row: 0 },
    { id: "FetchPosSales", type: "service", name: "Fetch POS sales (mock export)", col: 1, row: 0,
      mockUrl: `=(${BASE}) + "/pos-sales-export.json"`, resultExpression: "={posSales: response.body}" },
    { id: "FetchStockCount", type: "service", name: "Fetch physical stock count (mock)", col: 2, row: 0,
      mockUrl: `=(${BASE}) + "/stock-count.json"`, resultExpression: "={stockCount: response.body}" },
    { id: "FetchRecipes", type: "service", name: "Fetch recipes & costs (mock ERP)", col: 3, row: 0,
      mockUrl: `=(${BASE}) + "/erp.json"`, resultExpression: "={erpRecipes: response.body.recipes, erpProducts: response.body.products}" },
    { id: "CalculateVariance", type: "script", name: "Calculate pour-cost variance", col: 4, row: 0, expr: "=" + f.pourCost, result: "pourCost" },
    { id: "Gw_tolerance", type: "gateway", name: "Over tolerance?", col: 5, row: 0, default: "Flow_Gw_tolerance_WithinTolerance" },
    { id: "ApproveVariance", type: "call", name: "Approval Routing", process: "approval-routing", col: 6, row: 0,
      in: [["=pourCost.totalVarianceValue", "amount"], ['="pour-cost"', "category"],
           ['="Pour-cost variance over tolerance at " + outlet + ": " + pourCost.summary', "flagReason"], ["=true", "flagged"],
           ['="POURCOST-" + outlet + "-" + stockCount.period_to', "sourceRef"], ['="Pour-cost: " + outlet', "supplier"]],
      out: [["=approvalOutcome", "varianceApproval"]] },
    { id: "Gw_accepted", type: "gateway", name: "Variance accepted?", col: 7, row: 0, default: "Flow_Gw_accepted_InvestigateVariance" },
    { id: "InvestigateVariance", type: "user", name: "Investigate variance", col: 8, row: 1, form: "pour-cost-investigation", group: "manager",
      out: [["={findings: findings, action: action, investigator: investigator}", "investigation"]] },
    { id: "Gw_join", type: "gateway", col: 9, row: 0 },
    stockSignal("StockLevels", 10, 0),
    { id: "End_reconciled", type: "end", name: "Reconciled", col: 11, row: 0 },
    { id: "WithinTolerance", type: "script", name: "Record within tolerance", col: 6, row: 2, result: "varianceApproval",
      expr: '={approved: true, approver: "system:within-tolerance", tier: "none", escalated: false, comment: pourCost.summary}' },
    stockSignal("StockLevels_ok", 7, 2),
    { id: "End_within", type: "end", name: "Within tolerance", col: 8, row: 2 },
  ],
  edges: [
    { from: "Start_pourcost", to: "FetchPosSales" }, { from: "FetchPosSales", to: "FetchStockCount" },
    { from: "FetchStockCount", to: "FetchRecipes" }, { from: "FetchRecipes", to: "CalculateVariance" },
    { from: "CalculateVariance", to: "Gw_tolerance" },
    { from: "Gw_tolerance", to: "ApproveVariance", name: "yes", cond: "=count(pourCost.overItems) > 0" },
    { from: "Gw_tolerance", to: "WithinTolerance", name: "no" },
    { from: "ApproveVariance", to: "Gw_accepted" },
    { from: "Gw_accepted", to: "Gw_join", name: "accepted", cond: "=varianceApproval.approved = true" },
    { from: "Gw_accepted", to: "InvestigateVariance", name: "not accepted" },
    { from: "InvestigateVariance", to: "Gw_join" },
    { from: "Gw_join", to: "StockLevels" }, { from: "StockLevels", to: "End_reconciled" },
    { from: "WithinTolerance", to: "StockLevels_ok" }, { from: "StockLevels_ok", to: "End_within" },
  ],
};
