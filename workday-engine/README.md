# Workday engine (for the OptimHire build)

Your Workday autopilot engine, wired into the patched OptimHire extension. It is
bundled into one content script: `<deployment folder>/assets/wd-engine.js`.

## What it does in a run

OptimHire hands every job to a filler with `FILL_COMPLEX_FORM`. For a Workday tab,
`static/background/oh-bg.js` hands it to this engine instead (`oh:wd:start`). The
adapter (`src/oh/entry.ts`) then:

1. runs OptimHire's own job-closed check (`CHECK_APPLICATION_STATUS`);
2. uses your own CV — the one on your OptimHire profile (Workday never gets a
   tailored copy; OptimHire's "Optimize My Resume" step is not shown here);
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

Other job sites upload your own CV too, unless "Tailor CV to each job" is on
(`ohTailorCv`, Queue Manager / the panel's card): then OptimHire's own runs use its
"Optimize My Resume" step, and CSV-queue jobs a copy of your CV with your skills and
each role's bullets ordered by the job description's keywords (`tailor.ts` keyword
mode — nothing reworded or added), rendered by `render.ts` / `pdf.ts` and built in
`assets/wd-cvtext.js` (`window.__ohCv.tailor`, `src/cv/tailorcv.ts`). Workday keeps
your own CV either way.

"Autofill this page" on a Workday page runs the engine too and stops on Review (or
asks you for what it can't answer). `ohWdEngineOff: true` (the switch in Queue
Manager → Workday sign-in) gives Workday back to OptimHire's own filler.

## Files

- `src/workday/` — the engine, copied from `claude-extension-standalone/src/workday/`
  (only what the content script uses). Additions for unattended runs are marked
  `[oh]` — `ohHooks.ts` plus a few lines in `engine.ts`, `answers.ts` and `steps.ts` —
  so a newer copy of the engine can be dropped in and the `[oh]` lines re-applied.
- `src/oh/entry.ts` — the OptimHire adapter (content script entry).
- `src/cv/` — reading your CV (pdf.js / docx → roles, education, skills) and the
  per-job copy of it; built into `assets/wd-cvtext.js`, put into a tab only when needed.

## Build

    npm install
    npm run build      # → ../<deployment folder>/assets/wd-engine.js
