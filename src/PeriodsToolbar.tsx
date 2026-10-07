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
import { useCallback } from "react";
import { t } from "@apache-superset/core/translation";
import { useTheme } from "@apache-superset/core/theme";
import { RangePicker } from "@superset-ui/core/components";
import { Button, Space } from "antd";
import dayjs from "dayjs";
import { buildPeriodsDataMask } from "./crossFilter";
import { validationMessages } from "./periodMessages";
import { usePeriodsList } from "./usePeriodsList";
import ValidationAlerts from "./ValidationAlerts";
import type { PeriodRange } from "./periods";

type Props = {
  periods: PeriodRange[];
  timeColumn: string;
  setDataMask: (mask: unknown) => void;
};

/**
 * On-chart date filter: 1..5 range pickers. Every valid change is emitted as
 * a data mask: ownState re-queries this chart, the span TEMPORAL_RANGE
 * cross-filters the other charts. Invalid sets show an inline error and keep
 * the last applied state.
 */
export default function PeriodsToolbar({ periods, timeColumn, setDataMask }: Props) {
  const theme = useTheme();
  const onCommit = useCallback(
    (next: PeriodRange[]) => {
      setDataMask(buildPeriodsDataMask(next, timeColumn));
    },
    [setDataMask, timeColumn],
  );

  const {
    draft,
    validation,
    canAdd,
    canRemove,
    onRangeChange,
    addPeriod,
    removePeriod,
  } = usePeriodsList({ value: periods, onCommit });

  const { errors, warnings } = validationMessages(validation);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: theme.sizeUnit / 2,
        }}
      >
        {draft.map((period, index) => (
          <Space key={index} size={0}>
            <RangePicker
              size="small"
              allowEmpty={[true, true]}
              format="DD.MM.YYYY"
              value={[
                period.start ? dayjs(period.start) : null,
                period.end ? dayjs(period.end) : null,
              ]}
              onChange={values => onRangeChange(index, values)}
              aria-label={t("Period %(index)s", { index: index + 1 })}
            />
            <Button
              size="small"
              type="text"
              aria-label={t("Remove period %(index)s", { index: index + 1 })}
              disabled={!canRemove}
              onClick={() => removePeriod(index)}
            >
              ×
            </Button>
          </Space>
        ))}
        <Button size="small" disabled={!canAdd} onClick={addPeriod}>
          + {t("Period")}
        </Button>
      </div>
      <ValidationAlerts errors={errors} warnings={warnings} />
    </div>
  );
}
