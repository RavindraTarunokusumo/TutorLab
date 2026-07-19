# Landing project resume implementation contract

1. **Project lookup** — extend the project repository and snapshot service.
   - Consumes: signed edit tokens from HTTP-only project cookies, with the shared legacy cookie as a fallback.
   - Produces: minimal authorized project snapshots.
2. **Landing integration** — resolve the snapshot in the home server component and pass it to the launcher.
   - Consumes: authorized snapshot.
   - Produces: no additional client-side secrets or project enumeration.
3. **Resume cards** — render each saved project and its stage-specific continue route in the launcher.
   - Consumes: minimal snapshots plus existing stage mapping.
   - Produces: accessible continue actions; unchanged creation flow when absent.
4. **Verification** — add targeted unit coverage for authorized, invalid, and absent session behavior.

Risk: session cookies are deliberately browser-local. The implementation preserves a separate signed token for each project and never attempts an unsafe global project list.
