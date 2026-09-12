# Static assets

Anything here is served from the site root: `public/logo.svg` → `/logo.svg`.

## Drop your logo in as one of these

The header looks for them in this order and uses the first it finds, so you
only need one:

| File | Used for |
|---|---|
| `logo.svg` | header wordmark — **preferred**, stays sharp at any size |
| `logo.png` | header wordmark, fallback if you have no SVG |
| `mark.svg` | square icon on its own, used when space is tight |

Ship the header logo around 120×32 (or any 4:1-ish ratio). If it has a
transparent background it will sit correctly on both the light paper ground and
the dark theme.

## Favicon

Put a square PNG at `apps/web/src/app/icon.png` — at least 180×180. Next
generates every size and the `<link>` tags from that one file, so there's
nothing to wire up.
