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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dayjs } from "dayjs";
import {
  MAX_PERIODS,
  validatePeriods,
  type PeriodRange,
  type Validation,
} from "./periods";

type PickerValue = [Dayjs | null, Dayjs | null] | null;

type Args = {
  /** Authoritative value from props (ownState / control value) */
  value: PeriodRange[];
  /**
   * Called with the next list on every committed edit. When `commitInvalid`
   * is false the edit is only committed for valid sets.
   */
  onCommit: (next: PeriodRange[]) => void;
  /** Explore control emits even invalid lists (buildQuery reports details) */
  commitInvalid?: boolean;
};

const serialize = (periods: PeriodRange[]) => JSON.stringify(periods);

const toIso = (value: Dayjs | null): string =>
  value ? value.format("YYYY-MM-DD") : "";

/**
 * Shared editor state for the 1..5 period pickers (on-chart toolbar and the
 * Explore control): draft list, validation, add/remove/range-change with
 * sync-back from the authoritative prop value.
 */
export function usePeriodsList({
  value,
  onCommit,
  commitInvalid = false,
}: Args) {
  const [draft, setDraft] = useState<PeriodRange[]>(value);
  const lastSyncedRef = useRef<string>(serialize(value));

  // keep the pickers in sync with externally applied state
  useEffect(() => {
    const serialized = serialize(value);
    if (serialized !== lastSyncedRef.current) {
      lastSyncedRef.current = serialized;
      setDraft(value);
    }
  }, [value]);

  const validation: Validation = useMemo(
    () => validatePeriods(draft),
    [draft],
  );

  const apply = useCallback(
    (next: PeriodRange[]) => {
      setDraft(next);
      const nextValidation = validatePeriods(next);
      // the toolbar only commits valid sets; the Explore control always
      // emits so buildQuery can report the problem in the editor
      if (!commitInvalid) {
        if (nextValidation.errors.length > 0) {
          return;
        }
        if (nextValidation.periods.length === 0) {
          return;
        }
      }
      lastSyncedRef.current = serialize(next);
      onCommit(next);
    },
    [commitInvalid, onCommit],
  );

  const onRangeChange = useCallback(
    (index: number, values: PickerValue) => {
      apply(
        draft.map((period, position) =>
          position === index
            ? {
                start: toIso(values?.[0] ?? null),
                end: toIso(values?.[1] ?? null),
              }
            : period,
        ),
      );
    },
    [draft, apply],
  );

  const addPeriod = useCallback(() => {
    if (draft.length >= MAX_PERIODS) {
      return;
    }
    const last = draft[draft.length - 1];
    apply([...draft, last ? { ...last } : { start: "", end: "" }]);
  }, [draft, apply]);

  const removePeriod = useCallback(
    (index: number) => {
      if (draft.length <= 1) {
        return;
      }
      apply(draft.filter((_, position) => position !== index));
    },
    [draft, apply],
  );

  return {
    draft,
    validation,
    canAdd: draft.length < MAX_PERIODS,
    /** at least one period is always kept */
    canRemove: draft.length > 1,
    onRangeChange,
    addPeriod,
    removePeriod,
  };
}
