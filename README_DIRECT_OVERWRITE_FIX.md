# Direct overwrite full source fix

Extract this ZIP directly into your project root, for example `C:\auit_scanner`, using `-Force`.
Do not extract into a new subfolder.

This full source includes:
- Simple scan page workflow
- Profile/login/workspace workflow
- Fixed Windows render build script (`spawn npm ENOENT`)
- Fixed login strict optional property type error
- Real-only scan behavior: missing tools show Not Assessed / Tool Not Installed

After extraction run:

```powershell
cd C:\auit_scanner
powershell -ExecutionPolicy Bypass -File .\VERIFY_DIRECT_OVERWRITE_FIX.ps1
npm install --include=dev
npm run build:render:all
npm run build:web:vercel
```
