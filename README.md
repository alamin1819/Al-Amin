# Md. Al-Amin Portfolio

Static website: `index.html` (portfolio), `Personal.html` (photos and family) and `si.html` (article on AI → Super Intelligence).

## Structure

| Path | Purpose |
| --- | --- |
| `src/app.css` | Tailwind CSS source: design tokens (slate + amber) and shared components |
| `css/app.css` | Built, minified stylesheet used by the pages (generated, do not edit by hand) |
| `js/site.js` | All page behaviour in plain JavaScript (menu, typing, counters, slider, lightbox…) |
| `images/` | Original photos |
| `images/web/` | Resized WebP copies that the pages actually load |

## Editing styles

The pages use Tailwind CSS utility classes. After changing classes in any HTML file or in `src/app.css`, rebuild the stylesheet:

```sh
npm install        # first time only
npm run build      # writes css/app.css
npm run watch      # rebuilds automatically while you edit
```

No build step is needed to view the site: open `index.html` or upload the folder to any static host.

## Adding photos

Add the original to `images/`, then save a resized WebP copy in `images/web/` (about 800 px wide for thumbnails, 1600 px for large views) and reference that copy in the HTML with `width`/`height` attributes.
