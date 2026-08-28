export type TransformMode = "compact" | "structured";
export type Locale = "auto" | "zh" | "en";
export type ChangeKind = "normalized" | "removed_filler" | "deduplicated" | "structured";
export type WarningCode =
  | "nothing_to_tidy"
  | "only_protected_content"
  | "critical_content_missing"
  | "result_longer";

export interface ChangeSummary {
  kind: ChangeKind;
  description: string;
}

export interface TransformWarning {
  code: WarningCode;
  severity: "info" | "warning" | "error";
  message: string;
  category?: string;
}

export interface TransformOptions {
  mode: TransformMode;
  locale?: Locale;
}

export interface TransformMetrics {
  charactersBefore: number;
  charactersAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

export interface TransformResult {
  output: string;
  changes: ChangeSummary[];
  warnings: TransformWarning[];
  metrics: TransformMetrics;
  safeToReplace: boolean;
}
