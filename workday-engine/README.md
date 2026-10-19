# Workday engine (for the OptimHire build)

Your Workday autopilot engine, wired into the patched OptimHire extension. It is
bundled into one content script: `<deployment folder>/assets/wd-engine.js`.

## What it does in a run

OptimHire hands every job to a filler with `FILL_COMPLEX_FORM`. For a Workday tab,
`static/background/oh-bg.js` hands it to this engine instead (`oh:wd:start`). The
adapter (`src/oh/entry.ts`) then:

1. runs OptimHire's own job-closed check (`CHECK_APPLICATION_STATUS`);
2. shows OptimHire's "Optimize My Resume" screen, as on every other site, and uses
   the tailored CV it produces (`updatedResume`), else the CV on your OptimHire profile;
3. builds the engine's profile from OptimHire's details for you (name, e-mail,
   phone, address, LinkedIn, salary…), plus the full profile you can import in the
   Queue Manager (work history, education, skills);
4. lets the engine apply: sign in or create the account (one shared password,
   Queue Manager → Workday sign-in), upload the CV, fill every step, answer
   questions — your Q&A memory first, then OptimHire's answer service (one request
   per page), then the profile rules — and press Submit;
5. reports back as `COMPLEX_FORM_SUCCESS` / `COMPLEX_FORM_ERROR`, so OptimHire's
   counts, auto-skip and next job work as before. Each run is kept in
   `ohWdEngineLog` (it shows up in your diagnostics).

"Autofill this page" on a Workday page runs the engine too and stops on Review (or
asks you for what it can't answer). `ohWdEngineOff: true` (the switch in Queue
Manager → Workday sign-in) gives Workday back to OptimHire's own filler.

## Files

- `src/workday/` — the engine, copied from `claude-extension-standalone/src/workday/`
  (only what the content script uses). Additions for unattended runs are marked
  `[oh]` — `ohHooks.ts` plus a few lines in `engine.ts`, `answers.ts` and `steps.ts` —
  so a newer copy of the engine can be dropped in and the `[oh]` lines re-applied.
- `src/oh/entry.ts` — the OptimHire adapter (content script entry).

## Build

    npm install
    npm run build      # → ../<deployment folder>/assets/wd-engine.js
