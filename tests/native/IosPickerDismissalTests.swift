import Foundation

// Controlled UIKit boundary, not a device/UI simulation. The COMPLETE generated
// production helper and delegate files are inserted below, unchanged except for
// imports. A separate real UIKit/PhotosUI SDK compile checks API compatibility.
@MainActor protocol PHPickerViewControllerDelegate: AnyObject {}
@MainActor protocol UINavigationControllerDelegate: AnyObject {}
@MainActor protocol UIImagePickerControllerDelegate: AnyObject {}
@MainActor protocol UIAdaptivePresentationControllerDelegate: AnyObject {}
@MainActor protocol UIDocumentPickerDelegate: AnyObject {}
struct TransitionContext { let isCancelled: Bool }
@MainActor class Transition {
  var completion: ((TransitionContext) -> Void)?
  var animationAccepted = true
  func animate(alongsideTransition: ((TransitionContext) -> Void)?, completion: ((TransitionContext) -> Void)?) -> Bool {
    self.completion = completion
    return animationAccepted
  }
}
@MainActor class UIViewController {
  var presentingViewController: UIViewController?
  var isBeingDismissed = false
  var transitionCoordinator: Transition?
  var presentationController: UIPresentationController? = UIPresentationController()
  var dismissCalls = 0
  var completions: [() -> Void] = []
  func dismiss(animated: Bool, completion: (() -> Void)? = nil) {
    dismissCalls += 1
    isBeingDismissed = true
    if let completion { completions.append(completion) }
  }
  func completeDismissal() {
    presentingViewController = nil
    isBeingDismissed = false
    transitionCoordinator = nil
    let callbacks = completions
    completions = []
    callbacks.forEach { $0() }
  }
}
class UIPresentationController { var delegate: AnyObject? }
class UIImagePickerController: UIViewController { var delegate: AnyObject? }
class PHPickerViewController: UIViewController { var delegate: AnyObject? }
class UIDocumentPickerViewController: UIViewController {}
class UINavigationController: UIViewController {}
struct PHPickerResult { let identifier: String }
typealias MediaInfo = [String: Any]
class StatusBarVisibilityController {
  func maybeRestoreStatusBarVisibility() {}
  func maybePreserveVisibilityAndHideStatusBar(_ hidden: Bool) {}
}

// INSERT_PICKER_SOURCE

@MainActor func check(_ condition: @autoclosure () -> Bool, _ reason: String) {
  if !condition() {
    fputs("FAIL: \(reason)\n", stderr)
    exit(1)
  }
}
final class Results: OnMediaPickingResultHandler, PickingResultHandler {
  var events: [String] = []
  func didPickMedia(mediaInfo: MediaInfo) { events.append("camera:\(mediaInfo["token"] ?? "missing")") }
  func didPickMultipleMedia(selection: [PHPickerResult]) { events.append("photos:" + selection.map { $0.identifier }.joined(separator: ",")) }
  func didPickDocumentsAt(urls: [URL]) { events.append("files:" + urls.map { $0.lastPathComponent }.joined(separator: ",")) }
  func didCancelPicking() { events.append("cancel") }
}

let suite = CommandLine.arguments.dropFirst().first ?? "all"
@MainActor func run(_ name: String, _ body: () -> Void) {
  if suite == "all" || suite == name { body() }
}
@MainActor func presented<T: UIViewController>(_ controller: T) -> T {
  controller.presentingViewController = UIViewController()
  return controller
}
@MainActor func imageHandler(_ result: Results) -> ImagePickerHandler {
  ImagePickerHandler(onMediaPickingResultHandler: result, hideStatusBarWhenPresented: false)
}

