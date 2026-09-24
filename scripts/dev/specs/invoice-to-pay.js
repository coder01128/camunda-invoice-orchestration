// Spec for processes/invoice-to-pay.bpmn (main process).
const f = require("../../../tests/feel/invoice.feel.js");
const BASE = `if mockDataBaseUrl = null then "https://raw.githubusercontent.com/coder01128/camunda-invoice-orchestration/main/mock-data" else mockDataBaseUrl`;

const SYSTEM_PROMPT = "You are an accounts-payable assistant at the head office of a restaurant group. " +
  "You review supplier invoices before payment and flag anything a careful accounts clerk would query. " +
  "You never approve or reject an invoice: a human approver decides, and your flags are shown to them. " +
  "Be specific and brief. Only flag real concerns; an empty flags list is a valid answer.";

// Single-line FEEL string with \n escapes (XML attributes normalise raw newlines to spaces).
const USER_PROMPT = String.raw`="Review this supplier invoice before payment.\n\nINVOICE (extracted from the supplier PDF):\n" + string(invoice)
 + "\n\nDETERMINISTIC 3-WAY MATCH (invoice vs purchase order vs goods received note), already computed:\n" + string(matchResult)
 + "\n\nPREVIOUS INVOICES FROM THIS SUPPLIER:\n" + string(duplicateCheck.supplierHistory)
 + "\n\nCheck for: possible duplicates or near-duplicates of previous invoices (same amount, same items, consecutive numbers, close dates); unusual prices or quantities; lines that do not fit this supplier; anything else worth querying. Do not simply restate the 3-way-match findings; add a flag only if you have something new to say about them. Return JSON only."`;

const SCHEMA = `={type: "object", required: ["riskLevel", "flags", "summary"], properties: {
  riskLevel: {type: "string", enum: ["low", "medium", "high"]},
  flags: {type: "array", items: {type: "object", required: ["type", "detail"], properties: {
    type: {type: "string", enum: ["POSSIBLE_DUPLICATE", "PRICE", "QUANTITY", "NOT_ORDERED", "SUPPLIER_MISMATCH", "ARITHMETIC", "OTHER"]},
    line: {type: "string"}, detail: {type: "string"}}}},
  summary: {type: "string"}}}`;

