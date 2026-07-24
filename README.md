# Spicetify Swipe-to-Queue (`SwipeQueue.js`)

A lightweight Spicetify extension that adds trackpad swipe-to-queue functionality (Swipe Right) to track rows in the Spotify Windows Desktop client, featuring a native-feeling slide animation and dynamic gradient preservation.

## ⚡️ Features
- **Trackpad Native**: Uses `wheel` delta events for smooth gesture control.
- **Direction**: Swipe Right to reveal the green "Queue" action from the left.
- **Lightweight**: Zero blur/filter effects—paint-only `transform` animations for low GPU/thermal footprint.
- **Dynamic Theme Friendly**: Off-screen layer architecture that preserves Spotify's native album color gradients and hover highlights.

## 📸 Screenshot

<video src="Swipe-Queue/Example_sq.mp4" width="320" height="240" controls></video>

## 🛠️ Installation

### Method 1: Manual Copy (PowerShell)

1. Download or copy `SwipeQueue.js`.
2. Open PowerShell and run the following commands:

```powershell
# Copy extension to Spicetify extensions folder
Invoke-WebRequest -Uri "[https://raw.githubusercontent.com/Advit-tech/spicetify-swipe-queue/main/SwipeQueue.js](https://raw.githubusercontent.com/Advit-tech/spicetify-swipe-queue/main/SwipeQueue.js)" -OutFile "$env:APPDATA\spicetify\Extensions\SwipeQueue.js"

# Enable extension
spicetify config extensions SwipeQueue.js
spicetify apply
```


---

## 🗑️ Uninstallation

To remove the extension:

```powershell
spicetify config extensions SwipeQueue.js-
spicetify apply
Remove-Item "$env:APPDATA\spicetify\Extensions\SwipeQueue.js"
```
