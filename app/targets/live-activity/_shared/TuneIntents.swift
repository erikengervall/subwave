import AppIntents

// Tune in and tune out, for Siri, Shortcuts, Spotlight and automations.
//
// AudioPlaybackIntent is what lets these run in the APP's process without
// bringing it forward, launching it into the background when it is not
// running: the system grants an audio intent the right to start playback
// from there. The intents themselves only hand the action to JS
// (SubwaveIntentBridge); src/intents/tune.ts decides what tuning in means.
//
// Tune in is a LiveActivityIntent too. ActivityKit refuses a Live Activity
// request from a background app ("Requester is not foreground") unless it
// arrives inside a LiveActivityIntent's run, so without it a tune-in from
// Siri plays with no card on the Lock Screen. tune.ts holds its answer until
// the card has been asked for, keeping the request inside that run.
//
// No skip and no station picker here: every listener shares one live stream,
// and switching stations is not wired up yet.

@available(iOS 17.0, *)
struct TuneInIntent: AudioPlaybackIntent, LiveActivityIntent {
  static var title: LocalizedStringResource = "Tune in"
  static var description = IntentDescription(
    "Plays the SUB/WAVE station you listened to last, live."
  )
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try await SubwaveIntentBridge.perform("tuneIn")
    return .result()
  }
}

@available(iOS 17.0, *)
struct TuneOutIntent: AudioPlaybackIntent {
  static var title: LocalizedStringResource = "Tune out"
  static var description = IntentDescription("Stops SUB/WAVE.")
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    try await SubwaveIntentBridge.perform("tuneOut")
    return .result()
  }
}

/// Siri phrases. Every phrase must carry the app's name; "Sub Wave" and
/// "Subwave" reach it through INAlternativeAppNames (app.json), since nobody
/// says the slash.
@available(iOS 17.0, *)
struct SubwaveShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: TuneInIntent(),
      phrases: [
        "Tune in to \(.applicationName)",
        "Play \(.applicationName)",
        "Turn on \(.applicationName)",
        "Start \(.applicationName)",
      ],
      shortTitle: "Tune in",
      systemImageName: "dot.radiowaves.left.and.right"
    )
    AppShortcut(
      intent: TuneOutIntent(),
      phrases: [
        "Tune out of \(.applicationName)",
        "Stop \(.applicationName)",
        "Turn off \(.applicationName)",
      ],
      shortTitle: "Tune out",
      systemImageName: "stop.fill"
    )
  }
}
