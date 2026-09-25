# Pioneer TV

A TV box for a Raspberry Pi: streaming services and games as web pages in a full-screen browser,
controlled with a Bluetooth gamepad. It was built for a 32" TV, where it runs Cineasterna, SVT Play,
Jellyfin and RomM and uses HDMI-CEC to turn the TV on and off and to set the volume.

## Part of the pioneer series

This is a pioneer project from Maskinrepubliken. Pioneer projects are small programs that run on a Raspberry Pi, each built for one specific place and purpose. They are open source, so you can read, change and run the code yourself. The code is kept small and plainly structured, which makes it easy to adapt, with or without AI tools. Treat it as a starting point for your own setup, not a finished product.

## What it does

Chromium plays the video. Pioneer TV is everything around it:

- `extension/` a Chromium extension with the home screen, gamepad navigation on any site, an on-screen
  keyboard and a quick menu
- `daemon/` a Python service that turns the gamepad into key presses, controls the TV over HDMI-CEC and
  serves a settings page
- `system/` the kiosk setup: Weston, Chromium, systemd units and the install script

## Hardware

A Raspberry Pi 4 with 4 GB, a TV with HDMI-CEC and a Bluetooth gamepad. Use wired Ethernet or 5 GHz
Wi-Fi for streaming.

## Getting started

On Raspberry Pi OS Lite (64-bit, Bookworm or Trixie) with the user `pi`:

```
git clone -b main https://github.com/maskinrepubliken/pioneer-tv.git
cd pioneer-tv
sudo system/install.sh
sudo reboot
```

Pair a gamepad:

```
bluetoothctl
  scan on
  pair <MAC>
  trust <MAC>
  connect <MAC>
```

Log in to the streaming services once with the on-screen keyboard. More gamepads, Wi-Fi and the list of
services are managed from the settings page (Start → Inställningar).

To work on the home screen without a Pi, run `python3 dev/preview.py` and open http://localhost:5178/.

The [guide](GUIDE.md) covers the button map, settings, updates, troubleshooting and how it all fits
together.

## License

MIT, see [LICENSE](LICENSE). Copyright (c) 2026 Viktor Lyresten / Maskinrepubliken.
