# Historical Assurance Sources

The admission, lease, current-truth, final-source, and terminal synchronization
programs in this directory are historical after the protected validation
cutover. They do not authorize or block ordinary source work and must not be
reconnected to required CI, package commands, or release actions.

Retained product or release assertions must live in focused product tests or
action-specific helpers outside this directory. Historical tests may continue
to document the old model, but are not required merge checks.

Any future deletion or archival must first prove that no active workflow,
package command, release tool, or provider action imports the target. Do not
silently weaken auth, RLS, money, native, provider, release, or physical-proof
boundaries while retiring history.
