import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { ToastProvider } from '@planner/ui';
import type { ReactElement } from 'react';
import type { QueryClient as QueryClientType } from '@tanstack/react-query';

export function renderWithProviders(
  ui: ReactElement,
  route = '/',
): RenderResult & { queryClient: QueryClientType } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <ToastProvider>{ui}</ToastProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
