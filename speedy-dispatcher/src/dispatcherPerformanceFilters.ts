export const DISPATCHER_PERFORMANCE_SOURCE_GROUPS = [
  "APP",
  "ONLINE",
  "MANUAL",
  "UNKNOWN",
] as const;

export type DispatcherPerformanceSourceGroup =
  (typeof DISPATCHER_PERFORMANCE_SOURCE_GROUPS)[number];

export const toggleDispatcherPerformanceFilter = <T extends string>(
  selectedValues: T[],
  value: T
): T[] =>
  selectedValues.includes(value)
    ? selectedValues.filter((selectedValue) => selectedValue !== value)
    : [...selectedValues, value];

export const buildDispatcherPerformanceRequestBody = (filters: {
  startDate: string;
  endDate: string;
  dispatcherIds: string[];
  sourceGroups: DispatcherPerformanceSourceGroup[];
}) => {
  return {
    startDate: filters.startDate,
    endDate: filters.endDate,
    ...(filters.dispatcherIds.length > 0
      ? { dispatcherIds: filters.dispatcherIds }
      : {}),
    ...(filters.sourceGroups.length > 0
      ? { sourceGroups: filters.sourceGroups }
      : {}),
  };
};
