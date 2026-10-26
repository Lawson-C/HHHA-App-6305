import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as api from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { CommunityEvent, EventType, HousingCategory, LibraryCategory } from '@/lib/api/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // Don't retry auth/permission/validation failures; they won't fix themselves.
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

export const keys = {
  me: ['me'] as const,
  alerts: (filter: api.AlertFilter) => ['alerts', filter] as const,
  alert: (id: string) => ['alert', id] as const,
  events: (month: string, types: EventType[]) => ['events', month, types] as const,
  event: (id: string) => ['event', id] as const,
  housing: (category?: HousingCategory) => ['housing', category ?? 'all'] as const,
  housingResource: (id: string) => ['housing-resource', id] as const,
  listings: ['housing-listings'] as const,
  library: (category?: LibraryCategory, search?: string) =>
    ['library', category ?? 'all', search ?? ''] as const,
  libraryResource: (id: string) => ['library-resource', id] as const,
  environment: ['environment'] as const,
  glance: ['environment-glance'] as const,
  myReports: ['my-reports'] as const,
};

export const useAlerts = (filter: api.AlertFilter = 'all') =>
  useQuery({ queryKey: keys.alerts(filter), queryFn: () => api.listAlerts(filter) });

export const useAlert = (id: string) =>
  useQuery({ queryKey: keys.alert(id), queryFn: () => api.getAlert(id) });

export const useEvents = (month: Date, types: EventType[]) => {
  const monthKey = `${month.getFullYear()}-${month.getMonth() + 1}`;
  return useQuery({
    queryKey: keys.events(monthKey, types),
    queryFn: () => api.listEvents(month, types),
  });
};

export const useEvent = (id: string) =>
  useQuery({ queryKey: keys.event(id), queryFn: () => api.getEvent(id) });

export function useToggleReminder(event: CommunityEvent | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!event) return;
      if (event.hasReminder && event.reminderId) {
        await api.removeReminder(event.documentId, event.reminderId);
      } else {
        await api.setReminder(event);
      }
    },
    onSuccess: () => event && client.invalidateQueries({ queryKey: keys.event(event.documentId) }),
  });
}

export const useHousingResources = (category?: HousingCategory) =>
  useQuery({ queryKey: keys.housing(category), queryFn: () => api.listHousingResources(category) });

export const useHousingResource = (id: string) =>
  useQuery({ queryKey: keys.housingResource(id), queryFn: () => api.getHousingResource(id) });

export const useHousingListings = () =>
  useQuery({ queryKey: keys.listings, queryFn: api.listHousingListings });

export const useLibrary = (category?: LibraryCategory, search?: string) =>
  useQuery({
    queryKey: keys.library(category, search),
    queryFn: () => api.listLibrary(category, search),
  });

export const useLibraryResource = (id: string) =>
  useQuery({ queryKey: keys.libraryResource(id), queryFn: () => api.getLibraryResource(id) });

export const useEnvironment = () =>
  useQuery({ queryKey: keys.environment, queryFn: () => api.getEnvironment() });

export const useEnvironmentGlance = () =>
  useQuery({ queryKey: keys.glance, queryFn: api.getEnvironmentGlance });

export const useMyReports = (enabled = true) =>
  useQuery({ queryKey: keys.myReports, queryFn: api.listMyReports, enabled });

/**
 * Warm the cache for the other tabs so switching to them shows content right away instead of
 * a loading state. Called once from Home; failures are ignored (the tab will just load).
 */
export function prefetchTabs() {
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthKey = `${month.getFullYear()}-${month.getMonth() + 1}`;
  return Promise.allSettled([
    queryClient.prefetchQuery({
      queryKey: keys.events(monthKey, []),
      queryFn: () => api.listEvents(month, []),
    }),
    queryClient.prefetchQuery({
      queryKey: keys.housing(undefined),
      queryFn: () => api.listHousingResources(),
    }),
    queryClient.prefetchQuery({ queryKey: keys.listings, queryFn: api.listHousingListings }),
    queryClient.prefetchQuery({
      queryKey: keys.library(undefined, ''),
      queryFn: () => api.listLibrary(),
    }),
    queryClient.prefetchQuery({ queryKey: keys.environment, queryFn: () => api.getEnvironment() }),
  ]);
}
