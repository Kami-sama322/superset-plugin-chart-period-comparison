/**
 * Minimal @superset-ui/core stub for the standalone test runner.
 * Only what the dependency-free src modules touch at runtime.
 */
export const ensureIsArray = v =>
  Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
export const getColumnLabel = col =>
  typeof col === "string" ? col : col?.label ?? "";
export const getMetricLabel = m =>
  typeof m === "string" ? m : m?.label ?? "metric";
export const getNumberFormatter = () => v => String(v);
export class ChartProps {}
export const Behavior = { InteractiveChart: "interactive" };
export const FilterState = null;
export const QueryFormData = null;
export const QueryFormColumn = null;
export const QueryFormMetric = null;
export const SetDataMaskHook = null;
export const JsonObject = null;
