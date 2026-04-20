import { createClient } from "@supabase/supabase-js";

function readRequiredEnv(key) {
  const value = String(process.env[key] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function readFirstPresentEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: one of ${keys.join(", ")}`);
}

async function findUserByEmail(adminClient, email) {
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw error;

    const users = data?.users ?? [];
    const matched = users.find((user) => String(user.email ?? "").trim().toLowerCase() === email.toLowerCase());
    if (matched) return matched;
    if (!users.length || users.length < 200) return null;

    page += 1;
  }
}

async function upsertOwnerMembership(adminClient, ownerUserId, ownerEmail) {
  const { data: existingMembershipByUser, error: existingMembershipByUserError } = await adminClient
    .from("platform_role_memberships")
    .select("id,status")
    .eq("role", "owner")
    .eq("user_id", ownerUserId)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingMembershipByUserError) throw existingMembershipByUserError;

  const { data: existingMembershipByEmail, error: existingMembershipByEmailError } = existingMembershipByUser
    ? { data: null, error: null }
    : await adminClient
      .from("platform_role_memberships")
      .select("id,status")
      .eq("role", "owner")
      .eq("email", ownerEmail)
      .order("granted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (existingMembershipByEmailError) throw existingMembershipByEmailError;

  const existingMembership = existingMembershipByUser ?? existingMembershipByEmail;

  const payload = {
    role: "owner",
    user_id: ownerUserId,
    email: ownerEmail,
    status: "active",
    granted_by: "owner-bootstrap-script",
    notes: "Initial owner bootstrap",
  };

  if (existingMembership?.id) {
    const { error } = await adminClient
      .from("platform_role_memberships")
      .update(payload)
      .eq("id", existingMembership.id);

    if (error) throw error;
    return existingMembership.id;
  }

  const { data, error } = await adminClient
    .from("platform_role_memberships")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

async function main() {
  const supabaseUrl = readFirstPresentEnv(["SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"]);
  const serviceRoleKey = readRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ownerEmail = readRequiredEnv("CHILLYWOOD_OWNER_EMAIL").toLowerCase();
  const ownerPassword = readRequiredEnv("CHILLYWOOD_OWNER_PASSWORD");

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let user = await findUserByEmail(adminClient, ownerEmail);

  if (!user) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        platformBootstrap: "owner-admin",
      },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await adminClient.auth.admin.updateUserById(user.id, {
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata ?? {}),
        platformBootstrap: "owner-admin",
      },
    });
    if (error) throw error;
    user = data.user;
  }

  if (!user?.id) {
    throw new Error("Owner bootstrap did not return a valid user id.");
  }

  const membershipId = await upsertOwnerMembership(adminClient, user.id, ownerEmail);

  console.log("Owner bootstrap complete.");
  console.log(`Owner user id: ${user.id}`);
  console.log(`Owner membership id: ${membershipId ?? "unknown"}`);
  console.log("Immediate manual follow-up: rotate the temporary owner password after first sign-in or use Supabase Auth admin reset flow, because first-login forced rotation is not wired in current repo truth.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
