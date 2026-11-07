require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'ChillywoodTestStoreAdmission'
  s.version = package['version']
  s.summary = 'Native debug-only isolated Test Store admission'
  s.description = 'Immutable native identity and a process lifetime preconfiguration gate.'
  s.license = 'UNLICENSED'
  s.author = "Chi'llywood"
  s.homepage = 'https://chillywoodstream.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'SWIFT_ACTIVE_COMPILATION_CONDITIONS[config=Debug]' => '$(inherited) DEBUG' }
  s.dependency 'ExpoModulesCore'
  s.dependency 'RevenueCat', '= 5.96.1'
end
