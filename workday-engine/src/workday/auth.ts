/**
 * Sign in / create account. Each Workday tenant has its own account store, so
 * credentials are kept per tenant host in the encrypted vault (service worker).
 *
 * Safety: at most 2 sign-in attempts and 2 create attempts per run, so a wrong
 * password never locks the account; CAPTCHAs and email verification are always
 * handed to the user.
 *
 * [oh] Under OptimHire the host keeps a per-employer record instead: it offers
 * each of your passwords once (at most 3 failed sign-ins per employer a day,
 * across every job there), resets the password from the emailed link when none
 * works or the account is locked (your Gmail, opt-in), and says "stop" for an
 * employer that can't be signed in to, so its next jobs never try again.
 */
import { NeedsHuman, buttonByText, byAid, humanClick, isVisible, qa, sleep, text, waitStable } from "./dom.js";
import { setCheckbox, setText } from "./controls.js";
import { errorMessages } from "./detect.js";
import { pace, type Ctx } from "./context.js";
import { ACCOUNT_EXISTS_RX, AUTH_FAILED_RX, CREATE_ACCOUNT_TEXT_RX, LOCKED_RX, SIGN_IN_TEXT_RX, SIGN_IN_WITH_EMAIL_RX, VERIFY_EMAIL_RX } from "./i18n.js";

interface CredReply {
  cred: { email: string; password: string } | null;
  master: { email: string; password: string } | null;
  blocked?: string; // [oh] don't try to sign in here (why)
  reset?: boolean;  // [oh] reset the password by email first
}

/** [oh] What the host says after a rejected sign-in. */
interface AuthNext {
  retry?: boolean;  // another of your passwords to try
  reset?: boolean;  // reset the password by email
  reason?: string;  // stop: why
}

// [oh] "You may have entered the wrong email address or password or your account might be locked"
// is Workday's wording for a wrong password, not a lock.
function isLocked(errs: string): boolean {
  return LOCKED_RX.test(errs) && !/(might|may|could) be locked|possibly locked/i.test(errs);
}

const FORGOT_RX = /forgot (your )?password|passwort vergessen|mot de passe oubli|olvid\S* (su |tu )?contraseña|esqueceu (a |sua )?senha|password dimenticata|wachtwoord vergeten|nie pamiętasz hasła/i;

async function askHost<T>(msg: Record<string, unknown>): Promise<T | null> {
  try {
    return ((await chrome.runtime.sendMessage(msg)) as T) ?? null;
  } catch {
    return null;
  }
}

/** [oh] The account exists with a password we don't have, or is locked: "Forgot your password?",
 *  then the host opens the emailed link and sets your Workday password with it. null = done. */
async function resetByEmail(ctx: Ctx, email: string): Promise<string | null> {
  const link = byAid("forgotPassword") ?? buttonByText(FORGOT_RX);
  if (!link || !email) return "no \"Forgot your password?\" link here";
  ctx.log("This employer already has an account with another password (or it is locked) — resetting it by email");
  await humanClick(link);
  await waitStable(600);
  const em = byAid("email") ?? qa<HTMLInputElement>('input[type="email"]').find(isVisible) ?? null;
  if (em) {
    await setText(em, email);
    await pace(ctx);
  }
  const btn =
    byAid("forgotPasswordSubmit") ??
    buttonByText(/^(submit|reset( my)? password|send( reset)?( link| email)?|request( reset)?|continue|next)\b/i);
  if (!btn) return "the reset form has no submit button";
  const since = Date.now();
  await humanClick(btn);
  await sleep(400);
  await waitStable(700, 15000);
  const r = await askHost<{ ok?: boolean; reason?: string }>({ type: "wd:auth:mailReset", tenantHost: ctx.run.tenantHost, email, since });
  if (!r?.ok) return r?.reason || "the reset email didn't arrive";
  ctx.log("Password reset from the emailed link — signing in with it");
  const back = byAid("signInLink") ?? buttonByText(/^(back to |return to )?sign in$/i);
  if (back) {
    await humanClick(back);
    await waitStable(600);
  } else {
    location.reload(); // the run carries on after the reload
    await sleep(15000);
  }
  return null;
}

async function getCreds(host: string): Promise<CredReply> {
  return (await chrome.runtime.sendMessage({ type: "wd:cred:get", tenantHost: host })) as CredReply;
}

function captchaPresent(): boolean {
  // [oh] Not [data-automation-id*="captcha"]: "noCaptchaWrapper" is Workday's wrapper around the
  // Create Account / Sign In button itself (seen at Medtronic), so every account page "had a CAPTCHA".
  // A real challenge is a reCAPTCHA / hCaptcha / Turnstile frame.
  return qa(
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare"], iframe[title*="captcha" i], [data-automation-id*="captcha" i] iframe'
  ).some(isVisible);
}

