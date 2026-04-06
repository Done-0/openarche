import type { ObservabilitySpec } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createObservabilitySpec(services: string[], objective: string, config: ProductConfig): ObservabilitySpec {
  return {
    logs: config.observability.logs ? services.map(service => `service="${service}" |~ "${objective}"`) : [],
    metrics: config.observability.metrics ? services.map(service => `latency_ms{service="${service}"}`) : [],
    traces: config.observability.traces ? services.map(service => `service:${service} "${objective}"`) : [],
    evidence: [],
    ready: false,
    blockers: [
      ...(config.observability.logs ? ['Log evidence has not been attached.'] : []),
      ...(config.observability.metrics ? ['Metric evidence has not been attached.'] : []),
      ...(config.observability.traces ? ['Trace evidence has not been attached.'] : []),
    ],
  };
}

export function refreshObservabilitySpec(spec: ObservabilitySpec | null): ObservabilitySpec | null {
  if (!spec) return null;
  if (spec.logs.length === 0 && spec.metrics.length === 0 && spec.traces.length === 0) {
    spec.blockers = [];
    spec.ready = true;
    return spec;
  }
  spec.blockers = spec.evidence.length > 0 ? [] : ['Observability evidence has not been attached.'];
  spec.ready = spec.blockers.length === 0;
  return spec;
}
