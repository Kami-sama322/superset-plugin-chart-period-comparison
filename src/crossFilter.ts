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
  formatPeriodLabel,
  spanFilterValue,
  validatePeriods,
  type PeriodRange,
} from "./periods";

/**
 * The data mask the chart emits when the on-chart date filter changes.
 *
 * - `ownState.periods` re-queries THIS chart (the dashboard refreshes
 *   charts whose ownState changed) with the new period set.
 * - `extraFormData.filters` carries a single TEMPORAL_RANGE clause covering
 *   the whole span of all periods (min start : max end) — it cross-filters
 *   every other chart on the dashboard.
 *
 * Local structural types keep this module dependency-free; they are
 * compatible with @superset-ui/core DataMask.
 */
export type DataMaskLike = {
  ownState: { periods?: PeriodRange[] };
  extraFormData: {
    filters: { col: string; op: string; val: string }[];
  };
  filterState: { value?: string | null; label?: string };
};

export function buildPeriodsDataMask(
  periods: PeriodRange[],
  timeColumn: string | null | undefined,
): DataMaskLike {
  const { periods: validated } = validatePeriods(periods);
  const valid = validated.length > 0;
  return {
    ownState: { periods: periods.map(({ start, end }) => ({ start, end })) },
    extraFormData: {
      filters:
        valid && timeColumn
          ? [
              {
                col: timeColumn,
                op: "TEMPORAL_RANGE",
                val: spanFilterValue(validated),
              },
            ]
          : [],
    },
    filterState: {
      value: valid ? spanFilterValue(validated) : null,
      label: valid
        ? validated.map(formatPeriodLabel).join(", ")
        : undefined,
    },
  };
}
