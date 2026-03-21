# Chillywood — Automated Validation (Maestro)

Lightweight critical-path flows covering the most important runtime behaviors.

## Requirements

| Tool    | Version | Notes |
|---------|---------|-------|
| Maestro | 2.x     | `~/.maestro/bin/maestro` |
| Java    | 11+     | Homebrew `openjdk` works (Java 25 confirmed) |

## One-time setup

```bash
# Make sure Maestro and Java are on PATH (add to ~/.zshrc to persist)
export PATH="$PATH:$HOME/.maestro/bin"
export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"
```

## Running the tests

### Run all flows (against Expo Go — default)
```bash
export PATH="$PATH:$HOME/.maestro/bin"
export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"

maestro test maestro/run-all.yaml
```

### Run a single flow
```bash
maestro test maestro/flows/01-home-opens.yaml
maestro test maestro/flows/02-tap-title-to-player.yaml
maestro test maestro/flows/03-player-valid.yaml
maestro test maestro/flows/04-watch-party-screen.yaml
maestro test maestro/flows/05-debug-snapshot.yaml
```

### Run against a dev build (custom bundle ID)
```bash
maestro test maestro/run-all.yaml \
  --env CHILLYWOOD_APP_ID=com.yourorg.chillywood
```

### Run Watch Party room flow with a real room ID
```bash
maestro test maestro/flows/04-watch-party-screen.yaml \
  --env PARTY_ROOM_ID=YOUR_LIVE_ROOM_CODE
```

## What each flow tests

| Flow | Critical path covered |
|------|----------------------|
| `01-home-opens` | App launches, CHILLYWOOD hero + tabs render, no crash |
| `02-tap-title-to-player` | Hero "▶ Play" tap navigates to Player without crash |
| `03-player-valid` | Player loads a real title — "Title not found." must NOT appear |
| `04-watch-party-screen` | Watch Party hub renders; bad room code shows "Room not found" error gracefully |
| `05-debug-snapshot` | DEV badge long-press enables panel; "Copy Debug Snapshot" is accessible |

## Target device

Flows run against **whatever device / simulator is connected** when you invoke Maestro.

- **iOS Simulator** — open in Xcode or `npx expo start` + press `i`
- **Android Emulator** — start emulator then `npx expo start` + press `a`
- **Physical device** — must be USB-connected with dev mode + USB debugging enabled

## Default app ID

`host.exp.exponent` — the Expo Go bundle identifier (works for both iOS and Android Expo Go).

If you're running a **development build** change `CHILLYWOOD_APP_ID` in `maestro/.env.example`, copy it to `maestro/.env`, and pass it via `--env`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Unable to locate a Java Runtime` | `export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"` |
| `Flow timed out waiting for "CHILLYWOOD"` | Ensure Expo dev server is running (`npx expo start`) and device is connected |
| `openLink: "chillywoodmobile://..."` doesn't navigate | Confirm the scheme in `app.json` is `chillywoodmobile`; rebuild app if needed |
| Flow 05 DEV badge not found | Only runs in `__DEV__` mode — must use Expo Go or a debug build |
