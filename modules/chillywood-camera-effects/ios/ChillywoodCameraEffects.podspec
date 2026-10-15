require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ChillywoodCameraEffects'
  s.version = package['version']
  s.summary = "On-device effects for Chi'llywood's outgoing camera frames"
  s.description = 'Vision face-aware lighting and person segmentation with illustrated subject-driven parallax.'
  s.license = 'UNLICENSED'
  s.author = "Chi'llywood"
  s.homepage = 'https://chillywoodstream.com'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :path => '.' }
  s.static_framework = true
  s.source_files = '*.{h,m,swift}'
  s.public_header_files = 'CHCameraEffectsController.h'
  s.frameworks = 'AVFoundation', 'CoreImage', 'CoreVideo', 'ImageIO', 'Metal', 'QuartzCore', 'Vision'
  s.dependency 'ExpoModulesCore'
  s.dependency 'livekit-react-native-webrtc', '144.0.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
