# Assurance-engine rules

Assurance commands must be deterministic, offline by default, JSON-capable,
concise for humans, secret-safe, provider-read-only when explicitly requested,
and nonzero on a missing required gate. Do not add implicit network access,
provider mutation, undocumented timers, nondeterministic timestamps, or
evidence fallbacks.

Each command must reject proof substitutions and preserve replay inputs for
failures. Fixture and dogfood modes may report expected blockers, but cannot
convert them into passes or waivers.
