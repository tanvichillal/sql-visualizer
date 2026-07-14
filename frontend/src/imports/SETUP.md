# QueryFlow Frontend — Setup

## First time

```
cd frontend
npm install
npm run dev
```

## If you see `Cannot find module '../lightningcss.win32-x64-msvc.node'` (or any platform binary error)

This means npm skipped the native binary for your OS. Fix:

```
rmdir /s /q node_modules
del package-lock.json
npm install --include=optional
npm run dev
```

(On macOS/Linux use `rm -rf node_modules package-lock.json` instead.)

## Requirements
- Node.js 18+ (tested on 20 and 24)
- Windows / macOS / Linux all supported
