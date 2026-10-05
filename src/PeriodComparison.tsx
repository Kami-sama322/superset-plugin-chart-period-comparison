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
import { useEffect, useMemo } from "react";
import { t } from "@apache-superset/core/translation";
import { styled, useTheme } from "@apache-superset/core/theme";
import { applyThemeColors } from "./chartOptions";
import Echart from "./Echart";
import PeriodsToolbar from "./PeriodsToolbar";
import type { PeriodComparisonTransformedProps, StatusKind } from "./types";

const Styles = styled.div<{ width: string; height: string }>`
  height: ${({ height }) => height};
  width: ${({ width }) => width};
  display: flex;
  flex-direction: column;
`;

const ToolbarRow = styled.div<{ height: string }>`
  flex: 0 0 auto;
  min-height: ${({ height }) => height};
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.sizeUnit / 2}px
    ${({ theme }) => theme.sizeUnit}px 0;
`;

const Status = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colorTextSecondary};
  font-size: 14px;
  padding: ${({ theme }) => theme.sizeUnit * 2}px;
  text-align: center;
`;

const ChartBox = styled.div`
  flex: 1 1 auto;
  min-height: 0;
`;

const FilterPlaque = styled.div`
  flex: 0 0 auto;
  min-height: ${({ height }) => height};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit / 2}px;
  padding: ${({ theme }) => theme.sizeUnit / 2}px
    ${({ theme }) => theme.sizeUnit}px 0;
  font-size: 12px;
  color: ${({ theme }) => theme.colorTextSecondary};
`;

const STATUS_MESSAGES: Record<Exclude<StatusKind, null>, string> = {
  no_metric: "Select a metric",
  no_time_column: "Select a time column",
  no_periods: "Add at least one period",
  no_data: "No data for the selected periods",
};

const TOOLBAR_HEIGHT = 44;

export default function PeriodComparison(props: PeriodComparisonTransformedProps) {
  const {
    width,
    height,
    echartOptions,
    statusKind,
    periods,
    periodsSource,
    periodsLabel,
    appliedDateRangeLabel,
    timeColumn,
    setDataMask,
    filterState,
  } = props;
  const theme = useTheme();

  const themedOptions = useMemo(
    () =>
      applyThemeColors(echartOptions, {
        text: theme.colorText,
        textSecondary: theme.colorTextSecondary,
        line: theme.colorSplit,
        surface: theme.colorBgContainer,
      }),
    [echartOptions, theme],
  );

  // When ANY date filter takes over, the chart's OWN previously emitted
  // mask (pickers' span + ownState) is still stored in the dashboard state
  // and AND-narrows both this chart's queries and the other charts. Clear
  // it exactly once on the transition.
  const staleOwnMask =
    (periodsSource === "filter" || periodsSource === "date_filter") &&
    filterState?.value != null;
  useEffect(() => {
    if (staleOwnMask) {
      setDataMask({
        ownState: {},
        extraFormData: { filters: [] },
        filterState: { value: null },
      });
    }
  }, [staleOwnMask, setDataMask]);

  const hasToolbar = Boolean(timeColumn);

  return (
    <Styles
      width={typeof width === "number" ? `${width}px` : width}
      height={typeof height === "number" ? `${height}px` : height}
    >
      {hasToolbar ? (
        periodsSource === "filter" ? (
          <FilterPlaque height={`${TOOLBAR_HEIGHT}px`}>
            <span>
              {t("Periods from filter")}: {periodsLabel || "—"}
            </span>
          </FilterPlaque>
        ) : periodsSource === "date_filter" ? (
          <FilterPlaque height={`${TOOLBAR_HEIGHT}px`}>
            <span>
              {t("Filtered by a dashboard date filter")}:{" "}
              {appliedDateRangeLabel || "—"}
            </span>
          </FilterPlaque>
        ) : (
          <ToolbarRow height={`${TOOLBAR_HEIGHT}px`}>
            <PeriodsToolbar
              periods={periods}
              timeColumn={timeColumn}
              setDataMask={setDataMask}
            />
          </ToolbarRow>
        )
      ) : null}
      {statusKind ? (
        <Status role="status">
          {statusKind === "no_periods" && periodsSource === "filter"
            ? t(
                "Periods are controlled by a date filter — select ranges in the filter",
              )
            : t(STATUS_MESSAGES[statusKind])}
        </Status>
      ) : (
        <ChartBox>
          <Echart
            options={themedOptions}
            ariaLabel={t(
              "Period comparison line chart: metric values of up to 5 periods on a relative axis",
            )}
          />
        </ChartBox>
      )}
    </Styles>
  );
}
