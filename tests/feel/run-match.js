// Evaluates the 3-way-match FEEL on the connected cluster for each demo invoice.
const fs=require("fs"),f=require("./match.feel.js"),evRaw=require("./feel-eval.js");
const erp=JSON.parse(fs.readFileSync("mock-data/erp.json"));
const base={erpSuppliers:erp.suppliers,erpPurchaseOrders:erp.purchaseOrders,erpGoodsReceipts:erp.goodsReceipts,erpProducts:erp.products};
const ev=evRaw;
for (const file of fs.readdirSync("demo/invoices").filter(x=>/^0[1-4]/.test(x))) {
  const invoice=JSON.parse(fs.readFileSync("demo/invoices/"+file));
  const v1={...base,invoice}; const matchCtx=ev(f.matchCtx,v1);
  const lineChecks=ev(f.lineChecks,{...v1,matchCtx}); const matchResult=ev(f.matchResult,{...v1,matchCtx,lineChecks});
  const moves=ev(f.stockMovements,{lineChecks});
  console.log(`\n${file}\n  ${matchResult.status} | PO ${matchResult.poNumber} | GRN ${matchResult.grnNumber} | variance R${matchResult.varianceAmount}\n  ${matchResult.summary}\n  stock: ${JSON.stringify(moves)}`);
}
