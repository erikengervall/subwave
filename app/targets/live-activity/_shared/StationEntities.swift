import AppIntents
import CoreSpotlight
import Foundation

// The listener's saved stations, for Siri ("play Night Shift on SUB/WAVE"),
// Shortcuts (Tune in's Station parameter) and Spotlight (iOS 18).
//
// Swift cannot read the app's station store, so StationContext mirrors the
// list into the App Group (modules/app-intents setStations), and every type
// here reads that. Names and credential-free bases only: a station's login and
// password stay in the app's keychain, and tuning in is JS's job
// (src/intents/tune.ts), handed a station's base as its id.
//
// App target only, like SubwaveShortcuts.swift.
#if canImport(ExpoModulesCore)

/// The stations as the app last wrote them. The key is matched by STRING with
/// modules/app-intents/ios/SubwaveAppIntentsModule.swift.
struct SavedStations: Decodable {
  struct Station: Decodable {
    let id: String
    let name: String
  }

  let active: String?
  let stations: [Station]

  static func load() -> SavedStations {
    guard
      let json = UserDefaults(suiteName: "group.com.getsubwave.app")?.string(forKey: "subwave.stations"),
      let decoded = try? JSONDecoder().decode(SavedStations.self, from: Data(json.utf8))
    else { return SavedStations(active: nil, stations: []) }
    return decoded
  }

  var activeStation: Station? {
    stations.first { $0.id == active } ?? stations.first
  }

  /// Stations whose name contains the term or is contained in it, for
  /// transcribed speech ("night shift" against "Night Shift Radio").
  func matching(_ term: String) -> [Station] {
    let term = term.trimmingCharacters(in: .whitespaces)
    guard !term.isEmpty else { return [] }
    return stations.filter {
      $0.name.localizedStandardContains(term) || term.localizedStandardContains($0.name)
    }
  }
}

@available(iOS 17.0, *)
struct StationEntity: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Station"
  static var defaultQuery = StationQuery()

  /// The station's credential-free base URL.
  let id: String
  let name: String

  init(_ station: SavedStations.Station) {
    id = station.id
    name = station.name
  }

  var displayRepresentation: DisplayRepresentation {
    let host = URL(string: id)?.host() ?? id
    return DisplayRepresentation(title: "\(name)", subtitle: "\(host)")
  }
}

@available(iOS 18.0, *)
extension StationEntity: IndexedEntity {}

@available(iOS 17.0, *)
struct StationQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [StationEntity] {
    SavedStations.load().stations.filter { identifiers.contains($0.id) }.map(StationEntity.init)
  }

  func entities(matching string: String) async throws -> [StationEntity] {
    SavedStations.load().matching(string).map(StationEntity.init)
  }

  func suggestedEntities() async throws -> [StationEntity] {
    SavedStations.load().stations.map(StationEntity.init)
  }
}

/// A station tapped in Spotlight: open SUB/WAVE on it, playing.
@available(iOS 17.0, *)
struct OpenStationIntent: OpenIntent {
  static var title: LocalizedStringResource = "Open station"
  static var description = IntentDescription("Opens SUB/WAVE on a saved station and tunes in.")

  @Parameter(title: "Station")
  var target: StationEntity

  func perform() async throws -> some IntentResult {
    try await SubwaveIntentBridge.perform("tuneIn", ["station": target.id])
    return .result()
  }
}

/// Rebuilds what the system holds about the saved stations: the Siri phrases
/// with a station in them, and the Spotlight index. The app-intents module
/// calls `reindex` by class name after it writes a new list, because this
/// target sees the entity types and that pod does not.
@objc(SubwaveStationIndex)
final class StationIndex: NSObject {
  @objc static func reindex() {
    if #available(iOS 17.0, *) {
      SubwaveShortcuts.updateAppShortcutParameters()
    }
    guard #available(iOS 18.0, *) else { return }
    let entities = SavedStations.load().stations.map(StationEntity.init)
    Task {
      // Delete first: a station the listener forgot must leave Spotlight too.
      let index = CSSearchableIndex.default()
      try? await index.deleteAppEntities(ofType: StationEntity.self)
      try? await index.indexAppEntities(entities)
    }
  }
}

#endif
