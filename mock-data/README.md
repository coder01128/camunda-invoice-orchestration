# Mock data (fictional)

Everything here is **made up** so the prototype runs anywhere without real systems.
The processes fetch these files over HTTP with Camunda's REST connector, standing in for real back-office APIs.

| File | Stands in for |
|---|---|
| `erp.json` | Purchasing / inventory system: suppliers, products, purchase orders, goods receipts (GRNs), invoice history, stock reorder parameters, drink recipes |
| `pos-sales-export.json` | A POS sales export for one outlet and one week. **Shape is illustrative. No Oracle Simphony integration exists or is claimed.** |
| `stock-count.json` | A physical stock count (ml) for the same outlet and period |

Supplier names, VAT numbers, prices, stock levels and reorder points are all fictional.
None of them are business figures from any real company.

Seeded scenarios in `erp.json`:
- **PO-DEMO-1001 / GRN-DEMO-5001**: clean match
- **PO-DEMO-1002 / GRN-DEMO-5002**: short delivery (120 lager ordered, 96 received)
- **PO-DEMO-1003 / GRN-DEMO-5003**: 2 gin bottles damaged on arrival
- **PO-DEMO-1004 / GRN-DEMO-5004**: Cabernet substituted with Merlot
