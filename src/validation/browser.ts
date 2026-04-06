import type { BrowserJourney, BrowserValidationSpec } from '../contracts.js';
import type { ProductConfig } from '../types.js';

export function createBrowserValidationSpec(journeys: BrowserJourney[], config: ProductConfig): BrowserValidationSpec | null {
  if (!config.validation.browser.enabled || journeys.length === 0) {
    return null;
  }
  return {
    journeys: journeys.map(journey => ({
      name: journey.name,
      route: journey.route,
      successSignal: journey.successSignal,
      beforeFixReproduced: 'pending',
      navigationCaptured: config.validation.browser.captureNavigation ? 'pending' : 'not_applicable',
      domSnapshotCaptured: config.validation.browser.captureDomSnapshot ? 'pending' : 'not_applicable',
      screenshotCaptured: config.validation.browser.captureScreenshot ? 'pending' : 'not_applicable',
      afterFixValidated: 'pending',
      evidence: [],
    })),
    captureDomSnapshot: config.validation.browser.captureDomSnapshot,
    captureScreenshot: config.validation.browser.captureScreenshot,
    captureNavigation: config.validation.browser.captureNavigation,
    reproduceBeforeFix: true,
    validateAfterFix: true,
    ready: false,
    blockers: journeys.flatMap(journey => [
      `Browser journey "${journey.name}" must be reproduced before the fix.`,
      `Browser journey "${journey.name}" must be validated after the fix.`,
    ]),
  };
}

export function refreshBrowserValidationSpec(spec: BrowserValidationSpec | null): BrowserValidationSpec | null {
  if (!spec) return null;
  spec.blockers = [];
  for (const journey of spec.journeys) {
    if (spec.reproduceBeforeFix && journey.beforeFixReproduced !== 'passed') {
      spec.blockers.push(`Browser journey "${journey.name}" is missing pre-fix reproduction evidence.`);
    }
    if (spec.captureNavigation && journey.navigationCaptured !== 'passed') {
      spec.blockers.push(`Browser journey "${journey.name}" is missing navigation evidence.`);
    }
    if (spec.captureDomSnapshot && journey.domSnapshotCaptured !== 'passed') {
      spec.blockers.push(`Browser journey "${journey.name}" is missing DOM snapshot evidence.`);
    }
    if (spec.captureScreenshot && journey.screenshotCaptured !== 'passed') {
      spec.blockers.push(`Browser journey "${journey.name}" is missing screenshot evidence.`);
    }
    if (spec.validateAfterFix && journey.afterFixValidated !== 'passed') {
      spec.blockers.push(`Browser journey "${journey.name}" is missing post-fix validation evidence.`);
    }
  }
  spec.ready = spec.blockers.length === 0;
  return spec;
}
