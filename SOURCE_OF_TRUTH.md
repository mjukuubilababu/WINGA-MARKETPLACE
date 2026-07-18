# Winga Source Of Truth

The production source of truth for this workspace is:

```text
C:\Users\user\Desktop\Winga-App\.recovered-master
```

Use this folder for:

- `git status`, `git pull`, `git push`, and commits
- `npm run build:vercel`
- `npm run verify:production`
- `npm run verify:frontend-worker-routing`
- `npx wrangler deploy`

The parent folder `C:\Users\user\Desktop\Winga-App` contains an older recovered
snapshot and a broken partial `.git` directory. Do not deploy or commit from the
parent folder unless it is intentionally rebuilt from `.recovered-master`.

Run this check before production work:

```bash
npm run verify:source
```
