import { Select, SelectProps } from 'antd';
import { useGetLookupsQuery } from '../api/api';

interface LookupSelectProps extends Omit<SelectProps, 'options' | 'loading'> {
  /** Settings catalog category to pull options from (e.g. 'currency', 'account_type'). */
  category: string;
}

/**
 * A <Select> whose options come from the admin-managed settings catalog.
 * Use this for every configurable dropdown so options are never hardcoded.
 */
export function LookupSelect({ category, ...rest }: LookupSelectProps) {
  const { data, isLoading } = useGetLookupsQuery(category);
  const options = (data ?? [])
    .filter((r) => r.active)
    .map((r) => ({ label: r.label, value: r.code }));
  return <Select loading={isLoading} options={options} {...rest} />;
}
