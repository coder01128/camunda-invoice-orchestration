// Spec for processes/supplier-query.bpmn (dispute / query-supplier, called from Invoice-to-Pay).
module.exports = {
  id: "supplier-query",
  name: "Supplier Query",
  doc: "Call activity. In: invoice, queryReason. Out: queryOutcome {outcome, notes, handledBy}. Creditors team contacts the supplier and records how the query closed.",
  nodes: [
    { id: "Start_query", type: "start", name: "Query needed", col: 0, row: 0 },
    { id: "QuerySupplier", type: "user", name: "Query supplier", col: 1, row: 0, form: "supplier-query", group: "creditors",
      out: [["={outcome: outcome, notes: notes, handledBy: handledBy}", "queryOutcome"]] },
    { id: "End_query", type: "end", name: "Query closed", col: 2, row: 0 },
  ],
  edges: [{ from: "Start_query", to: "QuerySupplier" }, { from: "QuerySupplier", to: "End_query" }],
};
