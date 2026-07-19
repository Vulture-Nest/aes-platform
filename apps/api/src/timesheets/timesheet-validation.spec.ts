import { TimesheetEntryRowDto } from './dto/timesheet.dto';
import { detectAnomaly, totalHours, validateRow, validateRows } from './timesheet-validation';

function row(partial: Partial<TimesheetEntryRowDto>): TimesheetEntryRowDto {
  return {
    employeeId: 'e1',
    date: new Date('2026-07-15'),
    ...partial,
  } as TimesheetEntryRowDto;
}

describe('timesheet validation', () => {
  describe('validateRow — max hours/day', () => {
    it('accepts a row within the max', () => {
      expect(validateRow(row({ hoursNormal: 8 }), 24)).toBeNull();
    });

    it('rejects a row whose total hours exceed the configured max', () => {
      const msg = validateRow(row({ hoursNormal: 20, nightHours: 6 }), 24);
      expect(msg).toMatch(/exceeds the maximum of 24/);
    });

    it('honours a lowered configurable max', () => {
      expect(validateRow(row({ hoursNormal: 13 }), 12)).toMatch(/exceeds the maximum of 12/);
    });

    it('rejects negative hours', () => {
      expect(validateRow(row({ hoursNormal: -1 }), 24)).toMatch(/cannot be negative/);
    });
  });

  describe('validateRow — category exclusivity', () => {
    it('rejects normal hours booked alongside overtime on the same day', () => {
      expect(validateRow(row({ hoursNormal: 8, hoursOt15: 2 }), 24)).toMatch(
        /cannot be booked on the same day/,
      );
    });

    it('allows overtime-only days', () => {
      expect(validateRow(row({ hoursOt15: 3, hoursOt20: 1 }), 24)).toBeNull();
    });

    it('allows normal hours with night/ug allowances (not overtime)', () => {
      expect(validateRow(row({ hoursNormal: 8, nightHours: 4, ugShift: 1 }), 24)).toBeNull();
    });
  });

  describe('totalHours', () => {
    it('sums every category', () => {
      expect(
        totalHours(row({ hoursNormal: 8, hoursOt15: 2, hoursOt20: 1, ugShift: 1, nightHours: 3 })),
      ).toBe(15);
    });
  });

  describe('detectAnomaly (placeholder)', () => {
    it('flags overtime-only days', () => {
      expect(detectAnomaly(row({ hoursOt15: 3 }), 24)).toBe(true);
    });

    it('flags very long days (>=90% of max)', () => {
      expect(detectAnomaly(row({ hoursNormal: 22 }), 24)).toBe(true);
    });

    it('does not flag an ordinary shift', () => {
      expect(detectAnomaly(row({ hoursNormal: 8, nightHours: 2 }), 24)).toBe(false);
    });
  });

  describe('validateRows (batch)', () => {
    it('returns indexed errors for each invalid row', () => {
      const errors = validateRows(
        [row({ hoursNormal: 8 }), row({ hoursNormal: 30 }), row({ hoursNormal: 8, hoursOt20: 1 })],
        24,
      );
      expect(errors).toHaveLength(2);
      expect(errors[0].index).toBe(1);
      expect(errors[1].index).toBe(2);
    });

    it('returns an empty array when all rows are valid', () => {
      expect(validateRows([row({ hoursNormal: 8 }), row({ hoursOt15: 2 })], 24)).toEqual([]);
    });
  });
});
