/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  snapEndExclusiveMs,
  snapStartMs,
  toUtcSqlString,
  type ComparisonGrain,
} from "./periods";

/**
 * Single-query planning: ONE query whose scan window is the OR-group of
 * the periods' own bucket windows. The series are split client-side
 * (seriesData.ts) from that single result — one round trip, and the scan
 * covers exactly the periods however far apart they are.
 *
 * Dependency-free and unit-testable outside the Superset tree; the
 * Superset-side buildQuery.ts feeds the result into buildQueryContext
 * (cast to QueryObject).
 */

/** Tagged date-filter clauses (period_ranges' OR clause, the chart's own
 * span) target OTHER charts and must never AND-narrow this chart's query.
 * Superset 6 merges adhoc filters into `filters`, so both lists are
 * stripped. */
const DATE_FILTER_TAGS = [
  "/* period_ranges:v1 */",
  "/* period_comparison:own:v1 */",
];

function isTaggedDateFilterClause(item: unknown): boolean {
  const sql = (item as { sqlExpression?: unknown })?.sqlExpression;
  return (
    typeof sql === "string" &&
    DATE_FILTER_TAGS.some(tag => sql.startsWith(tag))
  );
}

export const GRAIN_TO_TIME_GRAIN: Record<ComparisonGrain, string> = {
  hour: "PT1H",
  day: "P1D",
  // Monday-anchored week grain: bucket boundaries align with the Monday
  // snapping of the period starts
  week: "1969-12-29T00:00:00Z/P1W",
  month: "P1M",
  quarter: "P3M",
  year: "P1Y",
};

export type FilterClause = {
  col: string;
  op: string;
  val: unknown;
};

export type PlannedQuery = {
  columns: unknown[];
  series_columns: never[];
  metrics: string[];
  is_timeseries: true;
  time_grain_sqla: string;
  extras: Record<string, unknown>;
  filters: FilterClause[];
  /** Untagged adhoc filters inherited from the base query */
  adhoc_filters?: unknown[];
  orderby: undefined;
  row_limit?: number;
};

export type QueryPlanInput = {
  /** Base query simple filters (extra_form_data.filters etc.) */
  baseFilters: FilterClause[];
  /** Base query adhoc filters with tagged date-filter clauses stripped */
  baseAdhocFilters?: unknown[];
  baseExtras?: Record<string, unknown>;
  /** Validated periods (their windows define the scan ranges) */
  periods: { startMs: number; endMs: number }[];
  timeColumn: string;
  /** Raw x_axis control value (string or adhoc column) */
  xAxisColumn: unknown;
  metricLabel: string;
  grain: ComparisonGrain;
  rowLimit?: number;
  /**
   * Add the per-period window clause (period own/config/filter sources).
   * False when a dashboard date filter governs: its clauses are already in
   * the base filters and adding our windows would duplicate the bound.
   */
  addWindowClause?: boolean;
};

/**
 * OR-group of the periods' bucket windows as raw SQL, each half-open
 * [snapStart, snapEndExclusive) at the query grain — exactly the rows the
 * client assigns to the series. Scanning the periods' own windows (however
 * far apart) instead of their union span keeps distant comparisons cheap:
 * Sep 1–5 vs Oct 6–10 scans 10 days, not the 41-day span between them.
 * AND-safe: a single range and the OR-group are fully parenthesized.
 */
export function periodRangesSql(
  periods: { startMs: number; endMs: number }[],
  grain: ComparisonGrain,
  timeColumn: string,
): string {
  if (!Array.isArray(periods) || periods.length === 0) {
    return "1 = 0";
  }
  const ranges = periods.map(period => {
    const startMs = snapStartMs(period.startMs, grain);
    const endExclusiveMs = snapEndExclusiveMs(period.endMs, grain);
    return (
      `${timeColumn} >= '${toUtcSqlString(startMs)}' ` +
      `AND ${timeColumn} < '${toUtcSqlString(endExclusiveMs)}'`
    );
  });
  if (ranges.length === 1) {
    return `(${ranges[0]})`;
  }
  return `(${ranges.map(range => `(${range})`).join(" OR ")})`;
}

/**
 * ONE query over the union span of the periods: base filters (including
 * the dashboard date filters) + an OR-group of the per-period bucket
 * windows (extras.where — the backend AND-joins it), grouped by the
 * temporal column at the comparison grain. Client-side seriesData assigns
 * every bucket to its period(s).
 */
export function buildSpanQuery(input: QueryPlanInput): PlannedQuery {
  const {
    baseFilters,
    baseAdhocFilters,
    baseExtras,
    periods,
    timeColumn,
    xAxisColumn,
    metricLabel,
    grain,
    rowLimit,
    addWindowClause = true,
  } = input;
  const timeGrain = GRAIN_TO_TIME_GRAIN[grain];
  const adhoc = (baseAdhocFilters || []).filter(
    item => !isTaggedDateFilterClause(item),
  );
  const cleanBaseFilters = (baseFilters || []).filter(
    item => !isTaggedDateFilterClause(item),
  );
  const extras: Record<string, unknown> = {
    ...(baseExtras || {}),
    time_grain_sqla: timeGrain,
  };
  if (addWindowClause) {
    // the backend AND-joins extras.where with the rendered filters; the
    // base where arrives pre-sanitized ("(a) AND (b)") from the core
    const baseWhere =
      typeof baseExtras?.where === "string" && baseExtras.where.trim() !== ""
        ? baseExtras.where
        : undefined;
    const windowSql = periodRangesSql(periods, grain, timeColumn);
    extras.where = baseWhere ? `${baseWhere} AND ${windowSql}` : windowSql;
  }
  return {
    // keep the temporal column in `columns` so buildQueryContext's
    // normalizeTimeColumn converts it into a BASE_AXIS with the grain
    columns: [xAxisColumn],
    series_columns: [],
    metrics: [metricLabel],
    is_timeseries: true,
    time_grain_sqla: timeGrain,
    extras,
    filters: cleanBaseFilters,
    ...(adhoc.length > 0 ? { adhoc_filters: adhoc } : {}),
    orderby: undefined,
    ...(rowLimit !== undefined ? { row_limit: rowLimit } : {}),
  };
}

/** Always-empty query (a governing date filter has no usable periods yet) */
export function buildEmptyQuery(baseQueryObject?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(baseQueryObject || {}),
    filters: [],
    adhoc_filters: [
      { clause: "WHERE", expressionType: "SQL", sqlExpression: "1 = 0" },
    ],
  };
}
