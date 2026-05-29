# Profile + Scan Workflow Fix

## Fixed
- Replaced separate login/logout navigation with a real `/profile` workspace hub.
- Login/signup now bootstraps workspace automatically:
  - email/password login
  - active user stored in backend database
  - user profile saved in browser
  - organization list loaded
  - default organization created if none exists
  - API token + org ID persisted to localStorage
- Google/GitHub login buttons are shown as real-only provider buttons: they redirect only when OAuth URLs are configured.
- `/scan` no longer throws confusing "Workspace configuration incomplete" as the main workflow. It shows login-required card.
- Scan form draft persists when page switches or refreshes.
- Last scan ID and scan history persist in browser.
- Scan status polling added, so queued/running/completed state is visible even if websocket events do not show.
- Upload/repository/website/contract/advanced modes retained.
- User data, orgs, sessions, source artifacts, scans, findings, and reports continue to be stored in the Supabase Postgres database through the backend.

## Real-only notes
- Google/GitHub OAuth still needs provider callback URLs/envs before it is truly active.
- Live website scan remains safe passive HTTP/TLS/header scan only.
- Real analyzer output depends on real Slither/Semgrep/Foundry/Aderyn tool availability in worker/runtime.
