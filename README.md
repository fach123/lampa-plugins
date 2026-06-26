# LMX Clean

Standalone LAMPA plugin that blocks CUB preroll and banner ad loaders and
globally forces `Account.hasPremium()` to return `true`.

## Files

- `lmx-clean.js` - plugin file to publish and add in LAMPA.

## Install

Host `lmx-clean.js` on a URL that is not in LAMPA's plugin blacklist. Prefer a
direct HTTPS URL such as GitHub Pages, Cloudflare Pages, or your own server.

For quick LAN testing:

```powershell
python -m http.server 8000
```

Then add this plugin URL in LAMPA:

```text
http://YOUR_PC_IP:8000/lmx-clean.js
```

If the TV blocks mixed HTTP content, publish the same file through HTTPS.

## Tizen TV Debug

1. Enable Developer Mode on the TV: open Apps, enter `12345`, turn Developer
   mode on, set your PC IP, then reboot the TV.
2. In Tizen Studio open `Tools > Device Manager`, add the TV IP in Remote
   Device Manager, and switch connection on.
3. Run a web app with `Debug As > Tizen Web Application`; Tizen Studio opens
   Web Inspector automatically.
4. `console.log`, `console.warn`, and `console.error` are visible in debug mode.
