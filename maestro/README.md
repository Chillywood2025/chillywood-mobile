# Chillywood — Automated Validation (Maestro)

Baseline smoke flows plus one optional authenticated owner-rails flow used to keep the active checkpoint docs and harness inventory aligned.

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
cp maestro/.env.example maestro/.env
```

## Runtime contract

- `CHILLYWOOD_APP_ID` defaults to Expo Go (`host.exp.exponent`).
- `EXPO_URL` should match the currently running Expo / Metro session. The latest proved PostHog-enabled checkpoint used `exp://127.0.0.1:8084`.
- `SELF_PROFILE_USER_ID` is only needed for `09-title-actions-to-self-profile-rails.yaml`.

## Running the tests

### Run all flows (baseline smoke against Expo Go)
```bash
export PATH="$PATH:$HOME/.maestro/bin"
export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"

maestro test maestro/run-all.yaml --env EXPO_URL=exp://127.0.0.1:8084
```

`run-all.yaml` is the baseline smoke lane only. It does not replace the full Stage 4 or PostHog proof checkpoint.

### Run a single flow
```bash
maestro test maestro/flows/01-home-opens.yaml
maestro test maestro/flows/02-tap-title-to-player.yaml
maestro test maestro/flows/03-player-valid.yaml
maestro test maestro/flows/04-watch-party-screen.yaml
maestro test maestro/flows/05-debug-snapshot.yaml
maestro test maestro/flows/09-title-actions-to-self-profile-rails.yaml
```

### Run against a dev build (custom bundle ID)
```bash
maestro test maestro/run-all.yaml \
  --env CHILLYWOOD_APP_ID=com.yourorg.chillywood \
  --env EXPO_URL=exp://127.0.0.1:8084
```

### Run the authenticated owner-rails flow
```bash
maestro test maestro/flows/09-title-actions-to-self-profile-rails.yaml \
  --env EXPO_URL=exp://127.0.0.1:8084 \
  --env SELF_PROFILE_USER_ID=<profile-user-id>
```

## What each flow tests

| Flow | Critical path covered |
|------|----------------------|
| `01-home-opens` | App launches, `Live Watch-Party` + tabs render, no crash |
| `02-tap-title-to-player` | Explore title card tap navigates to Player without crash |
| `03-player-valid` | Player loads a real title, `Watch-Party Live` is visible, and `"Title not found."` must NOT appear |
| `04-watch-party-screen` | Shared waiting-room entry screen renders; bad room code shows `Room not found` gracefully |
| `05-debug-snapshot` | DEV badge long-press enables panel; "Copy Debug Snapshot" is accessible |
| `09-title-actions-to-self-profile-rails` | Authenticated self profile route opens, owner rails render, and `Channel Home` remains reachable |

## Target device

Flows run against **whatever device / simulator is connected** when you invoke Maestro.

- **iOS Simulator** — open in Xcode or `npx expo start` + press `i`
- **Android Emulator** — start emulator then `npx expo start` + press `a`
- **Physical device** — must be USB-connected with dev mode + USB debugging enabled

## Default app ID

`host.exp.exponent` — the Expo Go bundle identifier (works for both iOS and Android Expo Go).

If you're running a **development build** change `CHILLYWOOD_APP_ID` in `maestro/.env.example`, copy it to `maestro/.env`, and pass it via `--env`. Set `EXPO_URL` to the current Expo session URL before running the flows.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Unable to locate a Java Runtime` | `export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"` |
| `Flow timed out waiting for Home or player content` | Ensure Expo dev server is running (`npx expo start`) and `EXPO_URL` matches the active session |
| `openLink: "chillywoodmobile://..."` doesn't navigate | Confirm the scheme in `app.json` is `chillywoodmobile`; rebuild app if needed |
| Flow 05 DEV badge not found | Only runs in `__DEV__` mode — must use Expo Go or a debug build |
| Flow 09 fails to open the expected owner page | Sign in on the device first and set `SELF_PROFILE_USER_ID` to the authenticated user's profile id |
