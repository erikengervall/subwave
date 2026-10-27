import ExpoModulesCore
import Foundation

// The app half of the App Intents bridge: Siri, Shortcuts and Controls ask,
// JS answers.
//
// The intent half is targets/live-activity/_shared/SubwaveIntentBridge.swift.
// It compiles into the app target (and the widget, which needs the intent
// types for its controls) and cannot import this pod, so the two meet on
// in-process NotificationCenter names, matched by STRING. Change one side,
// change both.
//
// An intent can run before React Native has finished booting: Siri, Shortcuts
// or a Control can launch a killed app straight into the background. So a
// request is acknowledged as soon as this module exists, held until JS
// subscribes, and the intent keeps re-posting until it sees the ack. The work
// itself is all JS (src/intents/), through the same station store, credential
// vault and player the UI uses, which keeps station URLs and credentials out
// of Swift, as LikeTrackIntent does.

private let requestName = Notification.Name("SubwaveIntentRequest")
private let ackName = Notification.Name("SubwaveIntentAck")
private let replyName = Notification.Name("SubwaveIntentReply")

public class SubwaveAppIntentsModule: Module {
  private var requestObserver: NSObjectProtocol?
  // Main-queue only: the observer delivers there and the JS-thread hooks hop
  // onto it.
  private var listening = false
  private var pending: [[String: Any]] = []
  /// Tokens already taken in. The intent re-posts until it sees an ack, so a
  /// request can arrive more than once.
  private var seen = Set<String>()

  public func definition() -> ModuleDefinition {
    Name("SubwaveAppIntents")

    Events("onIntent")

    OnCreate {
      self.requestObserver = NotificationCenter.default.addObserver(
        forName: requestName,
        object: nil,
        queue: .main
      ) { [weak self] note in
        self?.receive(note.userInfo)
      }
    }

    OnDestroy {
      if let observer = self.requestObserver {
        NotificationCenter.default.removeObserver(observer)
      }
      self.requestObserver = nil
    }

    OnStartObserving {
      DispatchQueue.main.async {
        self.listening = true
        let queued = self.pending
        self.pending = []
        queued.forEach { self.sendEvent("onIntent", $0) }
      }
    }

    OnStopObserving {
      DispatchQueue.main.async {
        self.listening = false
      }
    }

    /// JS's answer to one request. `message` is what Siri or Shortcuts shows
    /// when `ok` is false.
    Function("reply") { (token: String, ok: Bool, message: String?) in
      var info: [String: Any] = ["token": token, "ok": ok]
      if let message {
        info["message"] = message
      }
      NotificationCenter.default.post(name: replyName, object: nil, userInfo: info)
    }
  }

  private func receive(_ info: [AnyHashable: Any]?) {
    guard
      let token = info?["token"] as? String,
      let action = info?["action"] as? String
    else { return }
    NotificationCenter.default.post(name: ackName, object: nil, userInfo: ["token": token])
    guard seen.insert(token).inserted else { return }
    let request: [String: Any] = ["token": token, "action": action]
    if listening {
      sendEvent("onIntent", request)
    } else {
      pending.append(request)
    }
  }
}
