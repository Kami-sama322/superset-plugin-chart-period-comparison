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

import type { YScaleType } from "./types";

/**
 * Vertical scale functions. The chart plots transformed values and formats
 * axis labels with the inverse function, so axis ticks and series labels
 * show the original (unscaled) numbers.
 */
export type Scale = {
  id: YScaleType;
  /** Value → plotted value (null for values the scale cannot represent) */
  apply: (value: number | null) => number | null;
  /** Plotted value → original value (axis labels, mark points) */
  invert: (value: number | null) => number | null;
};

const linear: Scale = {
  id: "linear",
  apply: value => value,
  invert: value => value,
};

const sqrt: Scale = {
  id: "sqrt",
  apply: value =>
    value === null || value < 0 ? null : Math.sqrt(value),
  invert: value => (value === null || value < 0 ? null : value * value),
};

const log: Scale = {
  id: "log",
  apply: value =>
    value === null || value <= 0 ? null : Math.log10(value),
  invert: value => (value === null ? null : Math.pow(10, value)),
};

const power2: Scale = {
  id: "power2",
  apply: value => (value === null ? null : value * value),
  invert: value => (value === null || value < 0 ? null : Math.sqrt(value)),
};

export const SCALES: Record<YScaleType, Scale> = {
  linear,
  sqrt,
  log,
  power2,
};

export function getScale(id: YScaleType | undefined | null): Scale {
  return (id && SCALES[id]) || linear;
}
