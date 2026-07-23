# Cognitive hardening independent retest target

- Hardening PR: #16
- Exact reviewed commit: `7bc45635fc4e0ca9f06084ea8e70aba056fb48bb`
- Implementation base: `bd8fd0c709db8ff843b69fa9b9a5039a74d09a94`
- Independent review base: `ff6b2588e2dcc4fa8e76c8f8f6dac47f64cb0667`
- Review branch: `codex/cognitive-platform-hardening-retest`
- Review mode: reports and synthetic fixtures only

The reviewed system claims only
`security_hardened_scaffold_not_deployed`: activation off, scheduler none,
credentials none, cognitive migrations/functions undeployed, and production
authority false. The retest must independently verify those conditions and must
not approve, merge, deploy, credential, or activate the scaffold.

Four isolated lanes start from the same exact commit:

1. architecture/security;
2. database/RLS/control plane;
3. research/model/tool/provider/release isolation;
4. cross-lane adversarial behavior.

The first three lanes do not read each other’s conclusions. Lane D’s attack plan
was frozen before results from the first three lanes were read.
