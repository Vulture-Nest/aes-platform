import { overAllocation } from './stores-withdrawals.service';

describe('overAllocation', () => {
  it('does not flag when there is no allocation', () => {
    expect(overAllocation(100, null)).toEqual({ overAllocation: false, variance: null });
    expect(overAllocation(100, undefined)).toEqual({ overAllocation: false, variance: null });
  });

  it('flags when drawn exceeds allocation and reports the variance', () => {
    expect(overAllocation(120, 100)).toEqual({ overAllocation: true, variance: 20 });
  });

  it('does not flag when drawn is at or below allocation', () => {
    expect(overAllocation(100, 100)).toEqual({ overAllocation: false, variance: 0 });
    expect(overAllocation(80, 100)).toEqual({ overAllocation: false, variance: -20 });
  });
});
