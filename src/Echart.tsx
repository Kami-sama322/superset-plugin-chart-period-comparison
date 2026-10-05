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
import { useEffect, useRef } from "react";
import { styled } from "@apache-superset/core/theme";
import * as echarts from "echarts";

const Styles = styled.div`
  height: 100%;
  width: 100%;
  min-height: 0;
  overflow: hidden;
`;

type EchartProps = {
  options: Record<string, unknown>;
  /** Accessible description of the chart for screen readers */
  ariaLabel?: string;
};

/**
 * Minimal echarts wrapper: the canvas fills its parent box (flex layout
 * decides the size), and a ResizeObserver keeps the chart in sync with the
 * container — toolbar growth, panel resizes and dashboard layout changes
 * never clip the bottom (data zoom slider) of the chart.
 */
export default function Echart({ options, ariaLabel }: EchartProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const div = divRef.current;
    if (!div) {
      return undefined;
    }
    chartRef.current = echarts.init(div);
    const observer = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    observer.observe(div);
    return () => {
      observer.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(options, { notMerge: true });
  }, [options]);

  return (
    <Styles
      ref={divRef}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
