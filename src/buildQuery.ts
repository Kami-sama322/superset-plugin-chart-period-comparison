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
  buildQueryContext,
  ensureIsArray,
  getColumnLabel,
  getMetricLabel,
  QueryFormData,
  QueryObject,
} from "@superset-ui/core";
import {
  extractFilterPeriods,
  MAX_PERIODS,
  parseGrain,
  resolvePeriodsSource,
  stripTaggedPeriodRangeFilters,
  validatePeriods,
} from "./periods";
import { buildPeriodQueries } from "./queryPlan";
import type { PeriodComparisonQueryFormData } from "./types";
type BuildQueryOptions = {
  ownState?: { periods?: unknown } | null;
};

const ISSUE_TEXT: Record<string, string> = {
  invalid_dates: "invalid or missing dates",
  end_before_start: "the end is before the start",
  length_mismatch: "periods must have the same length",
  truncated: "too many periods",
  overlap: "overlapping periods",
};

/**
 * Builds one query per period (1 HTTP request, N queries — see Mixed Chart).
 *
 * Period source: dashboard runtime ownState (the on-chart pickers) wins over
 * the control-panel value, so runtime edits re-query the chart itself.
 */
export default function buildQuery(
  formData: PeriodComparisonQueryFormData,
  options: BuildQueryOptions = {},
) {
  const metric = formData.metric;
  if (!metric) {
    throw new Error("Select a metric");
  }
  const xAxis = ensureIsArray(formData.x_axis)[0];
  if (xAxis === null || xAxis === undefined || xAxis === "") {
    throw new Error("Select a time column");
  }
  const timeColumn = getColumnLabel(xAxis);
  if (!timeColumn) {
    throw new Error("Select a time column");
  }

  // Highest priority first: structured periods from the period_ranges
  // filter; then ANY applied date filter (the chart keeps its configured
  // periods, narrowed by the filter); then dashboard ownState (on-chart
  // pickers); then the control-panel value
  const extraFormData = (formData as { extra_form_data?: unknown })
    .extra_form_data;
  const { periods: rawPeriodList, source } = resolvePeriodsSource(
    options.ownState,
    formData.periods,
    extraFormData,
    timeColumn,
  );
  const { periods: validated, errors } = validatePeriods(rawPeriodList, {
    maxCount: MAX_PERIODS,
  });
  if (validated.length === 0) {
    // a date filter governs the chart but has no usable periods yet —
    // return an always-empty query instead of erroring (the UI explains)
    if (source === "filter" || source === "date_filter") {
      return buildQueryContext(formData, {
        buildQuery: (baseQueryObject: QueryObject) => [
          {
            ...baseQueryObject,
            filters: [],
            adhoc_filters: [
              {
                clause: "WHERE",
                expressionType: "SQL",
                sqlExpression: "1 = 0",
              },
            ],
          },
        ],
      });
    }
    const reason = errors.length
      ? `: ${ISSUE_TEXT[errors[0].type] ?? errors[0].type}`
      : "";
    throw new Error(`Add at least one valid period${reason}`);
  }

  const grain = parseGrain(formData.comparison_grain);
  const metricLabel = getMetricLabel(metric);

  return buildQueryContext(formData, {
    buildQuery: (baseQueryObject: QueryObject) =>
      buildPeriodQueries({
        // the tagged OR clauses belong to OTHER charts (they filter the
        // filter's own column) — this chart re-applies the ranges to its
        // own time column via its per-period clauses
        baseFilters: (baseQueryObject.filters || []) as never[],
        baseAdhocFilters: stripTaggedPeriodRangeFilters(
          baseQueryObject.adhoc_filters,
        ),
        baseExtras: baseQueryObject.extras,
        periods: validated,
        timeColumn,
        xAxisColumn: xAxis,
        metricLabel,
        grain,
        rowLimit: baseQueryObject.row_limit,
      }) as unknown as QueryObject[],
  });
}
