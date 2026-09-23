# PlayersSocial

Source for [playerssocial.vercel.app](https://playerssocial.vercel.app/), the Players Club site.

## Current baseline

`index.html` is a byte-for-byte copy of the production page retrieved on 23 September 2026. The original authoring files were not present in this local checkout or the GitHub repository. This snapshot preserves the working site while the original source is located.

The page is a static, self-contained HTML file with inline CSS and JavaScript. It calls Supabase directly from the browser using a publishable key; database permissions and admin authorization must be enforced in Supabase. No private Supabase credentials belong in this repository.

## Local preview

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000>. The browser needs network access for Google Fonts, Maps, WhatsApp links, and Supabase features.

## Deployment

The existing Vercel project is `playerssocial` in the `irises-projects-ce549f63` team. It is configured as a static site (`Other` framework, repository root as output). The live deployment predates this repository baseline. Connect the GitHub repository to the Vercel project before expecting Git pushes to deploy automatically.

If the original editable source is found, replace this production snapshot with that source and document its build and deployment steps.
