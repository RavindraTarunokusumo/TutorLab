# Landing project resume implementation contract

1. **Project lookup** — extend the project repository and snapshot service.
   - Consumes: signed edit token from the HTTP-only cookie.
   - Produces: a minimal authorized project snapshot or `null`.
2. **Landing integration** — resolve the snapshot in the home server component and pass it to the launcher.
   - Consumes: authorized snapshot.
   - Produces: no additional client-side secrets or project enumeration.
3. **Resume card** — render the saved project and stage-specific continue route in the launcher.
   - Consumes: minimal snapshot plus existing stage mapping.
   - Produces: accessible continue action; unchanged creation flow when absent.
4. **Verification** — add targeted unit coverage for authorized, invalid, and absent session behavior.

Risk: a single edit cookie only represents one project. The card deliberately resumes that last authorized project and never attempts an unsafe global project list.
