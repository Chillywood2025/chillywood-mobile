# Memory and Learning Policy

Status: `SOURCE_COMPLETE_NOT_DEPLOYED`

The additive local migration defines twenty service-owned tables for tasks, research, knowledge, architecture, decisions, hypotheses, candidates, experiments, plans, runs, evaluations, lessons, playbooks, model/tool invocations, and budgets.

Direct client writes are denied. Owner/operator readback is RLS-constrained. Raw evidence tables are immutable; current summaries remain mutable. Dedupe keys, retention, expiry, recursive secret-like metadata checks, and `private_user_data_used=false` are mandatory.

Learning may adjust only playbook confidence, source reliability, tool ordering, expected duration, test selection, failure-pattern matching, rollback preference, and model-routing preference.

Learning may never change forbidden scope, approval level, owner authority, money policy, public-release policy, auth/RLS policy, legal policy, or secret policy. Prompt and policy changes require versioning and review. Private user data is not training material.
