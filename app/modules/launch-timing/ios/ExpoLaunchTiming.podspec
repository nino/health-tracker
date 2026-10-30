Pod::Spec.new do |s|
  s.name           = 'ExpoLaunchTiming'
  s.version        = '1.0.0'
  s.summary        = 'Launch timing for health-tracker'
  s.description    = 'Process start, main start, prewarm and first-content times for the opt-in app_startup report.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
