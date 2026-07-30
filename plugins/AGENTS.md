# Config-plugin and native assurance boundary

Treat every plugin change as native work. Generate into a disposable directory,
hash the generated source, compare manifests/permissions/entitlements/modules
and build settings, compile the affected platform, and run real native tests.
Delete disposable output after redacted evidence capture.

Do not commit generated `android/` or `ios/`, secrets, signing materials, device
identifiers, or raw logs. Kotlin/Swift source presence and regex tests do not
satisfy lifecycle or compiled-binary gates.
