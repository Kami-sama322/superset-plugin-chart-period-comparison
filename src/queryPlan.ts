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
  toUtcSqlString,
  type ComparisonGrain,
  type ValidatedPeriod,
} from "./periods";

/**
 * Pure query planning: one query object per period. The Superset-side
 * buildQuery.ts feeds these into buildQueryContext (cast to QueryObject).
 * Dependency-free and unit-testable outside the Superset tree.
 */

export const GRAIN_TO_TIME_GRAIN: Record<ComparisonGrain, string> = {
  hour: "PT1H",
  day: "P1D",
  // Monday-anchored week grain: bucket boundaries align with the Monday
  // snapping of the period start
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
  orderby: undefined;
  row_limit?: number;
};

export type QueryPlanInput = {
  /** Base query filters (adhoc + dashboard cross/native filters) */
  baseFilters: FilterClause[];
  baseExtras?: Record<string, unknown>;
  periods: ValidatedPeriod[];
  timeColumn: string;
  /** Raw x_axis control value (string or adhoc column) */
  xAxisColumn: unknown;
  metricLabel: string;
  grain: ComparisonGrain;
  rowLimit?: number;
};

export function periodRangeFilter(
  period: ValidatedPeriod,
  timeColumn: string,
  grain: ComparisonGrain,
): FilterClause {
  return {
    col: timeColumn,
    op: "TEMPORAL_RANGE",
    val: `${toUtcSqlString(period.startMs)} : ${toUtcSqlString(
      snapEndExclusiveMs(period.endMs, grain),
    )}`,
  };
}

/**
 * One query per period sharing the base filters; every query groups the
 * metric by the temporal column at the comparison grain and is restricted
 * to its own [start, endExclusive) window.
 */
export function buildPeriodQueries(input: QueryPlanInput): PlannedQuery[] {
  const {
    baseFilters,
    baseExtras,
    periods,
    timeColumn,
    xAxisColumn,
    metricLabel,
    grain,
    rowLimit,
  } = input;
  const timeGrain = GRAIN_TO_TIME_GRAIN[grain];
  return periods.map(period => ({
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
      periodRangeFilter(period, timeColumn, grain),
    ],
    orderby: undefined,
    ...(rowLimit !== undefined ? { row_limit: rowLimit } : {}),
  }));
}
