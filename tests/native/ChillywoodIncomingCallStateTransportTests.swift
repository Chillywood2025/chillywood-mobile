import Foundation

var checks = 0
func expect(_ condition: @autoclosure () -> Bool, _ label: String) {
  checks += 1
  if !condition() { fputs("FAIL: \(label)\n", stderr); exit(1) }
}
func pump() { let end=Date().addingTimeInterval(0.002); while Date()<end { _=RunLoop.current.run(mode:.default,before:end) } }
final class TestClock {
  var offset: TimeInterval=0, wallOffset: TimeInterval=0, serial=0
  var jobs: [Int:(TimeInterval,()->Void)]=[:]
  func schedule(_ delay:TimeInterval,_ action:@escaping ()->Void)->()->Void {
    serial += 1;let key=serial;jobs[key]=(offset+delay,action);return {[weak self] in self?.jobs.removeValue(forKey:key)}
  }
  func advance(_ seconds:TimeInterval) {
    let target=offset+seconds
    while let next=jobs.filter({$0.value.0 <= target}).min(by:{$0.value.0 < $1.value.0}) {
      offset=next.value.0;jobs.removeValue(forKey:next.key);next.value.1();pump()
    }
    offset=target;pump()
  }
  var date: Date { Date(timeIntervalSince1970:1800000000+offset+wallOffset) }
}
final class Socket:ChillywoodIncomingCallStateSocket {
  let request:URLRequest;var received:[(Result<Data,Error>)->Void]=[];var resumed=0,canceled=0
  init(_ request:URLRequest){self.request=request}
  func resume(){resumed += 1}
  func cancel(){canceled += 1}
  func receive(_ completion:@escaping(Result<Data,Error>)->Void){received.append(completion)}
  func send(_ status:String,index:Int=0,sequence:Int=1) {
    let fields:[String:Any]=["observerId":request.value(forHTTPHeaderField:"x-chilly-call-observer")!,
      "connectionId":request.value(forHTTPHeaderField:"x-chilly-call-connection")!,
      "nativeGeneration":request.value(forHTTPHeaderField:"x-chilly-call-generation")!,"sequence":sequence,"status":status]
    received[index](.success(try!JSONSerialization.data(withJSONObject:fields)));pump()
  }
  func fail(){received.last?(.failure(URLError(.networkConnectionLost)));pump()}
}
let owner=ChillywoodIncomingCallStateOwner(callUUID:UUID(uuidString:"10000000-0000-4000-8000-000000000001")!,
  inviteID:"10000000-0000-4000-8000-000000000001",threadID:"10000000-0000-4000-8000-000000000005",
  nativeGeneration:UUID(uuidString:"10000000-0000-4000-8000-000000000002")!,
  userID:"10000000-0000-4000-8000-000000000006",accountID:"10000000-0000-4000-8000-000000000006",
  sessionGeneration:"10000000-0000-4000-8000-000000000007",installID:"observer-install")
func payload()->[String:Any] { ["stateObserverVersion":1,"stateObserverId":"10000000-0000-4000-8000-000000000003",
  "stateObserverCapability":String(repeating:"Z",count:43),"stateObserverExpiresAtMillis":"1800000090000",
  "stateObserverUrl":"wss://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state"] }
