// /hooks/useBackend.js
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '@/api/api';

/** GET /health */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get('/health')).data,
  });
}

/** GET /status */
export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: async () => (await api.get('/status')).data,
  });
}

/** GET /benchmarks */
export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks'],
    queryFn: async () => (await api.get('/benchmarks')).data,
  });
}

/** GET /benchmarks/files?dataset=...&q=...&limit=... */
export function useBenchmarkFiles(params) {
  return useQuery({
    queryKey: ['benchmarkFiles', params],
    queryFn: async () => (await api.get('/benchmarks/files', { params })).data,
    enabled: !!params?.dataset,
  });
}

/** GET /benchmarks/load?dataset=...&name=... */
export function useBenchmarkLoad(params) {
  return useQuery({
    queryKey: ['benchmarkLoad', params],
    queryFn: async () => (await api.get('/benchmarks/load', { params })).data,
    enabled: !!params?.dataset && !!params?.name,
  });
}

/** POST /distance-matrix */
export function useDistanceMatrix() {
  return useMutation({
    mutationFn: async (payload) =>
      (await api.post('/distance-matrix', payload)).data,
  });
}

/** POST /solver (synchronous) */
export function useSolve() {
  return useMutation({
    mutationFn: async (payload) => (await api.post('/solver', payload)).data,
  });
}

/** POST /emissions/estimate */
export function useEmissionsEstimate() {
  return useMutation({
    mutationFn: async (payload) =>
      (await api.post('/emissions/estimate', payload)).data,
  });
}
