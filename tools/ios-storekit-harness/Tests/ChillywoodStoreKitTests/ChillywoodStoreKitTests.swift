import Foundation
import ChillywoodStoreKitHarness
import StoreKit
import StoreKitTest
import XCTest

final class ChillywoodStoreKitTests: XCTestCase {
  private let consumableProductIDs = ChillywoodStoreKitCatalog.consumableProductIDs
  private let subscriptionProductIDs = ChillywoodStoreKitCatalog.subscriptionProductIDs

  private func makeSession() throws -> SKTestSession {
    let environment = ProcessInfo.processInfo.environment
    let url: URL
    if let path = environment["CHILLYWOOD_STOREKIT_CONFIG"], !path.isEmpty {
      url = URL(fileURLWithPath: path)
    } else if let bundledURL = Bundle(for: ChillywoodStoreKitTests.self).url(
      forResource: "Chillywood",
      withExtension: "storekit"
    ) {
      url = bundledURL
    } else {
      throw XCTSkip("The canonical StoreKit configuration was not available")
    }

    XCTAssertTrue(FileManager.default.isReadableFile(atPath: url.path))

    let session = try SKTestSession(contentsOf: url)
    session.disableDialogs = true
    session.clearTransactions()
    return session
  }

  func testEveryDeclaredProductCanBePurchased() async throws {
    let session = try makeSession()
    defer { session.clearTransactions() }

    for productID in consumableProductIDs + subscriptionProductIDs {
      try await session.buyProduct(identifier: productID)
    }

    let purchasedIDs = Set(session.allTransactions().map(\.productIdentifier))
    XCTAssertEqual(purchasedIDs, Set(consumableProductIDs + subscriptionProductIDs))
  }

  func testSubscriptionLifecycleCanRenewExpireAndRefund() async throws {
    let session = try makeSession()
    defer { session.clearTransactions() }

    try await session.buyProduct(identifier: subscriptionProductIDs[0])
    try session.forceRenewalOfSubscription(productIdentifier: subscriptionProductIDs[0])
    try session.expireSubscription(productIdentifier: subscriptionProductIDs[0])

    guard let transaction = session.allTransactions().first(where: {
      $0.productIdentifier == subscriptionProductIDs[0]
    }) else {
      return XCTFail("The subscription purchase was not recorded")
    }

    try session.refundTransaction(identifier: transaction.identifier)
  }

  func testConsumableRefundLifecycle() async throws {
    let session = try makeSession()
    defer { session.clearTransactions() }

    try await session.buyProduct(identifier: consumableProductIDs[0])

    guard let transaction = session.allTransactions().first(where: {
      $0.productIdentifier == consumableProductIDs[0]
    }) else {
      return XCTFail("The consumable purchase was not recorded")
    }

    try session.refundTransaction(identifier: transaction.identifier)
  }
}
