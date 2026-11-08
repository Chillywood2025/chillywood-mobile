Pod::Spec.new do |s|
  s.name = 'ChillywoodQualification'
  s.version = '0.1.0'
  s.summary = 'Record-only native Test Store qualification'
  s.description = 'A separate DEBUG-only fixed-identity qualification app.'
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
