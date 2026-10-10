import CryptoKit
import Foundation
import CoreFoundation

protocol ChillywoodIncomingCallStateSocket: AnyObject {
  func resume()
  func receive(_ completion: @escaping (Result<Data, Error>) -> Void)
  func cancel()
}

// Default TLS validation is retained. Credentials cannot follow a redirect.
final class ChillywoodIncomingCallStateWebSocket: NSObject, ChillywoodIncomingCallStateSocket, URLSessionTaskDelegate, @unchecked Sendable {
  private var session: URLSession!
  private var task: URLSessionWebSocketTask!
  init(request: URLRequest) {
    super.init()
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 8
    configuration.timeoutIntervalForResource = 300
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    task = session.webSocketTask(with: request)
    task.maximumMessageSize = 2048
  }
  func resume() { task.resume() }
  func receive(_ completion: @escaping (Result<Data, Error>) -> Void) {
    task.receive { result in
      completion(result.flatMap { message in
        switch message {
        case .data(let data): return .success(data)
        case .string(let text): return .success(Data(text.utf8))
        @unknown default: return .failure(URLError(.cannotParseResponse))
        }
      })
    }
  }
  func cancel() { task.cancel(with: .normalClosure, reason: nil); session.invalidateAndCancel() }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

struct ChillywoodIncomingCallStateCapability {
  let observerID: UUID
  let secret: String
  let url: URL
  let expiryMilliseconds: String

  init?(payload: [String: Any], deadline: ChillywoodIncomingCallDeadline) {
    guard let version = payload["stateObserverVersion"] as? NSNumber,
      CFGetTypeID(version) != CFBooleanGetTypeID(), version.doubleValue == 1,
      let id = payload["stateObserverId"] as? String, let observer = UUID(uuidString: id),
      let token = payload["stateObserverCapability"] as? String,
      token.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
      let urlText = payload["stateObserverUrl"] as? String, let url = URL(string: urlText),
      url.scheme == "wss", url.host == "bmkkhihfbmsnnmcqkoly.supabase.co",
      url.path == "/functions/v1/ios-native-call-state", url.port == nil || url.port == 443,
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
      let millis = payload["stateObserverExpiresAtMillis"] as? String,
      millis.range(of: "^[0-9]{12,14}$", options: .regularExpression) != nil,
      let numericMillis = Double(millis), numericMillis.isFinite,
      // JS Date truncates PostgreSQL microseconds. Preserve the original native
      // deadline for every timer; this value is only the canonical binding hash.
      numericMillis <= deadline.expiresAt.timeIntervalSince1970 * 1000 + 0.01,
      deadline.expiresAt.timeIntervalSince1970 * 1000 - numericMillis < 1.01
    else { return nil }
    observerID = observer; secret = token; self.url = url; expiryMilliseconds = millis
  }