module.exports = {
  id: "invoice-to-pay",
  name: "Invoice-to-Pay",
  doc: "Main process. Start with {invoice} in the pdf.js extractor's format (supplier_name, supplier_vat, invoice_number, invoice_date, due_date, items[], subtotal, vat_amount, total_due). Optional: paymentTimerOverride (ISO duration, demo only), mockDataBaseUrl. Validates, checks duplicates, runs the 3-way match, asks Claude (AI Agent connector) to review the lines, routes approval, waits for the due date, then hands to the creditors run. No real payment is made.",
  nodes: [
    { id: "Start_invoice", type: "start", name: "Invoice received", col: 0, row: 0 },
    { id: "ValidateInvoice", type: "script", name: "Validate invoice", col: 1, row: 0, expr: "=" + f.validation, result: "validation" },
    { id: "Gw_valid", type: "gateway", name: "Valid?", col: 2, row: 0, default: "Flow_Gw_valid_QueryInvalid" },
    { id: "FetchHistory", type: "service", name: "Fetch invoice history (mock ERP)", col: 3, row: 0,
      mockUrl: `=(${BASE}) + "/erp.json"`, resultExpression: "={erpInvoiceHistory: response.body.invoiceHistory}" },
    { id: "DuplicateCheck", type: "script", name: "Check for duplicate", col: 4, row: 0, expr: "=" + f.duplicateCheck, result: "duplicateCheck" },
    { id: "Gw_duplicate", type: "gateway", name: "Duplicate?", col: 5, row: 0, default: "Flow_Gw_duplicate_ThreeWayMatch" },
    { id: "ThreeWayMatch", type: "call", name: "Goods Receipt 3-Way Match", process: "goods-receipt-match", col: 6, row: 0,
      out: [["=matchResult", "matchResult"]] },
    { id: "AiReview", type: "service", name: "AI line-item review (Claude)", col: 7, row: 0,
      doc: "Camunda AI Agent connector (Anthropic). Flags possible duplicates, unusual prices/quantities, supplier mismatches. Advisory only: any flag forces human approval.",
      ai: {
        "provider.type": "anthropic",
        "provider.anthropic.authentication.apiKey": "{{secrets.ANTHROPIC_API_KEY}}",
        "provider.anthropic.model.model": "claude-sonnet-5",
        "provider.anthropic.model.parameters.maxTokens": "2000",
        "data.systemPrompt.prompt": SYSTEM_PROMPT,
        "data.userPrompt.prompt": USER_PROMPT,
        "data.memory.storage.type": "in-process",
        "data.limits.maxModelCalls": "3",
        "data.response.format.type": "json",
        "data.response.format.schema": SCHEMA,
        "data.response.format.schemaName": "InvoiceReview",
        "resultVariable": "agent",
        "retries": "2",
      } },
    { id: "PrepareApproval", type: "script", name: "Prepare approval request", col: 8, row: 0, expr: "=" + f.approvalRequest, result: "approvalRequest" },
    { id: "ApproveInvoice", type: "call", name: "Approval Routing", process: "approval-routing", col: 9, row: 0,
      in: [["=invoice.total_due", "amount"], ['="supplier-invoice"', "category"], ["=approvalRequest.flagReason", "flagReason"],
           ["=approvalRequest.flagged", "flagged"], ["=invoice.invoice_number", "sourceRef"], ["=invoice.supplier_name", "supplier"]],
      out: [["=approvalOutcome", "invoiceApproval"]] },
    { id: "Gw_approved", type: "gateway", name: "Approved?", col: 10, row: 0, default: "Flow_Gw_approved_QueryRejected" },
    { id: "SchedulePayment", type: "script", name: "Schedule payment", col: 11, row: 0, expr: "=" + f.payment, result: "payment" },
    { id: "WaitForDueDate", type: "timerCatch", name: "Due date reached", col: 12, row: 0,
      timer: '=if paymentTimerOverride != null then now() + duration(paymentTimerOverride) else date and time(payment.payOn, time("09:00:00@Africa/Johannesburg"))' },
    { id: "CreditorsRun", type: "user", name: "Include in creditors run", col: 13, row: 0, form: "creditors-run", group: "creditors",
      out: [["={paymentReference: paymentReference, processedBy: processedBy, amount: payment.amount}", "paymentRecord"]] },
    { id: "End_paid", type: "end", name: "Paid", col: 14, row: 0 },
    // exception paths
    { id: "QueryInvalid", type: "call", name: "Supplier Query", process: "supplier-query", col: 3, row: 1,
      in: [['="Invoice failed validation: " + string join(validation.errors, "; ")', "queryReason"]], out: [["=queryOutcome", "queryOutcome"]] },
    { id: "End_invalid", type: "end", name: "Closed: invalid invoice", col: 4, row: 1 },
    { id: "End_duplicate", type: "end", name: "Rejected: duplicate", col: 6, row: 1,
      doc: "Same supplier VAT number and invoice number already exists in invoice history." },
    { id: "QueryRejected", type: "call", name: "Supplier Query", process: "supplier-query", col: 11, row: 1,
      in: [['="Approval rejected by " + invoiceApproval.approver + (if invoiceApproval.comment = null then "" else ": " + invoiceApproval.comment) + ". Flags: " + approvalRequest.flagReason', "queryReason"]],
      out: [["=queryOutcome", "queryOutcome"]] },
    { id: "End_rejected", type: "end", name: "Closed via supplier query", col: 12, row: 1 },
  ],
  edges: [
    { from: "Start_invoice", to: "ValidateInvoice" }, { from: "ValidateInvoice", to: "Gw_valid" },
    { from: "Gw_valid", to: "FetchHistory", name: "valid", cond: "=validation.valid = true" },
    { from: "Gw_valid", to: "QueryInvalid", name: "invalid" }, { from: "QueryInvalid", to: "End_invalid" },
    { from: "FetchHistory", to: "DuplicateCheck" }, { from: "DuplicateCheck", to: "Gw_duplicate" },
    { from: "Gw_duplicate", to: "End_duplicate", name: "duplicate", cond: "=duplicateCheck.isDuplicate = true" },
    { from: "Gw_duplicate", to: "ThreeWayMatch", name: "new" },
    { from: "ThreeWayMatch", to: "AiReview" }, { from: "AiReview", to: "PrepareApproval" },
    { from: "PrepareApproval", to: "ApproveInvoice" }, { from: "ApproveInvoice", to: "Gw_approved" },
    { from: "Gw_approved", to: "SchedulePayment", name: "approved", cond: "=invoiceApproval.approved = true" },
    { from: "Gw_approved", to: "QueryRejected", name: "rejected" }, { from: "QueryRejected", to: "End_rejected" },
    { from: "SchedulePayment", to: "WaitForDueDate" }, { from: "WaitForDueDate", to: "CreditorsRun" }, { from: "CreditorsRun", to: "End_paid" },
  ],
};
