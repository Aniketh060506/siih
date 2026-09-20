# iTantra — Complete Screen Design & Wireframe Specification
### ISRO Problem Statement 26173 | Multilingual Neural Walkie-Talkie
> Version 1.0.0 | Platform: Android (Jetpack Compose) | Offline-First | 10 Indian Languages

---

## TABLE OF CONTENTS

1. [Design System & Color Tokens](#1-design-system--color-tokens)
2. [Typography Specification](#2-typography-specification)
3. [Component Library](#3-component-library)
4. [Navigation Map](#4-navigation-map)
5. [Screen Specifications](#5-screen-specifications)
   - [S01 Splash](#s01--splash-screen)
   - [S02 First Time Setup](#s02--first-time-setup)
   - [S03 Permissions Setup](#s03--permissions-setup)
   - [S04 Home Dashboard](#s04--home-dashboard)
   - [S05 Receiver Home](#s05--receiver-home)
   - [S06 Incoming Alert](#s06--incoming-alert)
   - [S07 Message Received](#s07--message-received)
   - [S08 Translation View](#s08--translation-view)
   - [S09 Now Playing](#s09--now-playing)
   - [S10 Hold to Speak Reply](#s10--hold-to-speak-reply)
   - [S11 Reply Sent](#s11--reply-sent)
   - [S12 Quick Response](#s12--quick-response)
   - [S13 Emergency SOS](#s13--emergency-sos)
   - [S14 Broadcast Home](#s14--broadcast-home)
   - [S15 Auto Alerts Menu](#s15--auto-alerts-menu)
   - [S16 Select Alert Detail](#s16--select-alert-detail)
   - [S17 Active Broadcasting](#s17--active-broadcasting)
   - [S18 Custom Message](#s18--custom-message)
   - [S19 Broadcast Confirmed](#s19--broadcast-confirmed)
   - [S20 Channel Monitor](#s20--channel-monitor)
   - [S21 Channel Management](#s21--channel-management)
   - [S22 Message History](#s22--message-history)
   - [S23 Receiver Settings](#s23--receiver-settings)
   - [S24 Language Selection](#s24--language-selection)
   - [S25 Manage Auto Alerts](#s25--manage-auto-alerts)
   - [S26 Add Custom Alert](#s26--add-custom-alert)
   - [S27 Quick Alerts Grid](#s27--quick-alerts-grid)
   - [S28 Speech Text Review](#s28--speech-text-review)
   - [S29 TTS Audio Ready](#s29--tts-audio-ready)
   - [S30 Help & Guide](#s30--help--guide)
   - [S31 About iTantra](#s31--about-itantra)
6. [Interaction & Animation Spec](#6-interaction--animation-spec)
7. [Data Bindings Reference](#7-data-bindings-reference)

---

## 1. Design System & Color Tokens

### Color Palette

| Token Name | Hex | Usage |
|---|---|---|
| `TacticalBlack` | `#0B0E0D` | Root background (OLED black) |
| `DarkBackground` | `#0B0E0D` | Screen background |
| `DarkSurface` | `#161B19` | Cards, input fields, panels |
| `DarkBorder` | `#1E3A2A` | Card borders, dividers |
| `TacticalGreen` | `#8AE02B` | Primary brand color, active PTT, icons |
| `TacticalGreenBright` | `#74C020` | Accent, headings, success states |
| `TacticalGreenDim` | `#1E3A12` | Button fills, muted backgrounds |
| `LcdGreenBg` | `#0A1A0A` | LCD display background |
| `LcdGreenText` | `#39FF14` | LCD monospace text (neon green) |
| `AlertRed` | `#FF3B30` | SOS, errors, critical alerts |
| `AlertOrange` | `#FFA000` | HIGH priority, warnings |
| `SignalBlue` | `#3A9BDC` | Translation icon, English text TTS |
| `RadarNavy` | `#162024` | Radar background |
| `TextPrimary` | `#DDEEDD` | Main readable text |
| `TextSecondary` | `#7A9A7A` | Subtitles, labels, hints |
| `TextMuted` | `#4A6A4A` | Disabled, placeholder, footnotes |
| `SosRed` | `#CC0000` | SOS button fill (darker red) |
| `SosGlow` | `#FF000066` | SOS pulsing glow alpha layer |

### Elevation / Shadow
- Cards use no elevation shadows (dark theme, border instead)
- Active states use colored border `2.dp` in TacticalGreen
- Bottom Nav uses top border `1.dp DarkBorder`

---

## 2. Typography Specification

| Role | Size | Weight | Color | Font |
|---|---|---|---|---|
| App Title | 28sp | Bold | TacticalGreenBright | Monospace |
| Screen Title | 20sp | Bold | TextPrimary | Default |
| Section Header | 16sp | SemiBold | TacticalGreen | Default |
| Body Text | 15sp | Normal | TextPrimary | Default |
| Message Content | 18sp | Normal | TacticalGreenBright | Default |
| Translated Text | 16sp | Normal | TextPrimary | Default |
| LCD Display | 14sp | Bold | LcdGreenText | Monospace |
| Label / Caption | 12sp | Normal | TextSecondary | Default |
| Footnote / Muted | 11sp | Normal | TextMuted | Default |
| Priority Badge | 11sp | Bold | varies | Default |
| Button Text | 15sp | Bold | TacticalBlack / TacticalGreenBright | Default |

---

## 3. Component Library

### `WalkieLcdDisplay`
```
┌─── LCD PANEL ─────────────────────────┐
│  ▓▓ ITANTRA-NET ▓▓  [LCD neon green] │
│  CH: 3/10    LANG: Hindi (hi)        │
│  SIGNAL: ████░ 4/5  PEERS: 4         │
│  STATUS: LISTENING...                 │
└───────────────────────────────────────┘
```
- Background: `LcdGreenBg` (#0A1A0A)
- Text: `LcdGreenText` (#39FF14), Monospace
- Border: `DarkBorder`, RoundedCorner 8dp
- Padding: 12dp all sides
- Scan-line overlay: horizontal lines at 2px interval, alpha 0.06

---

### `PushToTalkButton` (PTT)
```
        ┌ Outer glow ring (alpha anim) ┐
       ╔══════════════════════════╗
       ║   🎤  HOLD TO SPEAK     ║   ← 96dp diameter circle
       ║      [release to send]  ║
       ╚══════════════════════════╝
        └──────────────────────────┘
```
**States:**
| State | Fill | Glow | Label |
|---|---|---|---|
| IDLE | TacticalGreenDim | None | "Hold to Speak" |
| PRESSED | TacticalGreen | TacticalGreen 40% alpha ring | "Recording…" |
| TRANSMITTING | AlertOrange | AlertOrange pulse | "Sending…" |
| DISABLED | TextMuted | None | "No Channel" |

- Size: 96dp default, 120dp on reply screen, 140dp on SOS screen
- Animation: `infiniteTransition` pulsing scale 1.0→1.08 at 800ms when active

---

### `RadarView`
```
        ┌──────────────────────────┐
        │      RadarNavy bg        │
        │   ·Rescue_01 (1.2m)     │  ← Blinking green dot
        │      ·Team_Alpha (3.5m) │
        │  ·Unit_77 (5.1m)        │
        │     (sweep line rotates)│  ← Green arc, 360°/3s
        └──────────────────────────┘
```
- Background: `RadarNavy` (#162024)
- Concentric rings: 3 rings, stroke 1dp, DarkBorder
- Sweep line: TacticalGreen, alpha 0.7, rotates via `animateFloatAsState`
- Device dots: 6dp circle, TacticalGreen, blink via `InfiniteTransition`
- Distance label: 10sp TextSecondary next to dot

---

### Priority Badge
```
  [🔴 SOS]         ← AlertRed bg, white text
  [🔺 HIGH]        ← AlertOrange bg, black text
  [✅ NORMAL]       ← TacticalGreenDim bg, TacticalGreenBright text
```
- Padding: 4dp horizontal, 2dp vertical
- Shape: RoundedCorner 6dp
- Font: 11sp Bold

---

### Signal Bars
```
  ████░░  4/5 bars
  ██████  5/5 bars (full)
  █░░░░░  1/5 bars (weak)
```
- Each bar: 4dp wide, heights 8/10/12/14/16dp
- Color: TacticalGreen when filled, DarkBorder when empty
- Spacing: 2dp between bars

---

### Bottom Navigation Bar
```
┌──────────────────────────────────────┐
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
│  ──●──          (active indicator)   │
└──────────────────────────────────────┘
```
- Height: 56dp
- Background: DarkSurface
- Top border: 1dp DarkBorder
- Active icon/text: TacticalGreen
- Inactive icon/text: TextMuted
- Active indicator: 2dp bottom line TacticalGreen

---

### Mode Switcher Tab
```
┌─────────────┬─────────────┐
│  📥RECEIVER │ 📤BROADCAST │  ← Toggle tabs
│   ──────── │             │   ← Active underline TacticalGreen
└─────────────┴─────────────┘
```
- Height: 44dp
- Background: DarkSurface
- Active: TacticalGreenBright text + 3dp bottom border
- Inactive: TextMuted text

---

## 4. Navigation Map

```
SPLASH (1.2s auto)
    │
    ▼
FIRST_TIME_SETUP
    ├──► PERMISSIONS ──────────────────► FIRST_TIME_SETUP
    ├──► LANGUAGE_SELECT ──────────────► FIRST_TIME_SETUP
    └──► HOME (after setup complete)
         │
         ├──[Bottom Nav: Home]──────────► HOME
         ├──[Bottom Nav: History]───────► HISTORY
         ├──[Bottom Nav: Channels]──────► CHANNELS (Channel Monitor)
         ├──[Bottom Nav: Settings]──────► SETTINGS
         │
         ├──[Mode: RECEIVER]────────────► RECEIVE (Receiver Home)
         │    │
         │    ├──[Incoming message]─────► INCOMING_ALERT
         │    │    └──[Acknowledge]─────► MESSAGE_RECEIVED
         │    │         ├──[Play Now]───► NOW_PLAYING
         │    │         │    ├──[Translate]─► TRANSLATION
         │    │         │    └──[Reply]────► QUICK_RESPONSE
         │    │         ├──[Translate]──► TRANSLATION
         │    │         │    └──[Reply]────► HOLD_TO_SPEAK_REPLY
         │    │         │         └──[Send]─► REPLY_SENT ──► HOME
         │    │         └──[Quick Reply]─► QUICK_RESPONSE
         │    │              ├──[Voice]─► HOLD_TO_SPEAK_REPLY
         │    │              └──[Text]──► HOLD_TO_SPEAK_REPLY
         │    │
         │    └──[SOS button]──────────► EMERGENCY_SOS
         │
         ├──[Mode: BROADCAST]───────────► TRANSMIT (Broadcast Home)
         │    │
         │    ├──[Hold PTT]────────────► SPEECH_TEXT (live STT review)
         │    │    └──[Broadcast]──────► TTS_AUDIO
         │    │         └──[Send]──────► ACTIVE_BROADCASTING
         │    │                └──[Done]─► BROADCAST_CONFIRMED ──► HOME
         │    │
         │    ├──[Auto Alerts]─────────► AUTO_ALERTS
         │    │    └──[Select alert]───► SELECT_ALERT_DETAIL
         │    │         └──[Broadcast]─► ACTIVE_BROADCASTING
         │    │                └──[Done]─► BROADCAST_CONFIRMED
         │    │
         │    ├──[Custom Message]──────► CUSTOM_MESSAGE
         │    │    └──[Broadcast]──────► ACTIVE_BROADCASTING
         │    │
         │    ├──[Manage Alerts]───────► MANAGE_AUTO_ALERTS
         │    │    └──[Add]────────────► ADD_CUSTOM_ALERT ──► MANAGE_AUTO_ALERTS
         │    │
         │    └──[Quick Grid]──────────► QUICK_ALERTS_GRID
         │         └──[Tap any]────────► ACTIVE_BROADCASTING
         │
         ├──[CHANNELS screen]───────────► CHANNEL_MANAGEMENT
         │
         └──[SETTINGS screen]───────────┬► LANGUAGE_SELECT ──► SETTINGS
                                        ├► HELP_GUIDE
                                        └► ABOUT_PAGE
```

---

## 5. Screen Specifications

---

### S01 — Splash Screen
**Route:** `AppNavDestination.SPLASH`
**File:** `ReceiverScreens.kt :: SplashScreen`
**Auto-navigate:** After 1200ms → `FIRST_TIME_SETUP`

#### Layout (Portrait, full screen)
```
┌──────────────────────────────────────┐  ← DarkBackground full screen
│                                      │
│                                      │
│                                      │
│            ┌──────────┐              │
│            │    📡    │              │  ← 80dp circle, TacticalGreen bg
│            │  (icon)  │              │  ← CellTower icon, TacticalBlack tint
│            └──────────┘              │
│                                      │
│           I T A N T R A              │  ← 32sp Bold, Monospace, TacticalGreenBright
│      Neural Walkie-Talkie            │  ← 13sp, TextSecondary
│                                      │
│                                      │
│                                      │
│                                      │
│                                      │
│   ═══════════════════════════════   │  ← LinearProgressIndicator
│   ✦ TacticalGreen fill              │  ← Indeterminate animation
│                                      │
│   Initializing secure channel...    │  ← 12sp TextMuted, center
│                                      │
│                                      │
│         ISRO — PS 26173              │  ← 11sp TextMuted, bottom
└──────────────────────────────────────┘
```

#### States
| State | Description |
|---|---|
| Loading | Progress bar animating, "Initializing secure channel…" |
| Done | Auto-transition after 1200ms delay |

#### Notes
- No back button, no top bar
- Status bar: hidden / edge-to-edge
- Background: `DarkBackground` solid

---

### S02 — First Time Setup
**Route:** `AppNavDestination.FIRST_TIME_SETUP`
**File:** `OnboardingScreens.kt :: FirstTimeSetupScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  [No Top Bar — custom header below]  │
│                                      │
│  🛡  WELCOME TO                      │  ← 22sp Bold TacticalGreenBright
│      iTANTRA                         │
│  Complete setup to continue          │  ← 14sp TextSecondary
│                                      │
│  ─────────────────────────────────  │  ← DarkBorder divider
│                                      │
│  STEP 1: Select Language             │  ← 13sp TacticalGreen SemiBold
│  ┌────────────────────────────────┐  │
│  │  🌐  Hindi (हिंदी)         ▾  │  │  ← DarkSurface card, dropdown
│  └────────────────────────────────┘  │
│                                      │
│  STEP 2: Grant Permissions           │  ← 13sp TacticalGreen SemiBold
│  ┌────────────────────────────────┐  │
│  │  Audio  •  Bluetooth  •  Wi-Fi │  │  ← DarkSurface card
│  │  Status: ✅ Granted / ❌ Denied│  │  ← Green or Red status
│  │  ┌──────────────────────────┐  │  │
│  │  │  GRANT PERMISSIONS →     │  │  │  ← AlertOrange outlined button
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │      CONTINUE TO APP →         │  │  ← TacticalGreen filled button
│  └────────────────────────────────┘  │  ← Disabled (TextMuted) if perms denied
│                                      │
│  Skip setup (demo mode)             │  ← TextMuted, small, underlined
└──────────────────────────────────────┘
```

#### Interactive Elements
| Element | Action | Navigates To |
|---|---|---|
| Language dropdown | Opens bottom sheet | Language selection sheet |
| Grant Permissions button | Opens permissions | `PERMISSIONS` |
| Continue button | Proceeds only if perms granted | `HOME` |
| Skip setup | Skips to home with defaults | `HOME` |

---

### S03 — Permissions Setup
**Route:** `AppNavDestination.PERMISSIONS`
**File:** `OnboardingScreens.kt :: PermissionsSetupScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ←  Required Permissions              │  ← Back arrow → FIRST_TIME_SETUP
│ ────────────────────────────────── │
│                                      │
│  These permissions are required      │  ← 13sp TextSecondary
│  for iTantra to function offline.    │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🎙  Record Audio              │  │  ← Row: icon + name + status
│  │      Required for PTT/STT      │  │  ← 12sp TextMuted subtitle
│  │                          [✓]   │  │  ← TacticalGreen if granted, AlertRed if denied
│  ├────────────────────────────────┤  │
│  │  📍  Fine Location             │  │
│  │      Required for Wi-Fi Direct │  │
│  │                          [✓]   │  │
│  ├────────────────────────────────┤  │
│  │  🔵  Bluetooth Scan            │  │
│  │      BLE peer discovery        │  │
│  │                          [✓]   │  │
│  ├────────────────────────────────┤  │
│  │  📡  Bluetooth Advertise       │  │
│  │      BLE mesh broadcasting     │  │
│  │                          [✓]   │  │
│  ├────────────────────────────────┤  │
│  │  🌐  Nearby Wi-Fi Devices      │  │
│  │      Wi-Fi Direct P2P          │  │
│  │                          [✓]   │  │
│  ├────────────────────────────────┤  │
│  │  🔔  Post Notifications        │  │
│  │      Alert delivery (Android13+│  │
│  │                          [✓]   │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │     REQUEST ALL PERMISSIONS    │  │  ← AlertOrange button
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │       CONTINUE ANYWAY →        │  │  ← Outlined TextSecondary button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S04 — Home Dashboard
**Route:** `AppNavDestination.HOME`
**File:** `BasicFlowScreens.kt :: HomeDashboardScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  iTANTRA              [📡 CH 3/10]  │  ← TopBar: 18sp Bold Mono + channel badge
│  ────────────────────────────────── │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  [📥 RECEIVER] [📤 BROADCAST] │  │  ← Mode switcher tabs
│  └──────────────────────────────┘   │
│                                      │
│  ┌─── LCD DISPLAY ────────────────┐  │  ← WalkieLcdDisplay
│  │  ▓ ITANTRA-NET ▓    CH 3/10   │  │
│  │  LANG: Hindi (hi)  PEERS: 4   │  │
│  │  SIGNAL: ████░  STATUS: READY  │  │
│  └────────────────────────────────┘  │
│                                      │
│          ╔════════════════╗          │
│          ║   🎤  HOLD     ║          │  ← PushToTalkButton 96dp
│          ║  TO SPEAK      ║          │  ← TacticalGreen fill
│          ╚════════════════╝          │
│                                      │
│  ┌─────────────┐  ┌───────────────┐  │
│  │  📨  MSGS   │  │  📻  CHANNELS │  │  ← Quick action cards
│  │     3 new   │  │   CH 3/10     │  │  ← DarkSurface, 12sp labels
│  └─────────────┘  └───────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🚨 EMERGENCY SOS              │  │  ← AlertRed card, full width
│  │  Tap & Hold for distress call  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Network: Wi-Fi Direct + BLE Ready   │  ← 11sp TextMuted bottom status
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │  ← Bottom Nav
└──────────────────────────────────────┘
```

#### Interactive Elements
| Element | Action | Navigates To |
|---|---|---|
| RECEIVER tab | Switch mode | `RECEIVE` |
| BROADCAST tab | Switch mode | `TRANSMIT` |
| Hold to Speak button | PTT → record | `TRANSMIT` |
| Msgs card | Open history | `HISTORY` |
| Channels card | Open channels | `CHANNELS` |
| Emergency SOS card | SOS screen | `EMERGENCY_SOS` |
| Bottom Nav icons | Navigate | respective screens |

---

### S05 — Receiver Home
**Route:** `AppNavDestination.RECEIVE`
**File:** `ReceiverScreens.kt :: ReceiverHomeScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ←  📥 RECEIVER MODE    [CH 3/10]    │  ← Back arrow + title + channel
│ ────────────────────────────────── │
│                                      │
│  ┌─── SIGNAL LCD ──────────────────┐ │
│  │  RECEIVING ON CH 3/10           │ │  ← LcdGreenText
│  │  LANG: Hindi → English (auto)   │ │
│  │  AUTO-TRANSLATE: ✓   TTS: ✓    │ │
│  │  SIGNAL: ████░  PEERS: 4        │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── RADAR ───────────────────────┐ │
│  │  ·Rescue_01 (1.2m)             │ │  ← RadarView, full width
│  │       ·Team_Alpha (3.5m)       │ │  ← 200dp height
│  │             ·Unit_77 (5.1m)    │ │
│  │  ·Field_Comm (7.3m)            │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ████ ██ ████ ██ ████ ██  Listening │  ← Animated wave bars + status
│                                      │
│  ┌──────────┐  ┌────────────────┐   │
│  │  🔇 Mute │  │  📋 History   │   │  ← Action buttons
│  └──────────┘  └────────────────┘   │
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
└──────────────────────────────────────┘
```

#### Auto-trigger
- When `TransceiverManager.incomingMessages` emits a new `WalkieMessage`, auto-navigate to `INCOMING_ALERT` with the message as argument

---

### S06 — Incoming Alert
**Route:** `AppNavDestination.INCOMING_ALERT`
**File:** `ReceiverScreens.kt :: IncomingAlertScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  🔴 INCOMING ALERT                   │  ← AlertRed background strip, 20sp Bold
│ ────────────────────────────────── │
│                                      │
│     ┌──────────────────────────┐     │
│     │  ◎ ◎ ◎  SENDER  ◎ ◎ ◎  │     │  ← 3 concentric pulse rings
│     │                          │     │  ← AnimatedPulseRings composable
│     │     FROM: Rescue_01      │     │  ← 18sp TacticalGreenBright
│     │     ID: R01-A7           │     │  ← 13sp TextSecondary
│     │     📍 1.2 km away       │     │  ← 13sp TextSecondary
│     └──────────────────────────┘     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🔺 PRIORITY: HIGH             │  │  ← Priority badge + card
│  │  Channel: 3/10  •  Hindi (hi)  │  │
│  │  Tag: #FloodAlert              │  │
│  │  Received: 10:15 AM            │  │
│  └────────────────────────────────┘  │
│                                      │
│  ████ ██ █████ ██ ███ ██ ████ ██    │  ← Animated audio waveform (8 bars)
│                                      │  ← Heights vary via InfiniteTransition
│                                      │
│  ┌────────────────────────────────┐  │
│  │   ✅   ACKNOWLEDGE ALERT       │  │  ← TacticalGreen button, full width
│  └────────────────────────────────┘  │
│                                      │
│  [🔕 Dismiss]    [📋 View Details]   │  ← TextSecondary text buttons
└──────────────────────────────────────┘
```

#### Behavior
- Rings pulse: `scale 1.0 → 1.4`, alpha `1.0 → 0.0`, 3 rings offset 300ms each
- Waveform: random heights update every 150ms via `LaunchedEffect`
- Acknowledge → navigate to `MESSAGE_RECEIVED`
- If `priority == SOS`: red rings, no dismiss button, volume override triggered

---

### S07 — Message Received
**Route:** `AppNavDestination.MESSAGE_RECEIVED`
**File:** `ReceiverScreens.kt :: MessageReceivedScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Back       MESSAGE RECEIVED        │  ← Back arrow + 18sp title
│ ────────────────────────────────── │
│                                      │
│  ┌─── FROM ────────────────────────┐ │
│  │  👤  Rescue_01  (R01-A7)        │ │  ← Sender row
│  │  Channel: 3/10  •  📍 1.2 km   │ │  ← Sub info row
│  │  🔺 HIGH  •  #FloodAlert        │ │  ← Priority badge + tag
│  │  10:15 AM                       │ │  ← Timestamp, TextMuted right-aligned
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── MESSAGE CONTENT ─────────────┐ │  ← LcdGreenBg card
│  │  "पानी का स्तर बढ़ रहा है।    │ │  ← LcdGreenText 16sp, scrollable
│  │   पुल के पास मत जाओ। तुरंत    │ │
│  │   सुरक्षित स्थान पर जाएं।"    │ │
│  │                                  │ │
│  │  Language: Hindi                 │ │  ← 12sp TextSecondary
│  │  Signal: ████░  Duration: 3.5s  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Auto-playing in: ⏱  3s             │  ← Countdown timer, AlertOrange
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ▶   PLAY NOW                  │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  文A  VIEW TRANSLATION          │  │  ← SignalBlue outlined button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ↩   QUICK REPLY               │  │  ← TacticalGreenDim outlined button
│  └────────────────────────────────┘  │
│                                      │
│  Time Received: 10:15 AM            │  ← 11sp TextMuted
└──────────────────────────────────────┘
```

#### Auto-play Timer
- `LaunchedEffect` countdown from 3
- If user doesn't tap anything, auto-navigates to `NOW_PLAYING` at 0
- Countdown label: `TextPrimary` 16sp, AlertOrange color

---

### S08 — Translation View
**Route:** `AppNavDestination.TRANSLATION`
**File:** `ReceiverScreens.kt :: TranslationScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Translation                  文A   │  ← Back + title + 文A icon TacticalGreen
│ ────────────────────────────────── │
│                                      │
│  ┌─── HINDI (Original) ────────────┐ │  ← DarkSurface card
│  │  Header row:                    │ │
│  │   "Hindi (Original)"      [🔊]  │ │  ← Label left, VolumeUp icon right
│  │   TextSecondary 12sp    GreenBright│
│  │                                  │ │
│  │  "पानी का स्तर बढ़ रहा है।    │ │  ← TacticalGreenBright 18sp
│  │   पुल के पास मत जाओ। तुरंत    │ │  ← lineHeight 26sp
│  │   सुरक्षित स्थान पर जाएं।"    │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── ENGLISH (Translated) ────────┐ │  ← DarkSurface card
│  │  Header row:                    │ │
│  │   "English (Translated)"  [🔊]  │ │  ← SignalBlue tint on icon
│  │                                  │ │
│  │  "Water level is rising. Do not │ │  ← TextPrimary 16sp
│  │   go near the bridge. Move to   │ │  ← lineHeight 24sp
│  │   a safe zone immediately."     │ │
│  └─────────────────────────────────┘ │
│                                      │
│  [weight=1f spacer]                  │
│                                      │
│  ┌──────────────────────────────────┐│
│  │  📥       ▶ (68dp)      🎤   📤 ││  ← Action bar Row
│  │ Save   Play Trans.   Reply  Share││
│  │ 11sp    48dp circle  11sp  11sp  ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

#### Bottom Action Bar Detail
```
  ┌──────────────────────────────────────────┐
  │  [📥 48dp]  [▶ 68dp circle]  [🎤 48dp]  [📤 48dp] │
  │   Save     Play Translated    Reply       Share     │
  │  DkSurf     TacticalGreen    GreenDim    DkSurf    │
  └──────────────────────────────────────────┘
```
- Play button: 68dp circle, TacticalGreen fill, PlayArrow icon TacticalBlack
- Others: 48dp circles, DarkSurface fill
- Reply tap → navigate to `HOLD_TO_SPEAK_REPLY`

---

### S09 — Now Playing
**Route:** `AppNavDestination.NOW_PLAYING`
**File:** `ReceiverScreens.kt :: NowPlayingScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Now Playing                        │  ← Back
│ ────────────────────────────────── │
│                                      │
│  ┌────────────────────────────────┐  │  ← DarkSurface info card
│  │  📻  Rescue_01  •  CH 3/10    │  │
│  │  Hindi  •  Duration: 3.5s     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │  ← Waveform panel
│  │                                │  │  ← LcdGreenBg background
│  │  ████ ██ ████ ██ ████ ██ ████ │  │  ← 16 bars, heights animated
│  │  ████ ██ ████ ██ ████ ██ ████ │  │  ← TacticalGreen color
│  │                                │  │
│  └────────────────────────────────┘  │
│                                      │
│  0:01  ──────────●────────────  0:03 │  ← Slider seek bar
│        TacticalGreen thumb/track     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   ◄◄ 10s    ▐▐ / ▶    10s ►► │  │  ← Playback controls
│  │   rewind    pause/play  fwd   │  │  ← Icon buttons 40dp each
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  文A  VIEW TRANSLATION          │  │  ← Outlined SignalBlue button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ↩   QUICK REPLY               │  │  ← Outlined TacticalGreenDim button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

#### Waveform Animation Spec
- 16 bars, width 4dp, spacing 3dp
- Height range: 8dp–48dp
- Animation: `InfiniteTransition`, each bar offset `i * 80ms` duration
- TTS audio plays via `AudioTrack` (16kHz, PCM_FLOAT)
- Waveform heights driven by live RMS of playback buffer

---

### S10 — Hold to Speak Reply
**Route:** `AppNavDestination.HOLD_TO_SPEAK_REPLY`
**File:** `AllRemainingScreens.kt :: HoldToSpeakReplyScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Reply                              │  ← Back arrow
│ ────────────────────────────────── │
│                                      │
│  Replying to: Rescue_01              │  ← 13sp TextSecondary
│  Channel: 3/10  •  Hindi (hi)        │  ← 12sp TextMuted
│                                      │
│  ┌─── MIC LEVEL ───────────────────┐ │
│  │  [label] Mic Level        78%   │ │  ← TacticalGreen LinearProgressIndicator
│  │  ████████████████░░░░░░         │ │  ← 0%→100% real-time AudioRecord RMS
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── LIVE WAVEFORM ───────────────┐ │
│  │  ████ ██ ████ ██ ████ ██ ████  │ │  ← 12 bars, real RMS driven
│  └─────────────────────────────────┘ │
│                                      │
│              ╔══════════════════╗    │
│              ║   🎤  HOLD       ║    │  ← 120dp circle
│              ║   TO SPEAK       ║    │  ← IDLE: TacticalGreenDim
│              ╚══════════════════╝    │  ← RECORDING: AlertRed + glow ring
│                                      │
│  ─ Hold to record · Release to send ─│  ← 12sp TextMuted center
│                                      │
│  ┌─── STT LIVE TRANSCRIPT ─────────┐ │
│  │  "बाढ़ क्षेत्र में पानी का..."  │ │  ← LcdGreenText, updates in real-time
│  └─────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   ❌  CANCEL                   │  │  ← AlertRed outlined, goes back
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

#### PTT Button States
| State | Color | Glow | Label |
|---|---|---|---|
| IDLE | TacticalGreenDim | None | "Hold to Speak" |
| TOUCH_DOWN | AlertRed | AlertRed 30% ring pulse | "Recording…" |
| TOUCH_UP | AlertOrange | None | "Processing…" |
| SENDING | TacticalGreen | TacticalGreen glow | "Sending…" |

#### Behavior on Release
1. `WalkieAudioManager.stopRecording()` → PCM buffer
2. `VadManager.flush()` → trimmed samples
3. `SttEngine.transcribe()` → text
4. Navigate to `REPLY_SENT` after send

---

### S11 — Reply Sent
**Route:** `AppNavDestination.REPLY_SENT`
**File:** `AllRemainingScreens.kt :: ReplySentScreen`

#### Layout
```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│                                      │
│            ┌──────────────┐          │  ← 100dp circle TacticalGreen
│            │              │          │
│            │  ✅ (check)  │          │  ← CheckCircle icon, 48dp white
│            │              │          │
│            └──────────────┘          │
│                                      │
│           REPLY SENT!                │  ← 24sp Bold TacticalGreenBright center
│                                      │
│  ┌────────────────────────────────┐  │
│  │  To: Rescue_01                 │  │  ← DarkSurface summary card
│  │  Channel: 3/10  •  10:16 AM   │  │
│  │  Codec: NEURAL  •  87 bytes    │  │
│  │  Peers delivered: 3            │  │
│  └────────────────────────────────┘  │
│                                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   🏠  BACK TO HOME             │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │
│                                      │
│  📋 View in History                  │  ← TextSecondary text link
│                                      │
└──────────────────────────────────────┘
```

---

### S12 — Quick Response
**Route:** `AppNavDestination.QUICK_RESPONSE`
**File:** `AllRemainingScreens.kt :: QuickResponseScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Quick Response                     │
│ ────────────────────────────────── │
│                                      │
│  Select a preset reply:              │  ← 13sp TextSecondary
│                                      │
│  ┌────────────────────────────────┐  │  ← 6 preset rows
│  │  ✅  Message received          │  │  ← DarkSurface, 56dp height
│  └────────────────────────────────┘  │  ← Tap → send + navigate REPLY_SENT
│  ┌────────────────────────────────┐  │
│  │  🚶  Moving to safe zone       │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ⚕  Need medical assistance    │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  📍  At evacuation point       │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🔄  Please repeat message     │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ✋  Cannot comply             │  │
│  └────────────────────────────────┘  │
│  ─────────────────────────────────   │
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  🎤 VOICE    │  │  ✏ TEXT      │  │  ← Both lead to HOLD_TO_SPEAK_REPLY
│  │   REPLY      │  │   REPLY      │  │
│  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────┘
```

---

### S13 — Emergency SOS
**Route:** `AppNavDestination.EMERGENCY_SOS`
**File:** `ReceiverScreens.kt :: EmergencyShortcutScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  🚨 EMERGENCY SOS                    │  ← AlertRed header strip
│ ────────────────────────────────── │
│                                      │
│  ┌────────────────────────────────┐  │  ← AlertOrange warning card
│  │  ⚠  WARNING                    │  │
│  │  This will override mute and   │  │
│  │  DND on ALL nearby devices.    │  │
│  │  Volume forced to maximum.     │  │
│  └────────────────────────────────┘  │
│                                      │
│                                      │
│          ┌ pulse ring ─── ┐          │
│         ╔════════════════╗           │  ← 140dp circle
│         ║   🚨           ║           │  ← AlertRed / SosRed fill
│         ║    SOS         ║           │  ← Pulsing scale + alpha glow
│         ║  TAP & HOLD    ║           │  ← 28sp Bold white
│         ║ TO BROADCAST   ║           │
│         ╚════════════════╝           │
│          └ pulse ring ─── ┘          │
│                                      │
│  ─────────────────────────────────   │
│                                      │
│  Active Peers: 4 devices in range   │  ← 13sp TextSecondary
│  Override: STREAM_ALARM @ 100%      │  ← 12sp TextMuted
│                                      │
│  [❌  CANCEL / BACK]                │  ← Outlined TextSecondary button
└──────────────────────────────────────┘
```

#### SOS Button Behavior
- Requires `pointerInput` hold detection (500ms threshold)
- On hold confirmed: `TransceiverManager.triggerEmergencyAlarm()`
- Sends `NeuralPacket(priority = SOS)`
- `AudioManager.STREAM_ALARM` set to max volume
- `ToneGenerator.TONE_CDMA_EMERGENCY_RINGBACK` plays
- Vibration pattern: `[0, 500, 200, 500]`

---

### S14 — Broadcast Home
**Route:** `AppNavDestination.TRANSMIT`
**File:** `BroadcastScreens.kt :: BroadcastHomeScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  📤 BROADCAST MODE     [CH 3/10]    │  ← TopBar
│ ────────────────────────────────── │
│                                      │
│  ┌─── LCD DISPLAY ────────────────┐  │
│  │  TRANSMIT READY  CH 3/10       │  │  ← WalkieLcdDisplay
│  │  LANG: English (en)  PEERS: 4  │  │
│  │  SIGNAL: ████░   STATUS: IDLE  │  │
│  └────────────────────────────────┘  │
│                                      │
│          ╔════════════════╗          │
│          ║   🎤  HOLD     ║          │  ← PushToTalkButton 96dp
│          ║   TO TALK      ║          │  ← TacticalGreen idle
│          ╚════════════════╝          │  ← AlertRed + pulse when recording
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  🔔 AUTO     │  │  ✏ CUSTOM    │  │  ← Quick action cards
│  │   ALERTS     │  │   MESSAGE    │  │  ← DarkSurface 80dp height
│  └──────────────┘  └──────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ⚡ QUICK ALERTS GRID (2×3)    │  │  ← Grid card preview
│  └────────────────────────────────┘  │
│                                      │
│  Last broadcast: 10:10 AM  •  CH 3   │  ← 11sp TextMuted
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
└──────────────────────────────────────┘
```

---

### S15 — Auto Alerts Menu
**Route:** `AppNavDestination.AUTO_ALERTS`
**File:** `BroadcastScreens.kt :: AutoAlertsScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Auto Alert Messages                │  ← 18sp Bold back + title
│ ────────────────────────────────── │
│                                      │
│  Select a pre-configured alert       │  ← 13sp TextSecondary
│  to broadcast instantly              │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🌊  Flood Warning             │  │  ← Row: 56dp height
│  │      Water level is critical   │  │  ← 12sp TextSecondary preview
│  │                            ▶   │  │  ← ChevronRight icon
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🚶  Evacuation Alert          │  │
│  │      Immediate evacuation      │  │
│  │                            ▶   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🏥  Medical Emergency         │  │
│  │      Medical help needed       │  │
│  │                            ▶   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🔥  Fire Alert                │  │
│  │      Fire emergency            │  │
│  │                            ▶   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🌍  Earthquake Warning        │  │
│  │      Seismic activity detected │  │
│  │                            ▶   │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ⚠   General Warning           │  │
│  │      General emergency alert   │  │
│  │                            ▶   │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S16 — Select Alert Detail
**Route:** `AppNavDestination.SELECT_ALERT_DETAIL`
**File:** `BroadcastScreens.kt :: SelectAlertDetailScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Select Alert                       │
│ ────────────────────────────────── │
│                                      │
│  ┌─── ALERT PREVIEW ───────────────┐ │  ← DarkSurface card
│  │   🌊                            │ │  ← 48dp icon centered
│  │   FLOOD WARNING                 │ │  ← 20sp Bold TacticalGreenBright
│  │                                  │ │
│  │  "Water level is rising. Please  │ │  ← Body text TextPrimary 15sp
│  │   evacuate low-lying areas       │ │
│  │   immediately. Move to shelter   │ │
│  │   at high ground. Avoid the      │ │
│  │   bridge and riverside roads."   │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Broadcast Language:                 │  ← 13sp TacticalGreen label
│  ┌────────────────────────────────┐  │
│  │  🌐  Hindi (हिंदी)         ▾  │  │  ← ExposedDropdownMenuBox
│  └────────────────────────────────┘  │
│                                      │
│  Priority:                           │  ← 13sp TacticalGreen label
│  ┌──────────┬──────────┬──────────┐  │
│  │  NORMAL  │  HIGH ✓  │ 🚨 SOS  │  │  ← Segmented button group
│  └──────────┴──────────┴──────────┘  │
│  Active: TacticalGreen bg + bold     │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   📤  BROADCAST NOW            │  │  ← AlertOrange (HIGH) or AlertRed (SOS)
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S17 — Active Broadcasting
**Route:** `AppNavDestination.ACTIVE_BROADCASTING`
**File:** `AllRemainingScreens.kt :: ActiveBroadcastingScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  📡 BROADCASTING...                  │  ← TacticalGreenBright 20sp Bold
│ ────────────────────────────────── │
│                                      │
│  ┌─── RADAR VIEW ──────────────────┐ │  ← RadarView full width
│  │   ·Rescue_01 (1.2m)            │ │  ← Green sweep rotation
│  │       ·Team_Alpha (3.5m)       │ │  ← Pulse rings emitting outward
│  │           ·Unit_77 (5.1m)      │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐  │  ← DarkSurface stat card
│  │  📡 RECIPIENTS: 4 devices      │  │
│  │  📦 PACKET: 87B  •  NEURAL     │  │
│  │  📻 CHANNEL: CH 3  •  STRONG   │  │
│  │  🗣 LANG: Hindi (hi)           │  │
│  └────────────────────────────────┘  │
│                                      │
│  ████████████████░░░░  Sending...   │  ← LinearProgressIndicator TacticalGreen
│                                      │
│  ┌────────────────────────────────┐  │
│  │   ❌  CANCEL BROADCAST         │  │  ← AlertRed outlined button
│  └────────────────────────────────┘  │
│                                      │
│  Auto-completes when all delivered   │  ← 11sp TextMuted
└──────────────────────────────────────┘
```

#### Completion
- On success: navigate to `BROADCAST_CONFIRMED`
- On cancel: navigate back to `TRANSMIT`

---

### S18 — Custom Message
**Route:** `AppNavDestination.CUSTOM_MESSAGE`
**File:** `BroadcastScreens.kt :: CustomMessageScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Custom Message                     │
│ ────────────────────────────────── │
│                                      │
│  Compose your broadcast message      │  ← 13sp TextSecondary
│                                      │
│  ┌─── MESSAGE INPUT ───────────────┐ │
│  │                                  │ │  ← DarkSurface
│  │  Type your emergency message    │ │  ← Placeholder TextMuted
│  │  in any language...              │ │
│  │                                  │ │
│  │                                  │ │  ← Min height 120dp
│  │                      0 / 200    │ │  ← Counter bottom-right TextMuted
│  └─────────────────────────────────┘ │  ← TacticalGreen border when focused
│                                      │
│  ┌─── TRANSLATION PREVIEW ─────────┐ │
│  │  文A  English (Translated):      │ │  ← Auto-translates as user types
│  │  "Water level is rising..."      │ │  ← TextPrimary 14sp
│  │  (updating…)                     │ │  ← TextMuted when loading
│  └─────────────────────────────────┘ │
│                                      │
│  Target Language:                    │
│  ┌────────────────────────────────┐  │
│  │  🌐  All 10 Languages      ▾  │  │  ← Language picker
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   📤  BROADCAST MESSAGE        │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │  ← Disabled if text empty
└──────────────────────────────────────┘
```

---

### S19 — Broadcast Confirmed
**Route:** `AppNavDestination.BROADCAST_CONFIRMED`
**File:** `BroadcastScreens.kt :: BroadcastConfirmedScreen`

#### Layout
```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│           ┌──────────────┐           │  ← 100dp circle TacticalGreen fill
│           │  ✅           │           │
│           │  BROADCAST   │           │  ← CheckCircle icon 48dp white
│           │  CONFIRMED   │           │
│           └──────────────┘           │
│                                      │
│          DELIVERED!                  │  ← 24sp Bold TacticalGreenBright center
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ✅ Delivered to: 4 devices    │  │  ← DarkSurface summary
│  │  Channel: 3/10  •  10:17 AM   │  │
│  │  Packet: NEURAL  87 bytes      │  │
│  │  Total peers: 4                │  │
│  └────────────────────────────────┘  │
│                                      │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  📡  BROADCAST AGAIN           │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🏠  BACK TO HOME              │  │  ← Outlined TacticalGreenDim button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S20 — Channel Monitor
**Route:** `AppNavDestination.CHANNELS`
**File:** `ReceiverScreens.kt :: ChannelMonitorScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  📡 CHANNEL MONITOR                  │  ← 18sp Bold
│ ────────────────────────────────── │
│                                      │
│  ┌─── RADAR VIEW ──────────────────┐ │  ← RadarView full width 220dp height
│  │                                  │ │  ← RadarNavy background
│  │  ·Rescue_01 (1.2m)             │ │  ← 6dp green dot + 11sp label
│  │      ·Team_Alpha (3.5m)        │ │  ← Sweep line rotates every 3s
│  │          ·Unit_77 (5.1m)       │ │
│  │  ·Field_Comm (7.3m)            │ │
│  │                                  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ACTIVE ON CH 3/10:                  │  ← 13sp TacticalGreen SemiBold
│  ┌────────────────────────────────┐  │
│  │  R01-A7  •  Rescue_01   ████  │  │  ← Device rows, signal bars right
│  │  TA-09   •  Team_Alpha  ███░  │  │  ← 48dp row height each
│  │  U77-B2  •  Unit_77    ██░░  │  │
│  │  FC-12   •  Field_Comm  █░░░  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  📻  SWITCH CHANNEL            │  │  ← Outlined TacticalGreen button
│  └────────────────────────────────┘  │
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
└──────────────────────────────────────┘
```

---

### S21 — Channel Management
**Route:** `AppNavDestination.CHANNEL_MANAGEMENT`
**File:** `AllRemainingScreens.kt :: ChannelManagementScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Channel Management                 │
│ ────────────────────────────────── │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  CH 1/10  Rescue Operations    │  │  ← Each channel row
│  │  3 active  •  Signal: ████    │  │  ← Sub info
│  │                      [JOIN →]  │  │  ← TacticalGreen small button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  CH 2/10  Medical Team         │  │
│  │  2 active  •  Signal: ███░    │  │
│  │                      [JOIN →]  │  │
│  └────────────────────────────────┘  │
│  ┌── ACTIVE ──────────────────────┐  │  ← TacticalGreenDim bg = active channel
│  │  CH 3/10  Logistics  ✓ (NOW)  │  │  ← TacticalGreenBright text
│  │  4 active  •  Signal: ████    │  │
│  │                  [CURRENT]     │  │  ← TacticalGreen dim badge
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  CH 4/10  Command Center       │  │
│  │  1 active  •  Signal: ██░░    │  │
│  │                      [JOIN →]  │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  CH 5/10  Field Support        │  │
│  │  0 active  •  Signal: █░░░    │  │
│  │                      [JOIN →]  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S22 — Message History
**Route:** `AppNavDestination.HISTORY`
**File:** `SettingsAndHistoryScreens.kt :: MessageHistoryScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  📋 MESSAGE HISTORY                  │  ← 18sp Bold
│ ────────────────────────────────── │
│                                      │
│  [ALL] [RECEIVED] [SENT] [ALERTS]   │  ← Filter tabs
│  ─────────────────────────────────   │  ← Active tab: TacticalGreen underline
│                                      │
│  ┌────────────────────────────────┐  │
│  │  📥 Rescue_01           10:15 │  │  ← Received: left icon
│  │  "पानी का स्तर बढ़ रहा है..." │  │  ← Text preview 14sp TextPrimary
│  │  🔺 HIGH  •  CH 3  •  Hindi   │  │  ← Badges row
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  📤 YOU                 10:16 │  │  ← Sent: right icon indicator
│  │  "Message received"           │  │
│  │  ✅ NORMAL  •  CH 3  •  EN   │  │
│  └────────────────────────────────┘  │
│  ┌── SOS BORDER ──────────────────┐  │  ← AlertRed left border 3dp
│  │  🚨 SOS ALERT           10:10 │  │
│  │  "Immediate evacuation..."     │  │
│  │  🔴 SOS  •  CH 3  •  Hindi    │  │
│  └────────────────────────────────┘  │
│                                      │
│  [🗑  CLEAR HISTORY]                │  ← TextSecondary small button
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
└──────────────────────────────────────┘
```

#### Filter Tabs
| Tab | Shows |
|---|---|
| ALL | All messages, newest first |
| RECEIVED | `isSentByMe == false` |
| SENT | `isSentByMe == true` |
| ALERTS | `isAlert == true` |

---

### S23 — Receiver Settings
**Route:** `AppNavDestination.SETTINGS`
**File:** `SettingsAndHistoryScreens.kt :: ReceiverSettingsScreen`

#### Layout
```
┌──────────────────────────────────────┐
│  ⚙  SETTINGS                         │  ← 18sp Bold
│ ────────────────────────────────── │
│                                      │
│  ┌─── AUDIO SETTINGS ──────────────┐ │
│  │  Auto Play Messages    [●──ON]  │ │  ← Switch: TacticalGreen when ON
│  │  Text-to-Speech        [●──ON]  │ │
│  │  Volume                          │ │
│  │   🔈  ──────────●─────  🔊     │ │  ← Slider, TacticalGreen thumb/track
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── LANGUAGE SETTINGS ───────────┐ │
│  │  Auto Translate        [●──ON]  │ │
│  │  My Language:                    │ │
│  │  Hindi (हिंदी)  [CHANGE →]      │ │  ← Links to LANGUAGE_SELECT
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── NETWORK SETTINGS ────────────┐ │
│  │  Wi-Fi Direct          [●──ON]  │ │
│  │  BLE Advertising       [●──ON]  │ │
│  │  Channel: CH 3/10 [CHANGE →]   │ │  ← Links to CHANNEL_MANAGEMENT
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── INFO & HELP ─────────────────┐ │
│  │  ❓ Help & Guide            ▶  │ │  ← Links to HELP_GUIDE
│  │  ℹ  About iTantra           ▶  │ │  ← Links to ABOUT_PAGE
│  └─────────────────────────────────┘ │
│                                      │
│  App version: 1.0.0  •  ONNX 1.19.0 │  ← 11sp TextMuted
│ ──────────────────────────────────── │
│  🏠 Home  📋 History  📡 Chan  ⚙ Set │
└──────────────────────────────────────┘
```

---

### S24 — Language Selection
**Route:** `AppNavDestination.LANGUAGE_SELECT`
**File:** `ReceiverScreens.kt :: LanguageSelectionScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Select Language                    │
│ ────────────────────────────────── │
│                                      │
│  🌐 Choose your preferred language   │  ← 14sp TextSecondary
│     for STT recognition & TTS output │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🇮🇳  English (English)    ✓   │  │  ← Selected: TacticalGreenDim bg
│  ├────────────────────────────────┤  │  ← checkmark TacticalGreen right
│  │  हि   Hindi (हिंदी)            │  │
│  ├────────────────────────────────┤  │  ← Unselected: DarkSurface
│  │  తె   Telugu (తెలుగు)          │  │
│  ├────────────────────────────────┤  │
│  │  த    Tamil (தமிழ்)             │  │
│  ├────────────────────────────────┤  │
│  │  বা   Bengali (বাংলা)           │  │
│  ├────────────────────────────────┤  │
│  │  ગ    Gujarati (ગુજરાતી)         │  │
│  ├────────────────────────────────┤  │
│  │  म    Marathi (मराठी)           │  │
│  ├────────────────────────────────┤  │
│  │  മ    Malayalam (മലയാളം)         │  │
│  ├────────────────────────────────┤  │
│  │  ଓ    Odia (ଓଡ଼ିଆ)              │  │
│  ├────────────────────────────────┤  │
│  │  ಕ    Kannada (ಕನ್ನಡ)          │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   ✅  CONFIRM SELECTION        │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S25 — Manage Auto Alerts
**Route:** `AppNavDestination.MANAGE_AUTO_ALERTS`
**File:** `AllRemainingScreens.kt :: ManageAutoAlertsScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Manage Auto Alerts                 │
│ ────────────────────────────────── │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🌊  Flood Warning     [●──ON] │  │  ← Toggle ON: TacticalGreen
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🚶  Evacuation Alert  [●──ON] │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🏥  Medical Emergency [●──ON] │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🔥  Fire Alert       [──OFF]  │  │  ← Toggle OFF: TextMuted
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  🌍  Earthquake Warning[●──ON] │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  ⚠   General Warning  [●──ON]  │  │
│  └────────────────────────────────┘  │
│                                      │
│  Custom Alerts:                      │  ← 13sp TacticalGreen section header
│  ┌────────────────────────────────┐  │
│  │  ⚡  Flash Flood Zone B [●──ON]│  │
│  │  [✏ Edit]      [🗑 Delete]     │  │  ← Edit/delete row below each custom
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ➕  ADD CUSTOM ALERT          │  │  ← Outlined TacticalGreen button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S26 — Add Custom Alert
**Route:** `AppNavDestination.ADD_CUSTOM_ALERT`
**File:** `AllRemainingScreens.kt :: AddCustomAlertScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Add Custom Alert                   │
│ ────────────────────────────────── │
│                                      │
│  Alert Title:                        │  ← 13sp TacticalGreen label
│  ┌────────────────────────────────┐  │
│  │  "Flash Flood Zone B"          │  │  ← TextField DarkSurface
│  └────────────────────────────────┘  │  ← Focused: TacticalGreen border 2dp
│                                      │
│  Alert Message Body:                 │
│  ┌────────────────────────────────┐  │
│  │  "Zone B sector is at flood    │  │  ← Multiline TextField 120dp min
│  │   risk level 3. Evacuate via   │  │
│  │   Route Alpha immediately."    │  │
│  │                      72 / 200  │  │  ← Counter bottom-right TextMuted
│  └────────────────────────────────┘  │
│                                      │
│  Category Icon:                      │
│  ┌──┬──┬──┬──┬──┬──┐               │
│  │🌊│🚶│🏥│🔥│🌍│⚠ │               │  ← Icon picker row, 48dp each
│  └──┴──┴──┴──┴──┴──┘               │  ← Selected: TacticalGreenDim bg + border
│                                      │
│  Default Priority:                   │
│  ┌──────────────────────────────┐   │
│  │ [NORMAL]  [HIGH ✓]  [🚨 SOS]│   │  ← Segmented buttons
│  └──────────────────────────────┘   │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   💾  SAVE ALERT               │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │  ← Disabled until title + body filled
└──────────────────────────────────────┘
```

---

### S27 — Quick Alerts Grid
**Route:** `AppNavDestination.QUICK_ALERTS_GRID`
**File:** `AllRemainingScreens.kt :: QuickAlertsGridScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Quick Alerts                       │
│ ────────────────────────────────── │
│                                      │
│  Tap any alert to broadcast now:     │  ← 13sp TextSecondary
│                                      │
│  ┌──────────────────┬──────────────┐ │
│  │   🌊             │  🚶          │ │  ← 2-column grid
│  │   Flood          │  Evacuation  │ │  ← Each cell: 100dp height
│  │   Warning        │  Alert       │ │  ← DarkSurface bg
│  │   🔺 HIGH        │  🔺 HIGH     │ │  ← Priority badge bottom
│  ├──────────────────┼──────────────┤ │
│  │   🏥             │  🔥          │ │
│  │   Medical        │  Fire        │ │
│  │   Emergency      │  Alert       │ │
│  │   🔺 HIGH        │  🔺 HIGH     │ │
│  ├──────────────────┼──────────────┤ │
│  │   🌍             │  ⚠           │ │
│  │   Earthquake     │  General     │ │
│  │   Warning        │  Warning     │ │
│  │   🔺 HIGH        │  ✅ NORMAL   │ │
│  └──────────────────┴──────────────┘ │
│                                      │
│  Tap & Hold for SOS override         │  ← 11sp TextMuted
│                                      │
│  [⚙ Customize Grid]                 │  ← TextSecondary text link
└──────────────────────────────────────┘
```

---

### S28 — Speech Text Review
**Route:** `AppNavDestination.SPEECH_TEXT`
**File:** `BasicFlowScreens.kt :: SpeechTextReviewScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Speech Review                      │
│ ────────────────────────────────── │
│                                      │
│  ┌─── STT TRANSCRIPT ──────────────┐ │  ← LcdGreenBg card
│  │  STT Output:                    │ │  ← 12sp TextSecondary label
│  │                                  │ │
│  │  "बाढ़ क्षेत्र में पानी का     │ │  ← TacticalGreenBright 18sp
│  │   स्तर तेजी से बढ़ रहा है।    │ │  ← lineHeight 26sp
│  │   पुल के पास ना जाएं।"         │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── TRANSLATION PREVIEW ─────────┐ │  ← DarkSurface card
│  │  文A English:                    │ │  ← SignalBlue icon + label
│  │  "Water level in the flood      │ │  ← TextPrimary 15sp
│  │   zone is rising rapidly.       │ │
│  │   Do not approach the bridge."  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  STT Confidence:  ██████████░  92%  │  ← Green progress bar + percentage
│  Model: IndicConformer INT8          │  ← 11sp TextMuted
│                                      │
│  ┌──────────────┐  ┌──────────────┐  │
│  │  🔄 RE-RECORD│  │  ✏ EDIT TEXT │  │  ← Outlined buttons
│  └──────────────┘  └──────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │   📤  BROADCAST NOW            │  │  ← TacticalGreen button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S29 — TTS Audio Ready
**Route:** `AppNavDestination.TTS_AUDIO`
**File:** `BasicFlowScreens.kt :: TtsAudioReadyScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← TTS Audio Preview                  │
│ ────────────────────────────────── │
│                                      │
│  ┌─── AUDIO PLAYER ────────────────┐ │  ← DarkSurface card
│  │  🔊 Playing in: Hindi (hi)      │ │
│  │                                  │ │
│  │  ████ ██ ████ ██ ████ ██ ████  │ │  ← 12 waveform bars, TacticalGreen
│  │                                  │ │
│  │  0:01 ─────────●──────── 0:03  │ │  ← Mini seekbar
│  └─────────────────────────────────┘ │
│                                      │
│  Message Text:                       │  ← 13sp TacticalGreen label
│  ┌────────────────────────────────┐  │
│  │  "पानी का स्तर बढ़ रहा है।   │  │  ← LcdGreenText 14sp scrollable
│  │   पुल के पास मत जाओ।"         │  │
│  └────────────────────────────────┘  │
│                                      │
│  TTS Model: MMS VITS ONNX  16kHz    │  ← 11sp TextMuted
│                                      │
│  ┌────────────────────────────────┐  │
│  │  ▶  PLAY PREVIEW               │  │  ← Outlined TacticalGreen button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  📤  SEND WITH AUDIO           │  │  ← TacticalGreen filled button
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  📝  SEND TEXT ONLY            │  │  ← Outlined TextSecondary button
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

### S30 — Help & Guide
**Route:** `AppNavDestination.HELP_GUIDE`
**File:** `AllRemainingScreens.kt :: HelpAndGuideScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← Help & Guide                       │
│ ────────────────────────────────── │
│                                      │
│  ┌─── 📥 RECEIVER MODE ────────────┐ │  ← Expandable section, DarkSurface
│  │  • Press HOLD TO SPEAK button   │ │
│  │    to record your reply         │ │
│  │  • Tap 文A to see translation   │ │
│  │    in your preferred language   │ │
│  │  • Auto-play activates in 3s    │ │
│  │  • Tap ↩ for quick responses   │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── 📤 BROADCAST MODE ───────────┐ │
│  │  • Hold the PTT button to       │ │
│  │    record voice message         │ │
│  │  • Release to trigger STT and   │ │
│  │    auto-broadcast               │ │
│  │  • Use Auto Alerts for preset   │ │
│  │    emergency messages           │ │
│  │  • Custom Message for freeform  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── 🚨 SOS EMERGENCY ────────────┐ │
│  │  • Tap & HOLD red SOS button    │ │
│  │    for 500ms to activate        │ │
│  │  • Overrides mute/DND on ALL    │ │
│  │    nearby devices               │ │
│  │  • Audio routed to STREAM_ALARM │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── 🌐 LANGUAGES ────────────────┐ │
│  │  • 10 Indian languages supported│ │
│  │  • All processing done offline  │ │
│  │  • Switch via Settings menu     │ │
│  └─────────────────────────────────┘ │
│                                      │
│  [ℹ About iTantra →]               │  ← Text link → ABOUT_PAGE
└──────────────────────────────────────┘
```

---

### S31 — About iTantra
**Route:** `AppNavDestination.ABOUT_PAGE`
**File:** `AllRemainingScreens.kt :: AboutPageScreen`

#### Layout
```
┌──────────────────────────────────────┐
│ ← About iTantra                      │
│ ────────────────────────────────── │
│                                      │
│           ┌──────────┐               │  ← 80dp circle TacticalGreen
│           │    📡    │               │  ← CellTower icon TacticalBlack
│           └──────────┘               │
│                                      │
│          I T A N T R A               │  ← 28sp Bold Monospace TacticalGreenBright
│   Neural Walkie-Talkie  v1.0.0       │  ← 13sp TextSecondary
│                                      │
│  ─────────────────────────────────   │
│                                      │
│  ┌─── PROJECT INFO ────────────────┐ │  ← DarkSurface card
│  │  ISRO Problem Statement 26173   │ │
│  │                                  │ │
│  │  Built for offline, low-bitrate │ │
│  │  field communications across    │ │
│  │  10 Indian languages for alert  │ │
│  │  and distress scenarios.        │ │
│  └─────────────────────────────────┘ │
│                                      │
│  ┌─── TECH STACK ──────────────────┐ │  ← DarkSurface card
│  │  STT: IndicConformer INT8 ONNX  │ │
│  │  TTS: MMS VITS ONNX (16kHz)    │ │
│  │  VAD: Silero VAD ONNX          │ │
│  │  Net: Wi-Fi Direct P2P + BLE   │ │
│  │  Packet: NeuralPacket ~87B     │ │
│  │  Runtime: ONNX Runtime 1.19.0  │ │
│  │  UI: Jetpack Compose (Kotlin)  │ │
│  └─────────────────────────────────┘ │
│                                      │
│  Build: Debug  •  ONNX 1.19.0       │  ← 11sp TextMuted
│  Offline-first  •  No cloud needed  │
└──────────────────────────────────────┘
```

---

## 6. Interaction & Animation Spec

### Global Animations

| Animation | Component | Spec |
|---|---|---|
| PTT Pulse | `PushToTalkButton` | Scale 1.0→1.08, 800ms, `infiniteTransition` |
| Radar Sweep | `RadarView` | Full 360° rotation, 3000ms, linear |
| Device Dot Blink | `RadarView` dots | Alpha 1.0→0.3→1.0, 1200ms each, offset |
| Alert Ring Pulse | `IncomingAlertScreen` | Scale 1.0→1.4, alpha 1.0→0.0, 3 rings 300ms stagger |
| Waveform Bars | Player/Recording | Heights animated via `animateFloatAsState`, 150ms each |
| SOS Glow | `EmergencyShortcutScreen` | Scale 1.0→1.2 + alpha 0.0→0.5, 600ms alternating |
| Screen Transitions | `AnimatedContent` | `fadeIn + slideInVertically`, 300ms |
| Progress Bar | `SplashScreen` | Indeterminate, TacticalGreen |
| Countdown | Auto-play timer | Text changes every 1000ms via `LaunchedEffect` |

### Touch Interactions

| Gesture | Component | Result |
|---|---|---|
| `pointerInput` hold 500ms | SOS Button | Triggers `triggerEmergencyAlarm()` |
| `pointerInput` down | PTT Button | `startRecording()` |
| `pointerInput` up | PTT Button | `stopRecording()` → STT → send |
| Tap | Quick Response row | Auto-sends preset, → REPLY_SENT |
| Tap | Quick Alert Grid cell | → ACTIVE_BROADCASTING with alert |
| Swipe down | Incoming Alert | Dismiss (if not SOS) |
| Long press | History message row | Context menu: Delete / Replay |

---

## 7. Data Bindings Reference

### `WalkieMessage` Properties Used Per Screen

| Property | Type | Used In |
|---|---|---|
| `sender` | String | S06, S07, S08, S22 |
| `deviceId` | String | S06, S07, S22 |
| `distance` | String | S06, S07 |
| `channel` | String | S07, S08, S11, S22 |
| `tag` | String | S07, S22 |
| `originalText` | String | S07, S08, S28 |
| `originalLanguage` | String | S07, S08, S09 |
| `translatedText` | String? | S08 (fallback placeholder) |
| `priority` | MessagePriority | S06, S07, S08, S22 |
| `timestamp` | String | S07, S08, S11, S19, S22 |
| `isSentByMe` | Boolean | S22 filter |
| `audioDurationSec` | Float | S07, S09 |
| `isAlert` | Boolean | S22 filter |
| `signalBars` | Int | S07, S20 |

### `NeuralPacket` Properties

| Property | Type | Description |
|---|---|---|
| `priority` | MessagePriority | NORMAL / HIGH / SOS |
| `languageCode` | String | 2-char ISO: "hi", "en", "te"… |
| `channelId` | Int | 1–10 |
| `textPayload` | String | STT transcript / preset text |
| `senderId` | String | 8-char device ID |
| `codec` | TextCodec | RAW / DEFLATE / TACTICAL |

### `NearbyDevice` Properties

| Property | Used In |
|---|---|
| `id` | S20 device list |
| `name` | S20, S21 display name |
| `distanceMeters` | S20 radar dot position |
| `signalBars` | S20, S21 signal display |

### `SupportedLanguages` List (10 entries)

| Code | Name | Native | TTS Folder | STT Folder |
|---|---|---|---|---|
| `en` | English | English | `english` | `English` |
| `hi` | Hindi | हिंदी | `hindi` | `Hindi` |
| `te` | Telugu | తెలుగు | `telugu` | `Telugu` |
| `ta` | Tamil | தமிழ் | `tamil` | `Tamil` |
| `bn` | Bengali | বাংলা | `Bengali` | `Bengali` |
| `gu` | Gujarati | ગુજરાતી | `gujarathi` | `Gujarati` |
| `mr` | Marathi | मराठी | `Marathi` | `Marathi` |
| `ml` | Malayalam | മലയാളം | `Malayalam` | `Malayalam` |
| `or` | Odia | ଓଡ଼ିଆ | `Odia` | `Odia` |
| `kn` | Kannada | ಕನ್ನಡ | `kannada` | `Kannada` |

---

## Component Symbol Legend

| Symbol | Meaning |
|---|---|
| `╔══╗ / ╚══╝` | Circular button (PTT / SOS) |
| `◎◎◎` | Pulsing concentric rings animation |
| `████` | Waveform bars / progress fills |
| `●──` | Toggle switch ON |
| `──` | Toggle switch OFF |
| `▾` | Dropdown / Exposed menu |
| `▶ / ▐▐ / ◄◄ / ►►` | Media playback controls |
| `文A` | Translation icon (CJK unified) |
| `[✓]` | Permission granted |
| `[✗]` | Permission denied |
| `▶ (right arrow)` | ChevronRight navigation icon |
| `·` | Radar device dot (6dp circle) |
| `─────────●─────` | Slider with thumb |
| `[●──ON]` | Compose Switch, TacticalGreen |
| `[──OFF]` | Compose Switch, TextMuted |

---

*End of iTantra Wireframe Specification — ISRO PS 26173*
*All 31 screens documented with ASCII wireframes, color tokens, component specs, interaction states, navigation flows, and data bindings.*
