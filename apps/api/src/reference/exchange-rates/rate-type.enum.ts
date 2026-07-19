/**
 * Basis on which a monetary value is converted. Not a DB enum yet — it becomes a
 * stored column (money `rate_type`) in the financial core (S3). Used here for the
 * exchange-rate query API (official vs street/parallel).
 */
export enum RateType {
  OFFICIAL = 'OFFICIAL',
  PARALLEL = 'PARALLEL',
  CLIENT_RATIO = 'CLIENT_RATIO',
}
