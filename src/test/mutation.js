import { vi } from "vitest";

// Stand-in for a TanStack Query mutation result: the screens only use these fields.
export function mockMutation(result = { data: { data: {} } }) {
  return {
    mutateAsync: vi.fn().mockResolvedValue(result),
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  };
}
