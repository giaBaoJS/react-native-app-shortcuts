require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "AppShortcuts"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/giaBaoJS/react-native-app-shortcuts.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift,cpp}"
  # AppShortcuts.h is the public API host apps import from their AppDelegate
  # (Swift: `import AppShortcuts`, Objective-C: `#import <AppShortcuts/AppShortcuts.h>`).
  s.public_header_files = "ios/AppShortcuts.h"
  s.pod_target_xcconfig = {
    "DEFINES_MODULE" => "YES",
  }

  install_modules_dependencies(s)
end
