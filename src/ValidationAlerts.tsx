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
import { useTheme } from "@apache-superset/core/theme";

type Props = {
  errors: string[];
  warnings: string[];
};

/**
 * Shared validation alert list of the periods editor (the on-chart toolbar
 * and the Explore control render the same structured issues).
 */
export default function ValidationAlerts({ errors, warnings }: Props) {
  const theme = useTheme();
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }
  return (
    <div role="alert" style={{ fontSize: 12, lineHeight: 1.4 }}>
      {errors.map(message => (
        <div key={message} style={{ color: theme.colorError }}>
          {message}
        </div>
      ))}
      {warnings.map(message => (
        <div key={message} style={{ color: theme.colorWarning }}>
          {message}
        </div>
      ))}
    </div>
  );
}
