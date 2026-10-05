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
import { t } from "@apache-superset/core/translation";
import type { Validation, ValidationIssue } from "./periods";

/** Translate structured validation issues into localized strings */
export function formatIssues(issues: ValidationIssue[]): string[] {
  return issues.map(issue => {
    switch (issue.type) {
      case "invalid_dates":
        return t("Period %(index)s: invalid or missing dates", {
          index: issue.index + 1,
        });
      case "end_before_start":
        return t("Period %(index)s: the end must be after the start", {
          index: issue.index + 1,
        });
      case "length_mismatch":
        return t(
          "Periods must have the same length (got %(min)s–%(max)s days)",
          {
            min: issue.min.toFixed(1),
            max: issue.max.toFixed(1),
          },
        );
      case "truncated":
        return t(
          "Only the first %(kept)s periods are used, %(dropped)s ignored",
          { kept: issue.kept, dropped: issue.dropped },
        );
      case "overlap":
        return t("Periods overlap — the intersection is compared twice");
      default:
        return "";
    }
  });
}

/** Localized issues of a validation result */
export function validationMessages(validation: Validation): {
  errors: string[];
  warnings: string[];
} {
  return {
    errors: formatIssues(validation.errors),
    warnings: formatIssues(validation.warnings),
  };
}
