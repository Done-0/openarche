import type { MaintenanceSpec, ProductManifest } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createMaintenanceSpec(manifest: ProductManifest, config: ProductConfig): MaintenanceSpec {
  const cleanupTasks: string[] = [];
  if (config.maintenance.driftSweep) {
    cleanupTasks.push('Prune stale or contradictory guidance.');
    cleanupTasks.push('Refactor duplicated low-signal helpers.');
  }
  if (config.maintenance.qualitySweep) {
    cleanupTasks.push('Refresh quality score for product capabilities.');
  }

  for (const capability of Object.values(manifest.capabilities)) {
    if (config.maintenance.qualitySweep && capability.maturity !== 'operational') {
      cleanupTasks.push(`Advance ${capability.name} from ${capability.maturity}.`);
    }
  }

  return {
    qualitySweep: config.maintenance.qualitySweep,
    driftSweep: config.maintenance.driftSweep,
    cleanupTasks,
    knowledgeCapture: 'pending',
    knowledgeCaptureSummary: 'Knowledge capture has not started.',
    followupsRecorded: true,
    ready: false,
    blockers: ['Knowledge capture has not finished.'],
  };
}

export function refreshMaintenanceSpec(spec: MaintenanceSpec): MaintenanceSpec {
  spec.blockers = [];
  if (spec.knowledgeCapture === 'pending' || spec.knowledgeCapture === 'queued') {
    spec.blockers.push('Knowledge capture closeout is still open.');
  }
  if (spec.knowledgeCapture === 'failed') {
    spec.blockers.push('Knowledge capture closeout failed and must be retried or acknowledged.');
  }
  if (!spec.followupsRecorded) {
    spec.blockers.push('Maintenance follow-ups have not been recorded.');
  }
  spec.ready = spec.blockers.length === 0;
  return spec;
}