@main struct PickerTests {
@MainActor static func main() {
for name in ["camera-cancel", "camera-success", "photos-cancel", "photos-success", "files-cancel", "files-success"] {
  run(name) {
    let result = Results()
    let handler = imageHandler(result), document = DocumentPickingDelegate(resultHandler: result)
    let camera = presented(UIImagePickerController()), photos = presented(PHPickerViewController())
    let files = presented(UIDocumentPickerViewController())
    let picker: UIViewController
    let expected: String
    switch name {
    case "camera-cancel":
      picker = camera; expected = "cancel"
      handler.imagePickerControllerDidCancel(camera)
    case "camera-success":
      picker = camera; expected = "camera:chosen"
      handler.imagePickerController(camera, didFinishPickingMediaWithInfo: ["token": "chosen"])
    case "photos-cancel":
      picker = photos; expected = "cancel"
      handler.picker(photos, didFinishPicking: [])
    case "photos-success":
      picker = photos; expected = "photos:cloud-one,cloud-two"
      handler.picker(photos, didFinishPicking: [PHPickerResult(identifier: "cloud-one"), PHPickerResult(identifier: "cloud-two")])
    case "files-cancel":
      picker = files; expected = "cancel"
      document.documentPickerWasCancelled(files)
    default:
      picker = files; expected = "files:first.pdf,second.mov"
      document.documentPicker(files, didPickDocumentsAt: [URL(fileURLWithPath: "/temporary/first.pdf"), URL(fileURLWithPath: "/temporary/second.mov")])
    }
    check(result.events.isEmpty, "IOS_PICKER_RESULT_BEFORE_DISMISSAL")
    check(picker.dismissCalls == 1, "dismiss exactly once")
    // Duplicate selection/cancel cannot overwrite the accepted operation.
    if name.hasPrefix("files") { document.documentPickerWasCancelled(files) }
    else if name.hasPrefix("photos") { handler.picker(photos, didFinishPicking: []) }
    else { handler.imagePickerControllerDidCancel(camera) }
    check(picker.dismissCalls == 1, "duplicate delegate started another dismissal")
    let replay = picker.completions
    picker.completeDismissal()
    check(result.events == [expected], "selected result identity/count after dismissal")
    if name.hasPrefix("files") { document.presentationControllerDidDismiss(UIPresentationController()) }
    else { handler.presentationControllerDidDismiss(UIPresentationController()) }
    replay.forEach { $0() }
    check(result.events == [expected], "late callback settled the operation twice")
  }
}

run("interactive") {
  let result = Results()
  let image = imageHandler(result)
  image.presentationControllerDidDismiss(UIPresentationController())
  image.presentationControllerDidDismiss(UIPresentationController())
  check(result.events == ["cancel"], "interactive dismissal must cancel once")
  let other = Results(), files = DocumentPickingDelegate(resultHandler: other)
  files.presentationControllerDidDismiss(UIPresentationController())
  files.presentationControllerDidDismiss(UIPresentationController())
  check(other.events == ["cancel"], "Files interactive dismissal must cancel once")
}

run("selection-vs-interactive") {
  let result = Results(), handler = imageHandler(result), picker = presented(PHPickerViewController())
  handler.picker(picker, didFinishPicking: [PHPickerResult(identifier: "chosen")])
  // A didDismiss receipt may precede our dismiss completion callback.
  picker.presentingViewController = nil
  handler.presentationControllerDidDismiss(UIPresentationController())
  picker.completeDismissal()
  check(result.events == ["photos:chosen"], "interactive receipt replaced selected result")
}

for cancelled in [false, true] {
  for animationAccepted in [false, true] {
    run("existing-transition") {
      let result = Results(), handler = DocumentPickingDelegate(resultHandler: result)
      let picker = presented(UIDocumentPickerViewController()), transition = Transition()
      picker.isBeingDismissed = true
      picker.transitionCoordinator = transition
      transition.animationAccepted = animationAccepted
      handler.documentPickerWasCancelled(picker)
      check(result.events.isEmpty && picker.dismissCalls == 0, "join UIKit auto-dismiss instead of competing")
      // Main-thread UIKit state at its authoritative completion.
      picker.isBeingDismissed = false
      picker.transitionCoordinator = nil
      if !cancelled { picker.presentingViewController = nil }
      transition.completion?(TransitionContext(isCancelled: cancelled))
      if cancelled {
        check(result.events.isEmpty && picker.dismissCalls == 1, "cancelled interactive transition must re-dismiss")
        picker.completeDismissal()
      }
      check(result.events == ["cancel"], "transition completion must settle once")
      handler.presentationControllerDidDismiss(UIPresentationController())
      check(result.events == ["cancel"], "duplicate transition receipt")
    }
  }
}

run("absent-and-unmounted") {
  let result = Results(), picker = UIImagePickerController()
  var handler: ImagePickerHandler? = imageHandler(result)
  handler?.imagePickerControllerDidCancel(picker)
  check(result.events == ["cancel"] && picker.dismissCalls == 0, "already absent picker must not strand operation")
  let pendingResult = Results(), shown = presented(UIImagePickerController())
  handler = imageHandler(pendingResult)
  weak var retained = handler
  handler?.imagePickerControllerDidCancel(shown)
  handler = nil
  check(retained != nil && pendingResult.events.isEmpty, "unmounted caller must not release before UIKit receipt")
  shown.completeDismissal()
  check(pendingResult.events == ["cancel"], "unmounted caller still settles native operation")
  check(retained == nil, "completed dismissal must release retained native handler")
}

run("no-transition-coordinator") {
  let result = Results(), handler = imageHandler(result), picker = presented(UIImagePickerController())
  picker.isBeingDismissed = true
  handler.imagePickerControllerDidCancel(picker)
  check(result.events.isEmpty && picker.dismissCalls == 1, "no-coordinator dismissal must use UIKit completion")
  picker.completeDismissal()
  check(result.events == ["cancel"], "no-coordinator UIKit receipt settles operation")
}

print("iOS picker native delegate checks PASS (controlled UIKit edges)")
}
}
