// FEEL for processes/pour-cost-reconciliation.bpmn "Calculate variance" (kept here for engine tests).
exports.pourCost = `{
  tolerancePct: if varianceTolerancePct != null then varianceTolerancePct
                else camunda.vars.env.pourCostTolerance.maxVariancePct,
  toleranceSource: if varianceTolerancePct != null then "supplied by caller"
                   else if camunda.vars.env.pourCostTolerance = null then "NONE CONFIGURED - every positive variance is escalated"
                   else camunda.vars.env.pourCostTolerance.source,
  usage: for c in stockCount.items return {
    countSku: c.sku,
    prod: (erpProducts[item.sku = countSku])[1],
    product: prod.product,
    theoreticalMl: sum(concatenate([0], for s in posSales.sales return
                     s.qty * sum(concatenate([0], for comp in (erpRecipes[item.menu_item = s.menu_item])[1].components[item.sku = countSku] return comp.ml)))),
    actualMl: c.opening_ml + c.received_ml - c.closing_ml,
    varianceMl: actualMl - theoreticalMl,
    variancePct: if theoreticalMl = 0 then null else decimal(varianceMl / theoreticalMl * 100, 1),
    varianceValue: decimal(varianceMl / prod.ml * prod.unit_cost, 2),
    closingUnits: decimal(c.closing_ml / prod.ml, 2),
    overTolerance: varianceMl > 0 and (tolerancePct = null or variancePct = null or variancePct > tolerancePct)
  },
  overItems: usage[item.overTolerance = true],
  totalVarianceValue: decimal(sum(concatenate([0], for u in overItems return u.varianceValue)), 2),
  summary: if count(overItems) = 0 then "All items within tolerance"
           else string join(for u in overItems return u.product + " +" + string(u.variancePct) + "% (R" + string(u.varianceValue) + ")", "; ")
}`;
