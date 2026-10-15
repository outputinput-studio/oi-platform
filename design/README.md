# Design references

Carl's Claude Design prototypes, exported as single HTML files. They are the
source of truth for how the surfaces look; the code follows them.

- `admin.html` — the client admin. Open it in a browser; `?device=laptop` for the
  laptop layout, no query for the phone. Sign in → Verify to get past the
  prototype's sign-in. Every screen (Content, page editor, Media library,
  Settings, Your account, the More sheet) is reachable from the nav.
- `operations.html` — the ops surface (later stage).
- `storefront-accounts.html` — customer accounts on the storefront (later stage).
- `brand-foundation.html` — the brand: colours, type, spacing.

Tokens live in `src/app/globals.css` and mirror the `:root` block in `admin.html`.
