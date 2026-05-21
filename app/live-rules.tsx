import React from "react";

import { getLegalPolicy } from "../_lib/legalPolicies";
import { LegalPolicyViewer } from "../components/legal/legal-policy-viewer";

export default function LiveRulesPage() {
  return <LegalPolicyViewer policy={getLegalPolicy("live-chat-rules")!} />;
}

