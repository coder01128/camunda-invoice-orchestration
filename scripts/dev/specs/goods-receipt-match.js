// Spec for processes/goods-receipt-match.bpmn (3-way match: invoice <-> PO <-> goods receipt).
const f = require("../../../tests/feel/match.feel.js");
const MOCK_BASE = `if mockDataBaseUrl = null then "https://raw.githubusercontent.com/coder01128/camunda-invoice-orchestration/main/mock-data" else mockDataBaseUrl`;

module.exports = {
  id: "goods-receipt-match",
  name: "Goods Receipt 3-Way Match",
  doc: "Call activity. In: invoice (extractor format), optional mockDataBaseUrl. Out: matchResult {status MATCHED|DISCREPANCY|NO_PO, poNumber, grnNumber, outlet, discrepancies[], varianceAmount, summary}. Broadcasts signal stock-level-changed with received quantities.",
  nodes: [
    { id: "Start_match", type: "start", name: "Invoice to match", col: 0, row: 0 },
    { id: "FetchErp", type: "service", name: "Fetch POs & GRNs (mock ERP)", col: 1, row: 0,
      doc: "REST connector GET <mockDataBaseUrl>/erp.json. Stands in for the purchasing system API.",
      mockUrl: `=(${MOCK_BASE}) + "/erp.json"` },
    { id: "IdentifyPo", type: "script", name: "Identify supplier & PO", col: 2, row: 0,
      expr: "=" + f.matchCtx, result: "matchCtx",
      doc: "Invoices carry no PO number, so the PO is found via supplier VAT number -> open PO for that supplier." },
    { id: "Gw_po", type: "gateway", name: "PO found?", col: 3, row: 0, default: "Flow_Gw_po_NoPoResult" },
    { id: "CompareLines", type: "script", name: "Compare invoice, PO & GRN lines", col: 4, row: 0,
      expr: "=" + f.lineChecks, result: "lineChecks" },
    { id: "Summarise", type: "script", name: "Summarise match", col: 5, row: 0,
      expr: "=" + f.matchResult, result: "matchResult" },
    { id: "StockReceived", type: "signalThrow", name: "Stock received", signal: "stock-level-changed", col: 6, row: 0,
      doc: "Broadcasts accepted quantities so Stock Reorder can check reorder points.",
      in: [["=" + f.stockMovements, "stockMovements"], ["=matchResult.outlet", "outlet"],
           ['="goods-receipt"', "source"], ["=matchResult.poNumber", "sourceRef"]] },
    { id: "End_matched", type: "end", name: "Match complete", col: 7, row: 0 },
    { id: "NoPoResult", type: "script", name: "Record no-PO result", col: 4, row: 1, result: "matchResult",
      expr: `={status: "NO_PO", supplierId: matchCtx.supplier.supplier_id, poNumber: null, grnNumber: null, outlet: null,
  discrepancies: [], varianceAmount: invoice.subtotal,
  summary: if matchCtx.supplier = null then "Supplier VAT " + invoice.supplier_vat + " not found in supplier master"
           else "No open purchase order for " + matchCtx.supplier.supplier_name}` },
    { id: "End_noPo", type: "end", name: "No PO found", col: 5, row: 1 },
  ],
  edges: [
    { from: "Start_match", to: "FetchErp" }, { from: "FetchErp", to: "IdentifyPo" }, { from: "IdentifyPo", to: "Gw_po" },
    { from: "Gw_po", to: "CompareLines", name: "yes", cond: "=matchCtx.po != null" },
    { from: "Gw_po", to: "NoPoResult", name: "no" },
    { from: "CompareLines", to: "Summarise" }, { from: "Summarise", to: "StockReceived" }, { from: "StockReceived", to: "End_matched" },
    { from: "NoPoResult", to: "End_noPo" },
  ],
};
