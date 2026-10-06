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

import { spanFilterValue, type ComparisonGrain } from "./periods";

/**
 * Single-query planning: ONE query over the union span of all periods.
 * The series are split client-side (seriesData.ts) by their own ranges —
 * strictly cheaper than one query per period (one scan instead of N, no
 * redundant AND-ed range pairs in WHERE).
 *
 * Dependency-free and unit-testable outside the Superset tree; the
 * Superset-side buildQuery.ts feeds the result into buildQueryContext
 * (cast to QueryObject).
 */

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
  /** Validated periods (their union span defines the query window) */
  periods: { startMs: number; endMs: number }[];
  timeColumn: string;
  /** Raw x_axis control value (string or adhoc column) */
  xAxisColumn: unknown;
  metricLabel: string;
  grain: ComparisonGrain;
  rowLimit?: number;
  /**
   * Emit the span TEMPORAL_RANGE clause (period own/config/filter sources).
   * False when a dashboard date filter governs: its clauses are already in
   * the base filters and adding our span would duplicate the window.
   */
  addSpanClause?: boolean;
};

/**
 * ONE query over the union span of the periods: base filters (including
 * the dashboard date filters) + a single TEMPORAL_RANGE clause covering
 * the span, grouped by the temporal column at the comparison grain.
 * Client-side seriesData assigns every bucket to its period(s).
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
    addSpanClause = true,
  } = input;
  const timeGrain = GRAIN_TO_TIME_GRAIN[grain];
  const adhoc = baseAdhocFilters || [];
  return {
    // keep the temporal column in `columns` so buildQueryContext's
    // normalizeTimeColumn converts it into a BASE_AXIS with the grain
    columns: [xAxisColumn],
    series_columns: [],
    metrics: [metricLabel],
    is_timeseries: true,
    time_grain_sqla: timeGrain,
    extras: { ...(baseExtras || {}), time_grain_sqla: timeGrain },
    filters: [
      ...(baseFilters || []),
      ...(addSpanClause
        ? [
            {
              col: timeColumn,
              op: "TEMPORAL_RANGE",
              val: spanFilterValue(periods),
            },
          ]
        : []),
    ],
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
