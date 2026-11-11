require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'ChillywoodProductionPaidVideo'
  s.version = package['version']
  s.summary = 'Default-off production paid video purchase witness'
  s.description = 'Captures the existing RevenueCat singleton completion without changing its identity or completion mode.'
  s.license = 'UNLICENSED'
  s.author = "Chi'llywood"
  s.homepage = 'https://chillywoodstream.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'RevenueCat', '= 5.96.1'
end
