// The dataset contract: the columns Rova expects, their units, and how to read them.
// Units come from the column names in the source CSV; nothing here is inferred from values.

export type FieldKey =
  | "sleep_duration_hours"
  | "sleep_score"
  | "hrv_ms"
  | "resting_hr_bpm"
  | "training_load"
  | "training_duration_min"
  | "temperature_deviation_c"
  | "sleeping_respiration_bpm";

export interface FieldSpec {
  key: FieldKey;
  label: string;
  /** Unit as shown in the interface. */
  unit: string;
  /** Unit as written in the CSV column name. */
  sourceUnit: string;
  /** Decimals used when showing a single day's value. */
  decimals: number;
  /** Values below zero are not physically meaningful for this field. */
  nonNegative: boolean;
  /** Show an explicit + sign (deviations). */
  signed: boolean;
}

export const DATE_COLUMN = "date";

export const FIELDS: Record<FieldKey, FieldSpec> = {
  sleep_duration_hours: { key: "sleep_duration_hours", label: "Sleep duration", unit: "h", sourceUnit: "hours", decimals: 1, nonNegative: true, signed: false },
  sleep_score: { key: "sleep_score", label: "Sleep score", unit: "", sourceUnit: "score", decimals: 0, nonNegative: true, signed: false },
  hrv_ms: { key: "hrv_ms", label: "HRV", unit: "ms", sourceUnit: "ms", decimals: 0, nonNegative: true, signed: false },
  resting_hr_bpm: { key: "resting_hr_bpm", label: "Resting heart rate", unit: "bpm", sourceUnit: "bpm", decimals: 0, nonNegative: true, signed: false },
  training_load: { key: "training_load", label: "Training load", unit: "", sourceUnit: "load", decimals: 0, nonNegative: true, signed: false },
  training_duration_min: { key: "training_duration_min", label: "Training duration", unit: "min", sourceUnit: "min", decimals: 0, nonNegative: true, signed: false },
  temperature_deviation_c: { key: "temperature_deviation_c", label: "Temperature deviation", unit: "°C", sourceUnit: "c", decimals: 1, nonNegative: false, signed: true },
  // The CSV labels this "bpm"; for respiration that means breaths per minute.
  sleeping_respiration_bpm: { key: "sleeping_respiration_bpm", label: "Sleeping respiration", unit: "br/min", sourceUnit: "bpm", decimals: 1, nonNegative: true, signed: false },
};

/** Columns in the order the CSV is expected to provide them. */
export const EXPECTED_COLUMNS: string[] = [DATE_COLUMN, ...Object.keys(FIELDS)];

export type MetricId = "sleep" | "hrv" | "rhr" | "training" | "temperature" | "respiration";

export interface MetricSpec {
  id: MetricId;
  name: string;
  /** The field charted and summarised first. */
  primary: FieldKey;
  /** Additional fields that belong to the same metric. */
  secondary?: FieldKey;
  /** Plain description of what the number is. Descriptive only, never advice. */
  about: string;
  /** A starting point for the Ask box. Static examples, not generated. */
  questions: string[];
  chart: "line" | "bar";
}

export const METRICS: MetricSpec[] = [
  { id: "sleep", name: "Sleep", primary: "sleep_duration_hours", secondary: "sleep_score", chart: "line", about: "How long you slept each night, alongside the sleep score your tracker gave that night. Both move with routine: late nights, travel and hard training days often show up here first.", questions: ["Which nights were my shortest?", "How did my sleep score track my sleep duration?"] },
  { id: "hrv", name: "HRV", primary: "hrv_ms", chart: "line", about: "Heart rate variability is the small variation in time between heartbeats, in milliseconds. It differs a lot from person to person, so it's most useful compared with your own usual range.", questions: ["When was my HRV lowest?", "How did my HRV change over the month?"] },
  { id: "rhr", name: "Resting Heart Rate", primary: "resting_hr_bpm", chart: "line", about: "Your heart rate at rest, in beats per minute, usually measured overnight. Small day-to-day shifts are normal; the trend across days says more than any single reading.", questions: ["Which days was my resting heart rate highest?", "How does this week compare with earlier weeks?"] },
  { id: "training", name: "Training", primary: "training_load", secondary: "training_duration_min", chart: "bar", about: "Training load is your tracker's score for how much effort each day's training took, shown with the minutes you trained. It has no unit; compare it with your own days.", questions: ["Which days had my highest training load?", "What did my sleep look like on my hardest training days?"] },
  { id: "temperature", name: "Temperature", primary: "temperature_deviation_c", chart: "line", about: "How far your body temperature was from your tracker's own baseline, in °C. Zero means no difference from baseline; the values are small by design.", questions: ["Which days was my temperature furthest from baseline?", "Did my temperature change on hard training days?"] },
  { id: "respiration", name: "Sleeping Respiration", primary: "sleeping_respiration_bpm", chart: "line", about: "How many breaths you took per minute while asleep. It tends to stay within a narrow band, so even small shifts stand out against your usual range.", questions: ["Which nights was my respiration highest?", "How steady was my respiration this month?"] },
];

export function metricById(id: string): MetricSpec | undefined {
  return METRICS.find((m) => m.id === id);
}
