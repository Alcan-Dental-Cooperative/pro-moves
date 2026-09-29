/**
 * Whether the admin Sim Console (masquerade + simulated time) ships in this
 * build. ON unless the build explicitly sets VITE_ENABLE_SIMTOOLS=false.
 *
 * It used to be opt-in ("true" required), which only worked while .env was
 * committed: Lovable's Publish build reads the repo's .env and injects
 * nothing of its own for custom flags. When .env was untracked (2026-09-18)
 * the flag silently went missing in production and the console vanished.
 * Opt-out keeps production working with no .env at all, while demo capture
 * (demo-capture/README.md) still turns it off with VITE_ENABLE_SIMTOOLS=false.
 *
 * The console only renders for the two admin emails in Layout.tsx, and every
 * read it triggers still goes through RLS, so this is a UI affordance, not a
 * security boundary.
 */
// Compare the raw env value against a literal, so Vite inlines it and a
// VITE_ENABLE_SIMTOOLS=false build drops the console code entirely.
export const SIM_TOOLS_ENABLED = import.meta.env.VITE_ENABLE_SIMTOOLS !== 'false';
