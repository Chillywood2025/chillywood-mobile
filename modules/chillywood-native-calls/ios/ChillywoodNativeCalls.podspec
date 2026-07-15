require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ChillywoodNativeCalls'
  s.version        = package['version']
  s.summary        = "Chi'llywood's bounded CallKit and PushKit bridge"
  s.description    = "CallKit, PushKit, and AVAudioSession integration for approved iOS call builds."
  s.license        = 'UNLICENSED'
  s.author         = "Chi'llywood"
  s.homepage       = 'https://chillywoodstream.com'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true
  s.source_files   = '**/*.{h,m,swift}'
  s.frameworks     = 'CallKit', 'PushKit', 'AVFAudio'
  s.dependency 'ExpoModulesCore'
end