  func request(owner: ChillywoodIncomingCallStateOwner, callType: String, connection: UUID) -> URLRequest? {
    guard let invite = UUID(uuidString: owner.inviteID), invite == owner.callUUID,
      let thread = UUID(uuidString: owner.threadID), let user = UUID(uuidString: owner.userID),
      let account = UUID(uuidString: owner.accountID), user == account,
      let session = UUID(uuidString: owner.sessionGeneration), !owner.installID.isEmpty,
      owner.installID.count <= 256, ["voice", "video"].contains(callType) else { return nil }
    let values = [observerID.uuidString.lowercased(), invite.uuidString.lowercased(),
      thread.uuidString.lowercased(), owner.callUUID.uuidString.lowercased(), user.uuidString.lowercased(),
      account.uuidString.lowercased(), session.uuidString.lowercased(), owner.installID, callType, expiryMilliseconds]
    let binding = values.map { "\($0.utf8.count):\($0)" }.joined()
    let hash = SHA256.hash(data: Data(binding.utf8)).map { String(format: "%02x", $0) }.joined()
    var request = URLRequest(url: url)
    request.httpMethod = "GET"; request.timeoutInterval = 8
    request.setValue(observerID.uuidString.lowercased(), forHTTPHeaderField: "x-chilly-call-observer")
    request.setValue(connection.uuidString.lowercased(), forHTTPHeaderField: "x-chilly-call-connection")
    request.setValue(owner.nativeGeneration.uuidString.lowercased(), forHTTPHeaderField: "x-chilly-call-generation")
    request.setValue(secret, forHTTPHeaderField: "x-chilly-call-capability")
    request.setValue(hash, forHTTPHeaderField: "x-chilly-call-binding")
    return request
  }
}

// Main-queue ownership. It starts only from the successful incoming PushKit
// report callback, never from JS recovery, a timer, or a terminal push.
final class ChillywoodIncomingCallStateObserver {
  typealias Cancel = () -> Void
  typealias Schedule = (TimeInterval, @escaping () -> Void) -> Cancel
  private let capability: ChillywoodIncomingCallStateCapability
  private let owner: ChillywoodIncomingCallStateOwner
  private let callType: String
  private let deadline: ChillywoodIncomingCallDeadline
  private let current: () -> (ChillywoodIncomingCallStateOwner?, Bool, Bool, Bool)
  private let terminal: (String) -> Void
  private let finished: (Bool) -> Void
  private let socketFactory: (URLRequest) -> ChillywoodIncomingCallStateSocket
  private let schedule: Schedule
  private let now: () -> Date
  private let uptime: () -> TimeInterval
  private var socket: ChillywoodIncomingCallStateSocket?
  private var policy: ChillywoodIncomingCallStatePolicy?
  private var connectionID: UUID?
  private var deadlineCancel: Cancel?
  private var watchdogCancel: Cancel?
  private var retryCancel: Cancel?
  private var attempts = 0
  private(set) var stopped = false
  init(capability: ChillywoodIncomingCallStateCapability, owner: ChillywoodIncomingCallStateOwner,
    callType: String, deadline: ChillywoodIncomingCallDeadline,
    current: @escaping () -> (ChillywoodIncomingCallStateOwner?, Bool, Bool, Bool),
    terminal: @escaping (String) -> Void, finished: @escaping (Bool) -> Void,
    socketFactory: @escaping (URLRequest) -> ChillywoodIncomingCallStateSocket = { ChillywoodIncomingCallStateWebSocket(request: $0) },
    schedule: @escaping Schedule = { delay, action in
      let item = DispatchWorkItem(block: action)
      DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
      return { item.cancel() }
    }, now: @escaping () -> Date = Date.init,
    uptime: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }
  ) {
    self.capability=capability; self.owner=owner; self.callType=callType; self.deadline=deadline
    self.current=current; self.terminal=terminal; self.finished=finished; self.socketFactory=socketFactory
    self.schedule=schedule; self.now=now; self.uptime=uptime
  }
  deinit { socket?.cancel(); deadlineCancel?(); watchdogCancel?(); retryCancel?() }
  func start() {
    dispatchPrecondition(condition: .onQueue(.main))
    guard attempts == 0, !stopped else { return }
    guard let remaining = remaining() else { stop(); return }
    deadlineCancel = schedule(remaining) { [weak self] in self?.stop() }
    connect()
  }
  func stop(unavailable: Bool = false) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !stopped else { return }; stopped=true
    connectionID=nil; socket?.cancel(); socket=nil
    deadlineCancel?(); watchdogCancel?(); retryCancel?()
    deadlineCancel=nil; watchdogCancel=nil; retryCancel=nil
    finished(unavailable)
  }
  private func remaining() -> TimeInterval? {
    let (observed, answered, pending, requested) = current()
    guard observed == owner, !requested,
      case .wait(let interval) = deadline.wakeup(now: now(), uptime: uptime(), ownsCall: observed == owner,
        answered: answered, answerPending: pending) else { return nil }
    return interval
  }
  private func connect() {
    guard !stopped, remaining() != nil, attempts < 3 else { stop(); return }
    let connection = UUID()
    guard let request = capability.request(owner: owner, callType: callType, connection: connection) else { stop(unavailable: true); return }
    attempts += 1; connectionID=connection
    policy=ChillywoodIncomingCallStatePolicy(observerID: capability.observerID, connectionID: connection,
      owner: owner, deadline: deadline)
    let next=socketFactory(request); socket=next
    next.resume(); listen(connection, next)
  }
  private func listen(_ connection: UUID, _ source: ChillywoodIncomingCallStateSocket) {
    guard !stopped, connectionID == connection, remaining() != nil else { stop(); return }
    watchdogCancel?()
    watchdogCancel=schedule(8) { [weak self] in self?.failed(connection) }
    source.receive { [weak self] result in
      DispatchQueue.main.async {
        guard let self, !self.stopped, self.connectionID == connection else { return }
        self.watchdogCancel?(); self.watchdogCancel=nil
        switch result {
        case .failure: self.failed(connection)
        case .success(let bytes):
          let state=self.current()
          let decision=self.policy?.receive(bytes, now: self.now(), uptime: self.uptime(), currentOwner: state.0,
            answered: state.1, answerPending: state.2, answerRequested: state.3) ?? .retire
          switch decision {
          case .waiting: self.listen(connection, source)
          case .retire: self.stop()
          case .terminal(let status):
            // The coordinator rechecks its current dictionary/Answer ownership
            // synchronously too. No observer callback may activate call audio.
            self.stop(); self.terminal(status)
          }
        }
      }
    }
  }
  private func failed(_ connection: UUID) {
    guard !stopped, connectionID == connection else { return }
    connectionID=nil; socket?.cancel(); socket=nil; watchdogCancel?(); watchdogCancel=nil
    guard remaining() != nil, attempts < 3 else { stop(unavailable: true); return }
    retryCancel=schedule(0.5) { [weak self] in self?.retryCancel=nil; self?.connect() }
  }
}
