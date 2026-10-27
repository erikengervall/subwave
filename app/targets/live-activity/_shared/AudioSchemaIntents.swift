import AppIntents

// "Hey Siri, play SUB/WAVE" on iOS 27.
//
// iOS 27 sends a bare "play <app>" through Siri's audio search, and an app
// that has not adopted the audio App Schema loses it to Apple Music, App
// Shortcut phrase or not (WXYC's radio app hit exactly this on iOS 27.0.1).
// Adopting it takes three pieces: a `.audio.liveRadioStation` entity, a query
// that answers Siri's AudioSearch (`IntentValueQuery`: a bare "play SUB/WAVE"
// arrives as `.unspecified`, which a string query never sees), and a
// `.audio.playAudio` intent, which tunes in exactly as TuneInIntent does.
//
// The entity is "the station you listened to last", one entity for now:
// SUB/WAVE plays a live stream, so any words left in the request ("radio",
// a song title) resolve to tuning in rather than to "not found". Switching
// stations by name is not wired up yet.
//
// Gated on Swift 6.4 (the iOS 27 SDK), where these schema symbols exist; an
// older Xcode compiles this out and "play SUB/WAVE" stays on the App Shortcut
// phrase. App target only, like SubwaveShortcuts.swift.
#if compiler(>=6.4) && canImport(ExpoModulesCore)
#if canImport(MediaIntents)
import MediaIntents
#endif

@available(iOS 27.0, *)
@AppEntity(schema: .audio.liveRadioStation)
struct LiveStationEntity {
  static let defaultQuery = LiveStationQuery()
  static let activeID = "active"

  let id: String
  /// What Siri says back: the station's own name, which the app keeps in the
  /// App Group (StationContext → setStationName), SUB/WAVE before it has one.
  var title: String
  var providerName: String?

  init() {
    self.id = Self.activeID
    self.title =
      UserDefaults(suiteName: "group.com.getsubwave.app")?.string(forKey: "subwave.stationName")
      ?? "SUB/WAVE"
    self.providerName = "SUB/WAVE"
  }

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "\(title)")
  }
}

@available(iOS 27.0, *)
struct LiveStationQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [LiveStationEntity] {
    identifiers.contains(LiveStationEntity.activeID) ? [LiveStationEntity()] : []
  }

  /// Shortcuts' text search, typed against every entity type the app has:
  /// only the station's or the app's own name matches.
  func entities(matching string: String) async throws -> [LiveStationEntity] {
    let station = LiveStationEntity()
    let term = string.trimmingCharacters(in: .whitespaces)
    let names = [station.title, "SUB/WAVE", "subwave", "sub wave"]
    return names.contains(where: { $0.localizedStandardContains(term) || term.localizedStandardContains($0) })
      ? [station] : []
  }

  func suggestedEntities() async throws -> [LiveStationEntity] {
    [LiveStationEntity()]
  }
}

#if canImport(MediaIntents)
/// Siri's audio search, consulted once Siri has chosen SUB/WAVE. `.unspecified`
/// is "play SUB/WAVE" and nothing else; `.searchQuery` is whatever words were
/// left over. Both tune in. A link is never claimed: a station lives at the
/// listener's own host, which Swift does not know.
@available(iOS 27.0, *)
extension LiveStationQuery: IntentValueQuery {
  func values(for search: AudioSearch) async throws -> [LiveStationEntity] {
    switch search.criteria {
    case .unspecified, .searchQuery:
      return [LiveStationEntity()]
    case .url:
      return []
    @unknown default:
      return []
    }
  }
}
#endif

@available(iOS 27.0, *)
@UnionValue
enum AudioItem {
  case liveRadioStation(LiveStationEntity)
}

/// Required by the schema. A live stream has no shuffle or repeat, so these
/// are accepted and ignored.
@available(iOS 27.0, *)
@AppEnum(schema: .audio.playbackAttributes)
enum PlaybackAttributes: String {
  case shuffle
  case `repeat`

  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .shuffle: "Shuffle",
    .repeat: "Repeat",
  ]
}

/// Required by the schema; there is no queue to insert into.
@available(iOS 27.0, *)
@AppEnum(schema: .audio.queueInsertionLocation)
enum QueueInsertionLocation: String {
  case next
  case tail

  static let caseDisplayRepresentations: [Self: DisplayRepresentation] = [
    .next: "Next",
    .tail: "Tail",
  ]
}

/// Required by the schema; SUB/WAVE has nothing to warm up.
@available(iOS 27.0, *)
@AppEntity(schema: .audio.warmupAudioQueueResult)
struct WarmupAudioQueueResult: TransientAppEntity {
  init() {}

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: "Queue")
  }
}

/// Assistant-only: Shortcuts already lists Tune in, and a schema intent beside
/// an App Shortcut for the same action shows as a duplicate there.
/// LiveActivityIntent for the same reason as TuneInIntent: the card can only
/// start inside its run.
@available(iOS 27.0, *)
@AppIntent(schema: .audio.playAudio)
struct PlayStationAudioIntent: AudioPlaybackIntent, LiveActivityIntent {
  static let isAssistantOnly = true

  var audioEntity: AudioItem
  var playbackAttributes: Set<PlaybackAttributes>
  var warmupAudioQueueResult: WarmupAudioQueueResult?
  var queueLocation: QueueInsertionLocation?

  func perform() async throws -> some IntentResult {
    try await SubwaveIntentBridge.perform("tuneIn")
    return .result()
  }
}

#endif
