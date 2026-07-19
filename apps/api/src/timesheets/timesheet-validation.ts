import { TimesheetEntryRowDto } from './dto/timesheet.dto';

/** The hour/shift categories captured on a timesheet entry. */
export const HOUR_CATEGORIES = [
  'hoursNormal',
  'hoursOt15',
  'hoursOt20',
  'ugShift',
  'nightHours',
] as const;

export type HourCategory = (typeof HOUR_CATEGORIES)[number];

/** A single validation error against one grid row. */
export interface RowValidationError {
  index: number;
  employeeId: string;
  date: string;
  message: string;
}

/** Coerce an optional numeric field to a concrete number (absent => 0). */
export function num(value: number | undefined): number {
  return value ?? 0;
}

/** Sum of all hour categories on a row. */
export function totalHours(row: TimesheetEntryRowDto): number {
  return HOUR_CATEGORIES.reduce((sum, cat) => sum + num(row[cat] as number | undefined), 0);
}

/**
 * Pure validation for a single grid row. Rules:
 *  - total hours across all categories must not exceed the configured max/day;
 *  - category exclusivity: normal-day hours and overtime hours cannot be booked on the
 *    same employee-day (a day is either a normal shift OR overtime, not both);
 *  - no negative values (defence-in-depth; class-validator also enforces @Min(0)).
 * Returns an error message, or null when the row is valid.
 */
export function validateRow(row: TimesheetEntryRowDto, maxHoursPerDay: number): string | null {
  for (const cat of HOUR_CATEGORIES) {
    const v = num(row[cat] as number | undefined);
    if (v < 0) {
      return `${cat} cannot be negative`;
    }
  }

  const total = totalHours(row);
  if (total > maxHoursPerDay) {
    return `total hours ${total} exceeds the maximum of ${maxHoursPerDay} per day`;
  }

  // Category exclusivity: a normal-shift day cannot also carry overtime hours.
  const hasNormal = num(row.hoursNormal) > 0;
  const hasOvertime = num(row.hoursOt15) > 0 || num(row.hoursOt20) > 0;
  if (hasNormal && hasOvertime) {
    return 'normal hours and overtime hours cannot be booked on the same day';
  }

  return null;
}

/**
 * Heuristic anomaly detector (placeholder for S9+). Flags rows that look unusual but are
 * still valid — e.g. an overtime-only day with no normal/night hours, or a very long day.
 * Never blocks the write; the flag is surfaced for reviewer attention.
 */
export function detectAnomaly(row: TimesheetEntryRowDto, maxHoursPerDay: number): boolean {
  const total = totalHours(row);
  if (total >= maxHoursPerDay * 0.9) {
    return true;
  }
  const overtimeOnly =
    (num(row.hoursOt15) > 0 || num(row.hoursOt20) > 0) &&
    num(row.hoursNormal) === 0 &&
    num(row.nightHours) === 0;
  return overtimeOnly;
}

/** Validate a batch of rows, returning any per-row errors (empty => all valid). */
export function validateRows(
  rows: TimesheetEntryRowDto[],
  maxHoursPerDay: number,
): RowValidationError[] {
  const errors: RowValidationError[] = [];
  rows.forEach((row, index) => {
    const message = validateRow(row, maxHoursPerDay);
    if (message) {
      errors.push({
        index,
        employeeId: row.employeeId,
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
        message,
      });
    }
  });
  return errors;
}
