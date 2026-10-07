/*
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
import { ControlHeader } from "@superset-ui/chart-controls";
import { Button, Space } from "antd";
import dayjs from "dayjs";
import { validationMessages } from "../periodMessages";
import { usePeriodsList } from "../usePeriodsList";
import ValidationAlerts from "../ValidationAlerts";
import type { PeriodRange } from "../periods";

type Props = {
  value?: PeriodRange[] | null;
  onChange?: (value: PeriodRange[]) => void;
  label?: string;
  description?: string;
  name?: string;
};

/**
 * Explore-side editor of the 1..5 comparison periods. On the dashboard the
 * same pickers live on the chart itself; this control defines the defaults.
 * Invalid lists are still emitted so buildQuery reports details in the
 * editor error banner.
 */
export default function PeriodsControl({
  value,
  onChange,
  ...headerProps
}: Props) {
  const theme = useTheme();
  const onCommit = useCallback(
    (next: PeriodRange[]) => {
      onChange?.(next);
    },
    [onChange],
  );

  const {
    draft,
    validation,
    canAdd,
    canRemove,
    onRangeChange,
    addPeriod,
    removePeriod,
  } = usePeriodsList({
    value: Array.isArray(value) ? value : [],
    onCommit,
    commitInvalid: true,
  });

  const { errors, warnings } = validationMessages(validation);

  return (
    <div>
      <ControlHeader {...headerProps} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: theme.sizeUnit / 2,
        }}
      >
        {draft.map((period, index) => (
          <Space key={index} size={4}>
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
        <div>
          <Button size="small" disabled={!canAdd} onClick={addPeriod}>
            + {t("Period")}
          </Button>
        </div>
        <ValidationAlerts errors={errors} warnings={warnings} />
      </div>
    </div>
  );
}
