// Routes App Intents (modules/app-intents) to the code that performs them.
// Registered from index.ts beside the playback service rather than from a
// screen, because an intent can launch the app into the background before any
// screen mounts.

import { setIntentHandler } from '../../modules/app-intents';
import { tuneIn, tuneOut } from './tune';

export function registerIntentHandlers(): void {
  setIntentHandler(async (action) => {
    switch (action) {
      case 'tuneIn':
        return tuneIn();
      case 'tuneOut':
        return tuneOut();
      default:
        return { ok: false, message: 'Update SUB/WAVE to use this.' };
    }
  });
}
