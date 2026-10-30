# Review preview

The preview is one self-contained HTML file generated from rig and published with
Vercel Drop. Keep exports outside the repository; never commit them or attach them
to issues or chat (ADR 0003). The initial upload to the HS Hobby team (`hs-d827`),
project `s01e04-rig-preview`, is approved.

## Export locally

From a checkout with installed dependencies and a configured, untracked `.env`, start
rig in one terminal:

```sh
PORT=8787 pnpm start
```

In another terminal, save the page into a dedicated upload folder outside the repo:

```sh
PREVIEW_DIR="$HOME/rig-preview-upload"
mkdir -p "$PREVIEW_DIR"
curl --fail --silent --show-error http://localhost:8787/digest/2026-10-28 \
  --output "$PREVIEW_DIR/index.html"
```

Inspect the saved file in a browser and confirm the digest and initial lane banner.
The upload folder must contain **only `index.html`**. Never select the repository,
`.env`, service directory, or private logs for upload.

## Initial publication and review

In [Vercel Drop](https://vercel.com/drop), upload the isolated folder (or the single
`index.html` for initial publication), select HS Hobby (`hs-d827`), and create
`s01e04-rig-preview`. Confirm `index.html` serves the root `/`, then deploy. This
publishes directly to production without Git, a CLI, or a GitHub workflow.

Record the project's actual **production domain** from Vercel. Verify that HTTPS URL
opens without the owner's login and renders the digest and initial banner. Give the
reviewer this stable production URL and the plan's actual issue links through the
documented submission route. Keep delivery evidence privately before closing #7.
Also record the initial deployment ID and its unique URL privately for cleanup.

Use the production domain for review: it will point to the replacement deployment.
A unique deployment URL continues to identify an individual version.

## Replace after review

After the reviewer responds and the human approves the second upload, stop the initial
server with Ctrl-C. Restart with `LANE_MARKER` unset and without loading `.env`, which
would otherwise restore the marker:

```sh
env -u LANE_MARKER PORT=8787 pnpm exec tsx src/server.ts
```

This uses the default lane ID; export `LANE_ID` first if your configured lane differs.
Repeat the same `curl` command to overwrite the local `index.html`. Inspect it and
confirm the banner reads **no marker set**.

Open the **existing `s01e04-rig-preview` project dashboard** in the same HS team and
drop the isolated folder containing only the replacement `index.html` onto it.
Do not use `/new` or `/drop` for replacement: those create another project. Verify
the same production URL now renders the marker-free page.

Replacing production does not remove the earlier deployment. Within the approved
cleanup scope, use the project's Deployments list to delete the specific recorded
marker-bearing deployment, retaining the clean deployment and project. Verify its
old unique URL no longer serves the marker, then recheck the stable production URL.
Do not rely on automatic retention for timely removal; deletion also removes that
version's rollback availability.

See Vercel's [Drop instructions](https://vercel.com/docs/drop),
[generated URL documentation](https://vercel.com/docs/deployments/generated-urls), and
[deployment management documentation](https://vercel.com/docs/deployments/managing-deployments).
