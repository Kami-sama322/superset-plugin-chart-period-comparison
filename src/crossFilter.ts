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
  OWN_SPAN_TAG,
  formatPeriodLabel,
  snapEndExclusiveMs,
  toUtcSqlString,
  validatePeriods,
  type PeriodRange,
  type ValidatedPeriod,
} from "./periods";

/**
 * The data mask the chart emits when the on-chart date filter changes.
 *
 * - `ownState.periods` re-queries THIS chart (the dashboard refreshes
 *   charts whose ownState changed) with the new period set.
 * - `extra_form_data.adhoc_filters` carries ONE tagged adhoc clause — the
 *   span of all periods with explicit exclusive bounds. It cross-filters
 *   every other chart on the dashboard, and its tag lets this chart
 *   recognize (and ignore) its own emission in the aggregated
 *   extra_form_data.
 *
 * Local structural types keep this module dependency-free; they are
 * compatible with @superset-ui/core DataMask.
 */
export type DataMaskLike = {
  ownState: { periods?: PeriodRange[] };
  extraFormData: {
    filters: never[];
    adhoc_filters: {
      clause: string;
      expressionType: string;
      sqlExpression: string;
    }[];
  };
  filterState: { value?: string | null; label?: string };
};

/** Tagged span clause covering all periods (exclusive upper bound) */
export function buildOwnSpanClause(
  col: string,
  periods: ValidatedPeriod[],
): string {
  const start = Math.min(...periods.map(p => p.startMs));
  const end = Math.max(
    ...periods.map(p => snapEndExclusiveMs(p.endMs, "day")),
  );
  return `${OWN_SPAN_TAG} (${col} >= '${toUtcSqlString(start)}' AND ${col} < '${toUtcSqlString(end)}')`;
}

export function buildPeriodsDataMask(
  periods: PeriodRange[],
  timeColumn: string | null | undefined,
): DataMaskLike {
  const { periods: validated } = validatePeriods(periods);
  const valid = validated.length > 0 && Boolean(timeColumn);
  const spanValue = valid
    ? `${toUtcSqlString(Math.min(...validated.map(p => p.startMs)))} : ${toUtcSqlString(
        Math.max(...validated.map(p => snapEndExclusiveMs(p.endMs, "day"))),
      )}`
    : null;
  return {
    ownState: { periods: periods.map(({ start, end }) => ({ start, end })) },
    extraFormData: {
      filters: [],
      adhoc_filters: valid
        ? [
            {
              clause: "WHERE",
              expressionType: "SQL",
              sqlExpression: buildOwnSpanClause(
                timeColumn as string,
                validated,
              ),
            },
          ]
        : [],
    },
    filterState: {
      value: spanValue,
      label: valid
        ? validated.map(formatPeriodLabel).join(", ")
        : undefined,
    },
  };
}
