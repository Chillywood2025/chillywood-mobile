import UIKit

// Copied into each pinned Expo picker module by withIosPickerDismissal. A JS
// result is permission to present another sheet, so it must follow UIKit's
// actual dismissal, not merely the native picker delegate's selection event.
@MainActor
internal final class ChillywoodPickerDismissal {
  private var hasAcceptedResult = false
  private var pendingResult: (() -> Void)?

  func finish(_ picker: UIViewController, result: @escaping () -> Void) {
    guard !hasAcceptedResult else {
      return
    }
    hasAcceptedResult = true
    pendingResult = result
    dismiss(picker)
  }

  func didDismiss(cancel: @escaping () -> Void) {
    // Interactive dismissal is itself a completion receipt. If a selection
    // already owns the operation, never replace it with a second cancellation.
    if !hasAcceptedResult {
      hasAcceptedResult = true
      pendingResult = cancel
    }
    complete()
  }

  private func dismiss(_ picker: UIViewController) {
    if picker.isBeingDismissed, let transition = picker.transitionCoordinator {
      // UIDocumentPicker may already be auto-dismissing. Joining its transition
      // preserves that behavior instead of starting a competing dismissal.
      // The Bool describes animation registration, NOT completion registration.
      transition.animate(alongsideTransition: nil) { context in
        if context.isCancelled {
          picker.dismiss(animated: true) { self.complete() }
        } else {
          self.complete()
        }
      }
      return
    }
    if picker.presentingViewController == nil && !picker.isBeingDismissed {
      // Already removed by UIKit/navigation, or never presented. There is no
      // modal transition to wait for; don't hang an abandoned JS operation.
      complete()
      return
    }
    picker.dismiss(animated: true) { self.complete() }
  }

  private func complete() {
    let result = pendingResult
    pendingResult = nil
    result?()
  }
}
