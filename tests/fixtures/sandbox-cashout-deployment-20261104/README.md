# Historical cashout deployment test fixture

This fixture preserves source bytes from `f77cd8c2aebfbfc6a9b6986c14e5fc4887548a52`,
which recorded the original dormant sandbox schema baseline. It does not qualify
the current source, authorize deployment, or change the production manifest.

`closure.json` pins every original closure file by SHA-256. Unchanged files are
read from the checkout only after their digest matches. Superseded files are
stored here as `.ts.txt` snapshots so application TypeScript checks do not compile
historical Edge code. Tests materialize the original closure into a temporary
directory and validate it with the unchanged production bundle loader.

No historical Git objects, network fetch, provider call, or production access is
required. The changed working-tree engine must still fail the old manifest.
