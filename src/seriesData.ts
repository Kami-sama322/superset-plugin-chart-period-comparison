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
  bucketIndexForTs,
  parsePeriodMs,
  periodBucketStarts,
  snapStartMs,
  type ComparisonGrain,
  type ValidatedPeriod,
} from "./periods";
import type { Scale } from "./scale";

/**
 * Aligns one query result (rows aggregated at the comparison grain) onto the
 * shared relative axis. Pure, dependency-free, unit-testable.
 */

export type RowLike = Record<string, unknown>;

export type SeriesInput = {
  rows: RowLike[];
  period: ValidatedPeriod;
  grain: ComparisonGrain;
  metricLabel: string;
  /** Optional fallback key of the timestamp column in the response */
  timeColumnLabel?: string;
  /** Shared relative axis length (max bucket count across periods) */
  axisLength: number;
  scale: Scale;
  name: string;
  color?: string;
  symbol: string;
  /** Node symbols rendered on this line (per-line marker switch) */
  showSymbol: boolean;
};

export type Series = {
  name: string;
  color?: string;
  symbol: string;
  /** Node symbols rendered on this line (per-line marker switch) */
  showSymbol: boolean;
  /** Transformed values on the relative axis (null = gap) */
  values: (number | null)[];
  /** Original values, same indexing */
  rawValues: (number | null)[];
  /** UTC epoch ms per bucket (null beyond this period's own range) */
  bucketStarts: (number | null)[];
  hasData: boolean;
};

const toFinite = (value: unknown): number | null => {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
};

/** Response timestamp → epoch ms (Superset sends epoch ms or ISO strings) */
export function rowTimestampMs(row: RowLike, timeColumnLabel?: string): number | null {
  const candidates = ["__timestamp", timeColumnLabel].filter(
    (key): key is string => Boolean(key),
  );
  for (const key of candidates) {
    if (key in row) {
      const raw = row[key];
      if (typeof raw === "number" && Number.isFinite(raw)) {
        // epoch seconds guard (ms timestamps below ~year 1973 would
        // otherwise be indistinguishable from seconds)
        return raw < 1e11 ? raw * 1000 : raw;
      }
      const parsed = parsePeriodMs(raw);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return null;
}

export function buildSeries(input: SeriesInput): Series {
  const {
    rows,
    period,
    grain,
    metricLabel,
    timeColumnLabel,
    axisLength,
    scale,
    name,
    color,
    symbol,
    showSymbol,
  } = input;

  const ownStarts = periodBucketStarts(period, grain);
  const snappedStart = snapStartMs(period.startMs, grain);
  const bucketStarts: (number | null)[] = [];
  for (let i = 0; i < axisLength; i += 1) {
    bucketStarts.push(i < ownStarts.length ? ownStarts[i] : null);
  }

  const rawValues: (number | null)[] = new Array(axisLength).fill(null);
  const safeRows = Array.isArray(rows) ? rows : [];
  safeRows.forEach(row => {
    if (!row || typeof row !== "object") {
      return;
    }
    const ts = rowTimestampMs(row, timeColumnLabel);
    if (ts === null) {
      return;
    }
    const index = bucketIndexForTs(ts, snappedStart, grain, axisLength);
    if (index < 0 || rawValues[index] !== null) {
      return;
    }
    rawValues[index] =
      metricLabel in row ? toFinite(row[metricLabel]) : null;
  });

  const values = rawValues.map(value => scale.apply(value));
  const hasData = values.some(value => value !== null);

  return {
    name,
    color,
    symbol,
    showSymbol,
    values,
    rawValues,
    bucketStarts,
    hasData,
  };
}
