# frozen_string_literal: true

require "fileutils"
require "rexml/document"
require "xcodeproj"

output_dir = File.expand_path(ARGV.fetch(0))
repository_root = File.expand_path("..", __dir__)
project_path = File.join(output_dir, "ChillywoodStoreKitHarness.xcodeproj")
generated_configuration_path = File.join(output_dir, "Chillywood.storekit")
canonical_configuration_path = File.join(
  repository_root,
  "config/ios/Chillywood.storekit"
)

FileUtils.mkdir_p(output_dir)
FileUtils.cp(canonical_configuration_path, generated_configuration_path)
project = Xcodeproj::Project.new(project_path)

host_target = project.new_target(
  :application,
  "ChillywoodStoreKitTestHost",
  :ios,
  "17.0",
  nil,
  :swift
)
catalog_target = project.new_target(
  :framework,
  "ChillywoodStoreKitHarness",
  :ios,
  "17.0",
  nil,
  :swift
)
test_target = project.new_target(
  :unit_test_bundle,
  "ChillywoodStoreKitTests",
  :ios,
  "17.0",
  nil,
  :swift
)

[host_target, catalog_target, test_target].each do |target|
  target.build_configurations.each do |configuration|
    configuration.build_settings["CODE_SIGNING_ALLOWED"] = "NO"
    configuration.build_settings["GENERATE_INFOPLIST_FILE"] = "YES"
    configuration.build_settings["SWIFT_VERSION"] = "6.0"
  end
end

host_target.build_configurations.each do |configuration|
  configuration.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] =
    "com.chillywood.mobile"
end
catalog_target.build_configurations.each do |configuration|
  configuration.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] =
    "com.chillywood.storekit-harness"
end
test_target.build_configurations.each do |configuration|
  configuration.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] =
    "com.chillywood.storekit-harness.tests"
  configuration.build_settings["TEST_HOST"] =
    "$(BUILT_PRODUCTS_DIR)/ChillywoodStoreKitTestHost.app/ChillywoodStoreKitTestHost"
  configuration.build_settings["BUNDLE_LOADER"] = "$(TEST_HOST)"
end

sources = project.main_group.new_group("Harness Sources")
host_reference = sources.new_reference(
  File.join(
    repository_root,
    "tools/ios-storekit-harness/Sources/ChillywoodStoreKitTestHost/AppDelegate.swift"
  )
)
catalog_reference = sources.new_reference(
  File.join(
    repository_root,
    "tools/ios-storekit-harness/Sources/ChillywoodStoreKitHarness/Catalog.swift"
  )
)
test_reference = sources.new_reference(
  File.join(
    repository_root,
    "tools/ios-storekit-harness/Tests/ChillywoodStoreKitTests/ChillywoodStoreKitTests.swift"
  )
)
configuration_reference = sources.new_reference(
  File.join(repository_root, "config/ios/Chillywood.storekit")
)

host_target.source_build_phase.add_file_reference(host_reference)
catalog_target.source_build_phase.add_file_reference(catalog_reference)
test_target.source_build_phase.add_file_reference(test_reference)
test_target.resources_build_phase.add_file_reference(configuration_reference)
test_target.add_dependency(host_target)
test_target.add_dependency(catalog_target)
test_target.frameworks_build_phase.add_file_reference(catalog_target.product_reference)

target_attributes = project.root_object.attributes["TargetAttributes"] ||= {}
target_attributes[host_target.uuid] = {
  "SystemCapabilities" => {
    "com.apple.InAppPurchase" => { "enabled" => 1 },
  },
}

project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(host_target)
scheme.add_build_target(catalog_target)
scheme.add_build_target(test_target)
scheme.add_test_target(test_target)
scheme.set_launch_target(host_target)
scheme.save_as(project_path, "ChillywoodStoreKitHarness", true)

# Keep the canonical StoreKit file active in the Run action, matching Apple's
# documented Xcode setup. SKTestSession still receives the file directly, but
# the scheme reference is required for end-to-end Product API testing and lets
# Xcode synchronize the local StoreKit environment when the IDE/runtime works.
scheme_path = File.join(
  project_path,
  "xcshareddata/xcschemes/ChillywoodStoreKitHarness.xcscheme"
)
document = REXML::Document.new(File.read(scheme_path))
launch_action = document.elements["Scheme/LaunchAction"]
storekit_reference = launch_action.add_element(
  "StoreKitConfigurationFileReference"
)
storekit_reference.add_attribute("identifier", "../../Chillywood.storekit")

formatter = REXML::Formatters::Pretty.new(3)
formatter.compact = true
File.open(scheme_path, "w") do |file|
  file.write(%(<?xml version="1.0" encoding="UTF-8"?>\n))
  formatter.write(document.root, file)
  file.write("\n")
end