final class Harness {
  let clock=TestClock();var sockets:[Socket]=[],terminals:[String]=[],finishes:[Bool]=[]
  var currentOwner:ChillywoodIncomingCallStateOwner?=owner,answered=false,pending=false,requested=false
  var observer:ChillywoodIncomingCallStateObserver!
  init(){
    let deadline=ChillywoodIncomingCallDeadline(serverExpiresAt:clock.date.addingTimeInterval(90),now:clock.date,uptime:10)!
    let cap=ChillywoodIncomingCallStateCapability(payload:payload(),deadline:deadline)!
    observer=ChillywoodIncomingCallStateObserver(capability:cap,owner:owner,callType:"voice",deadline:deadline,
      current:{[weak self] in guard let self else{return(nil,false,false,false)};return(self.currentOwner,self.answered,self.pending,self.requested)},
      terminal:{[weak self] in self?.terminals.append($0)},finished:{[weak self] in self?.finishes.append($0)},
      socketFactory:{[weak self] request in let s=Socket(request);self?.sockets.append(s);return s},
      schedule:{[weak self] delay,action in self?.clock.schedule(delay,action) ?? {}},
      now:{[weak self] in self?.clock.date ?? Date()},uptime:{[weak self] in (self?.clock.offset ?? 0)+10})
  }
}
do {
  let h=Harness();h.observer.start();h.observer.start()
  expect(h.sockets.count == 1,"start is one-use")
  expect(h.sockets[0].request.value(forHTTPHeaderField:"x-chilly-call-binding") == "d8212e74bd29d76e47b542e3a26c008cc23f26c06adc749c2e44963160466239", "native binding matches independent canonical UTF-8 hash")
  h.sockets[0].send("ringing");expect(h.terminals.isEmpty,"ringing has no terminal effect")
  h.sockets[0].send("canceled",index:1,sequence:2)
  expect(h.terminals == ["canceled"] && h.observer.stopped,"exact newer status terminates once")
  expect(h.clock.jobs.isEmpty && h.sockets[0].canceled == 1,"terminal clears socket and every timer")
  h.sockets[0].send("canceled",sequence:3);expect(h.terminals.count == 1,"late retired callback has no effect")
}
for state in ["pending","requested","answered","removed"] {
  let h=Harness();h.observer.start()
  if state == "pending"{h.pending=true};if state == "requested"{h.requested=true};if state == "answered"{h.answered=true};if state == "removed"{h.currentOwner=nil}
  h.sockets[0].send("accepted")
  expect(h.terminals.isEmpty && h.observer.stopped,"\(state) supersedes old server state")
  expect(h.clock.jobs.isEmpty,"\(state) cleans every observer timer")
}
do {
  let h=Harness();h.observer.start();let first=h.sockets[0];first.fail();h.clock.advance(0.5)
  expect(h.sockets.count == 2,"one bounded reconnect uses a new socket")
  expect(first.request.value(forHTTPHeaderField:"x-chilly-call-connection") != h.sockets[1].request.value(forHTTPHeaderField:"x-chilly-call-connection"),"reconnect receives fresh nonce")
  first.send("canceled");expect(h.terminals.isEmpty,"old connection callback cannot act on new connection")
  h.sockets[1].fail();h.clock.advance(0.5);h.sockets[2].fail();h.clock.advance(100)
  expect(h.sockets.count == 3 && h.observer.stopped,"maximum three connection attempts")
  expect(h.terminals.isEmpty && h.finishes == [true],"network failures cannot invent a call terminal")
  expect(h.clock.jobs.isEmpty && h.sockets.allSatisfy{$0.canceled == 1},"retry exhaustion releases resources")
}
do {
  let h=Harness();h.observer.start();h.clock.advance(8);h.pending=true;h.clock.advance(0.5)
  expect(h.sockets.count == 1 && h.observer.stopped,"pending Answer during retry wait blocks reconnect")
}
do {
  let h=Harness();h.observer.start()
  for i in 0..<12 { h.sockets[0].send("ringing",index:i,sequence:i+1);h.clock.advance(7) }
  h.sockets[0].send("ringing",index:12,sequence:13)
  h.clock.wallOffset = -1000;h.clock.advance(6)
  expect(h.observer.stopped && h.sockets.count == 1 && h.terminals.isEmpty,"monotonic ceiling survives heartbeat and backward clock")
  expect(h.clock.jobs.isEmpty,"original deadline teardown completes")
}
let deadline=ChillywoodIncomingCallDeadline(serverExpiresAt:Date(timeIntervalSince1970:1800000090),now:Date(timeIntervalSince1970:1800000000),uptime:10)!
for url in ["ws://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state",
  "wss://other.invalid/functions/v1/ios-native-call-state","wss://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/other",
  "wss://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state?secret=x",
  "wss://user@bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state",
  "wss://bmkkhihfbmsnnmcqkoly.supabase.co:444/functions/v1/ios-native-call-state",
  "wss://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/ios-native-call-state#fragment"] {
  var value=payload();value["stateObserverUrl"]=url
  expect(ChillywoodIncomingCallStateCapability(payload:value,deadline:deadline) == nil,"unapproved URL rejected without networking")
}
for invalid:[String:Any] in [["stateObserverVersion":true],["stateObserverVersion":2],["stateObserverCapability":"short"],
  ["stateObserverExpiresAtMillis":"1800000090001"],["stateObserverExpiresAtMillis":"1800000089000"]] {
  var value=payload();for(k,v)in invalid{value[k]=v}
  expect(ChillywoodIncomingCallStateCapability(payload:value,deadline:deadline) == nil,"invalid capability metadata rejected")
}
print("PASS \(checks) actual native transport/URL/ownership/teardown checks; modeled sockets, no network or device")