/** [oh] The address already in the form's email box (put there by Workday, the browser or another
 *  filler). A fresh install has no saved Workday login and, before its first OptimHire job, no
 *  e-mail in its profile — and stopped with "Add your email" while the box showed it. */
function typedEmail(): string {
  const v = ((byAid("email") as HTMLInputElement | null)?.value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}

function emailFor(ctx: Ctx, creds: CredReply): string {
  return creds.cred?.email || ctx.profile.personal.email || creds.master?.email || typedEmail();
}

/** Some tenants show "Sign in with Google / LinkedIn / Email" first. */
async function chooseEmailSignIn(): Promise<boolean> {
  const btn = byAid("signInWithEmail") ?? buttonByText(SIGN_IN_WITH_EMAIL_RX);
  if (btn && !byAid("password")) {
    await humanClick(btn);
    await waitStable(400);
    return true;
  }
  return false;
}

async function submit(key: "signInSubmit" | "createAccountSubmit", label: RegExp): Promise<void> {
  const btn = byAid(key) ?? buttonByText(label);
  if (!btn) throw new NeedsHuman("Couldn't find the submit button on the sign-in form.");
  await humanClick(btn);
  await sleep(400);
  await waitStable(700, 15000);
}

export async function handleSignIn(ctx: Ctx): Promise<void> {
  await chooseEmailSignIn();
  if (captchaPresent()) throw new NeedsHuman("Solve the CAPTCHA, then click Resume.");
  const host = ctx.run.tenantHost;
  const creds = await getCreds(host);
  if (creds.blocked) throw new NeedsHuman(creds.blocked); // [oh]
  if (creds.reset) {
    // [oh]
    const why = await resetByEmail(ctx, emailFor(ctx, creds));
    if (why) throw new NeedsHuman(`Couldn't reset the password by email (${why}). Reset it from the sign-in page, then retry the site in Queue Manager → Workday & sign-in.`);
    return;
  }
  const cred = creds.cred ?? (ctx.settings.useMasterPassword ? creds.master : null);

  if (!cred) {
    const create = byAid("createAccountLink") ?? buttonByText(CREATE_ACCOUNT_TEXT_RX);
    if (create && ctx.run.createAttempts < 2) {
      ctx.log("No saved account for this employer — switching to Create Account");
      await humanClick(create);
      await waitStable(500);
      return;
    }
    throw new NeedsHuman("No saved password for this employer. Sign in yourself (it will be remembered if you use Create Account here), then click Resume.");
  }
  // [oh] was 2: the host caps failed sign-ins per employer (lockout-safe) and offers your other passwords
  if (ctx.run.authAttempts >= 5) {
    throw new NeedsHuman("Sign-in failed twice. Use 'Forgot password' or update the saved password in Workday settings, then click Resume.");
  }

  ctx.run.authAttempts++;
  await ctx.save();
  const email = byAid("email");
  const pw = byAid("password");
  if (!email || !pw) throw new NeedsHuman("Sign-in form fields not found.");
  await setText(email, cred.email || emailFor(ctx, creds));
  await pace(ctx);
  await setText(pw, cred.password);
  await pace(ctx);
  await submit("signInSubmit", SIGN_IN_TEXT_RX);

  const errs = errorMessages().map((e) => e.text).join(" ");
  const locked = isLocked(errs); // [oh]
  if (AUTH_FAILED_RX.test(errs) || locked) {
    ctx.log(`Sign-in rejected: ${errs}`, "warn");
    // [oh] The host decides: another of your passwords, a reset by email, or stop for this employer.
    const next = await askHost<AuthNext>({ type: "wd:auth:rejected", tenantHost: host, password: cred.password, locked });
    if (next?.retry) return;
    if (next?.reset) {
      const why = await resetByEmail(ctx, cred.email || emailFor(ctx, creds));
      if (!why) return;
      throw new NeedsHuman(`Couldn't reset the password by email (${why}). Reset it from the sign-in page, then retry the site in Queue Manager → Workday & sign-in.`);
    }
    if (next?.reason) throw new NeedsHuman(next.reason);
    if (locked) throw new NeedsHuman("This account is locked. Reset the password from the sign-in page, then click Resume.");
    if (!creds.cred && ctx.run.createAttempts < 2) {
      const create = byAid("createAccountLink");
      if (create) {
        await humanClick(create);
        await waitStable(500);
        return;
      }
    }
    throw new NeedsHuman("Sign-in was rejected. Check the saved password (Workday settings) or use 'Forgot password', then click Resume.");
  }
  if (VERIFY_EMAIL_RX.test(errs + " " + text(document.body).slice(0, 3000)) && !byAid("next")) {
    // [oh] "Verify your account before you sign in" (seen at Medtronic, on the sign-in page): with
    // "Read verification emails" on, the host opens the link Workday emailed; then sign in again.
    const r = await askHost<{ ok?: boolean; reason?: string }>({
      type: "wd:auth:mailVerify", tenantHost: host, email: cred.email || emailFor(ctx, creds), since: Date.now() - 30 * 60_000,
    });
    if (r?.ok) {
      ctx.log("Email verified from the link Workday sent — signing in again");
      ctx.run.authAttempts = Math.max(0, ctx.run.authAttempts - 1);
      await waitStable(600, 8000);
      return;
    }
    throw new NeedsHuman(
      `Workday wants you to verify your email${r?.reason ? ` (${r.reason})` : ""}. Click the link in the email it sent — or turn on "Read verification emails" in the side panel — then click Resume.`
    );
  }
  ctx.log("Signed in");
}

export async function handleCreateAccount(ctx: Ctx): Promise<void> {
  if (captchaPresent()) throw new NeedsHuman("Solve the CAPTCHA, then click Resume.");
  const host = ctx.run.tenantHost;
  const creds = await getCreds(host);
  if (creds.blocked) throw new NeedsHuman(creds.blocked); // [oh]

  if (creds.cred && ctx.run.authAttempts < 2) {
    // We already have an account here; go back to sign in rather than make a duplicate.
    const link = byAid("signInLink") ?? buttonByText(SIGN_IN_TEXT_RX);
    if (link) {
      ctx.log("Account already saved for this employer — switching to Sign In");
      await humanClick(link);
      await waitStable(500);
      return;
    }
  }
  if (ctx.run.createAttempts >= 2) throw new NeedsHuman("Account creation failed twice. Finish it yourself, then click Resume.");

  const email = ctx.profile.personal.email || creds.master?.email || typedEmail();
  if (!email) throw new NeedsHuman("No e-mail to create the account with: open the side panel → Job Queue card → Applications Account, untick \"Use profile email\", type your e-mail (it saves when you leave the box), then click Resume.");

  let password: string;
  if (ctx.settings.useMasterPassword && creds.master) {
    password = creds.master.password;
    await chrome.runtime.sendMessage({ type: "wd:cred:set", tenantHost: host, email, password });
  } else {
    const r = (await chrome.runtime.sendMessage({ type: "wd:cred:generate", tenantHost: host, email })) as { password: string };
    password = r.password;
  }

  ctx.run.createAttempts++;
  await ctx.save();
  const emailEl = byAid("email");
  const pw = byAid("password");
  const verify = byAid("verifyPassword");
  if (!emailEl || !pw) throw new NeedsHuman("Create-account form fields not found.");
  await setText(emailEl, email);
  await pace(ctx);
  await setText(pw, password);
  await pace(ctx);
  if (verify) await setText(verify, password);
  await pace(ctx);

  const terms = byAid("createAccountCheckbox");
  if (terms) {
    if (!ctx.settings.consentCreateAccountTerms) {
      throw new NeedsHuman("Read and tick the account terms box (or allow it once in Workday settings), then click Resume.", "Create account terms");
    }
    if (!(await setCheckbox(terms, true))) throw new NeedsHuman("Couldn't tick the account terms box — tick it, then click Resume.");
  }

  await submit("createAccountSubmit", CREATE_ACCOUNT_TEXT_RX);
  const errs = errorMessages().map((e) => e.text).join(" ");
  if (ACCOUNT_EXISTS_RX.test(errs)) {
    ctx.log("An account already exists for this email — switching to Sign In", "warn");
    if (!(ctx.settings.useMasterPassword && creds.master)) {
      throw new NeedsHuman(
        "You already have an account with this employer, but its password isn't saved. Sign in (or use 'Forgot password'), then click Resume. Tip: turn on 'one password for all tenants' in settings."
      );
    }
    const link = byAid("signInLink");
    if (link) await humanClick(link);
    await waitStable(500);
    return;
  }
  if (/password|passwort|kennwort|mot de passe|contraseña|senha|wachtwoord|hasło|パスワード|密码/iu.test(errs)) throw new NeedsHuman(`Workday rejected the password: ${errs}`);
  if (errs) throw new NeedsHuman(`Account creation error: ${errs}`);
  ctx.log("Account created; credentials saved (encrypted) for this employer");
}
