import { api as baseApi } from '../../api/api';

// Register our own tag type without editing the shared api.ts (other agents run
// in parallel). enhanceEndpoints lets us add a tagType from within the feature.
const api = baseApi.enhanceEndpoints({ addTagTypes: ['ImportParity'] });

export type ImportWhich = 'cashflow' | 'payroll' | 'manhours' | 'all';

export interface TableCounts {
  created: number;
  updated: number;
}

export interface ImportResult {
  which: ImportWhich;
  perTable: Record<string, TableCounts>;
  errors: string[];
}

export interface ParityCheck {
  name: string;
  expected: number;
  actual: number;
  delta: number;
  pass: boolean;
}

export interface ParityResult {
  checks: ParityCheck[];
  verdict: string;
  verdictExpected: string;
  verdictPass: boolean;
  allPass: boolean;
  tolerance: number;
}

export const dataImportApi = api.injectEndpoints({
  endpoints: (build) => ({
    importWorkbook: build.mutation<ImportResult, { which: ImportWhich }>({
      query: (body) => ({
        url: 'v1/import/workbook',
        method: 'POST',
        body,
      }),
      // Re-fetch parity (and downstream financials) after an import.
      invalidatesTags: ['ImportParity'],
    }),
    getParity: build.query<ParityResult, void>({
      query: () => ({ url: 'v1/import/parity' }),
      providesTags: ['ImportParity'],
    }),
  }),
});

export const { useImportWorkbookMutation, useGetParityQuery } = dataImportApi;
