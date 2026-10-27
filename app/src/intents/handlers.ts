// Routes App Intents (modules/app-intents) to the code that performs them.
// Registered from index.ts beside the playback service rather than from a
// screen, because an intent can launch the app into the background before any
// screen mounts.

import { setIntentHandler } from '../../modules/app-intents';
import { askForSong } from './request-reply';
import { activeStation, NO_STATION_MESSAGE } from './station';
import { tuneIn, tuneOut } from './tune';

export function registerIntentHandlers(): void {
  setIntentHandler(async (action, args) => {
    switch (action) {
      case 'tuneIn':
        return tuneIn();
      case 'tuneOut':
        return tuneOut();
      case 'request': {
        const station = await activeStation();
        if (!station) return { ok: false, message: NO_STATION_MESSAGE };
        return askForSong(args.text ?? '', { api: station.api });
      }
      default:
        return { ok: false, message: 'Update SUB/WAVE to use this.' };
    }
  });
}
