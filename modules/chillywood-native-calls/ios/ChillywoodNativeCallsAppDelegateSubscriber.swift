import ExpoModulesCore
import UIKit

public final class ChillywoodNativeCallsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    ChillywoodNativeCallCoordinator.shared.prepareIfEnabled()
    return true
  }

  public func applicationDidBecomeActive(_ application: UIApplication) {
    ChillywoodNativeCallCoordinator.shared.applicationDidBecomeActive()
  }

  public func applicationWillTerminate(_ application: UIApplication) {
    ChillywoodNativeCallCoordinator.shared.applicationWillTerminate()
  }
}
