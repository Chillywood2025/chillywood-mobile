import { handler } from "./index.ts";

type Row = Record<string, unknown>;
const USER = "af400000-0000-4000-8000-000000000001";
const OTHER = "af400000-0000-4000-8000-000000000002";
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const equal = (actual: unknown, expected: unknown) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );

const fixture = () => {
  const now = Date.now();
  return {
    subscription: {
      object: "subscription",
      id: "subGoogle",
      customer_id: USER,
      original_customer_id: USER,
      environment: "sandbox",
      store: "play_store",
      ownership: "purchased",
      gives_access: true,
      pending_payment: false,
      status: "active",
      product_id: "prodGoogle",
      starts_at: now - 600_000,
      current_period_starts_at: now - 120_000,
      current_period_ends_at: now + 600_000,
      store_subscription_identifier: "GPA.0000-0000-0000-00000..0",
      entitlements: {
        object: "list",
        items: [{ lookup_key: "premium", state: "active" }],
        next_page: null,
      },
    } as Row,
    product: {
      object: "product",
      id: "prodGoogle",
      type: "subscription",
      store_identifier: "premium_subscription:monthly",
    } as Row,
    transactions: [
      {
        object: "subscription_transaction",
        id: "GPA.0000-0000-0000-00000",
        purchased_at: now - 600_000,
        product_store_identifier: "premium_subscription",
      },
      {
        object: "subscription_transaction",
        id: "GPA.0000-0000-0000-00000..0",
        purchased_at: now - 120_000,
        product_store_identifier: "premium_subscription:monthly",
      },
    ] as Row[],
  };
};

type Options = ReturnType<typeof fixture> & {
  auth?: boolean;
  authorized?: boolean;
  rateLimited?: boolean;
  extraSubscriptions?: Row[];
  malformedTransactions?: boolean;
  nextPage?: unknown;
  transactionPages?: Row[][];
  projection?: Row;
  projectionError?: string;
};

// Exercise the real exported handler, authentication, rate limiter, pagination,
// product lookup, snapshot construction and RPC dispatch. Every request is
// intercepted locally; an unexpected URL fails the test instead of using a network.
const run = async (options: Options) => {
  const calls: { name: string; args: Row }[] = [];
  const providerUrls: string[] = [];
  let transactionPage = 0;
  const oldFetch = globalThis.fetch;
  const environment = {
    SUPABASE_URL: "https://premium-fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
    REVENUECAT_SECRET_API_KEY: "fixture-provider-secret",
    REVENUECAT_PROJECT_ID: "projFixture",
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(environment)) {
    Deno.env.set(key, value);
  }
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    const requestInit = init as
      | { body?: unknown; headers?: HeadersInit }
      | undefined;
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input
        : input.url,
    );
    if (url.origin === environment.SUPABASE_URL) {
      if (url.pathname === "/auth/v1/user") {
        return options.authorized === false
          ? response({ message: "Invalid JWT" }, 401)
          : response({
            id: USER,
            aud: "authenticated",
            role: "authenticated",
            email: "fixture@example.invalid",
          });
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").pop()!;
        const args = JSON.parse(String(requestInit?.body ?? "{}"));
        calls.push({ name, args });
        if (name === "enforce_revenuecat_premium_reconciliation_rate_limit") {
          return options.rateLimited
            ? response({ message: "rate_limited" }, 400)
            : response(null);
        }
        if (options.projectionError) {
          return response({ message: options.projectionError }, 400);
        }
        return response(
          options.projection ??
            { entitlementActive: true, duplicateEvent: false },
        );
      }
      if (url.pathname === "/rest/v1/provider_readiness_audit_log") {
        return response(null, 201);
      }
    }
    if (url.origin === "https://api.revenuecat.com") {
      providerUrls.push(url.href);
      equal(
        new Headers(requestInit?.headers).get("authorization"),
        "Bearer fixture-provider-secret",
      );
      assert(
        url.pathname.startsWith("/v2/projects/projFixture/"),
        "provider project escaped",
      );
      if (
        url.pathname ===
          `/v2/projects/projFixture/customers/${USER}/subscriptions`
      ) {
        equal(url.searchParams.get("environment"), "sandbox");
        return response({
          object: "list",
          items: [options.subscription, ...(options.extraSubscriptions ?? [])],
          next_page: null,
        });
      }
      if (
        url.pathname ===
          `/v2/projects/projFixture/products/${options.subscription.product_id}`
      ) return response(options.product);
      if (
        url.pathname ===
          `/v2/projects/projFixture/subscriptions/${options.subscription.id}/transactions`
      ) {
        const pageItems = options.transactionPages?.[transactionPage++] ??
          options.transactions;
        const morePages = options.transactionPages &&
          transactionPage < options.transactionPages.length;
        return response({
          object: "list",
          items: options.malformedTransactions
            ? [null, ...options.transactions]
            : pageItems,
          next_page: morePages
            ? `/v2/projects/projFixture/subscriptions/${options.subscription.id}/transactions?starting_after=next`
            : options.nextPage ?? null,
        });
      }
    }
    throw new Error(`Unexpected mocked request: ${url.origin}${url.pathname}`);
  };
  try {
    const result = await handler(
      new Request("https://fixture.invalid/restore", {
        method: "POST",
        headers: options.auth === false
          ? {}
          : { authorization: "Bearer fixture-user-token" },
        // The client cannot pick whose entitlement or which product to grant.
        body: JSON.stringify({
          userId: OTHER,
          product: "forged",
          environment: "production",
        }),
      }),
    );
    return {
      status: result.status,
      body: await result.json(),
      calls,
      providerUrls,
    };
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of Object.keys(environment)) {
      if (previous[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[key]!);
    }
  }
};

const projections = (result: Awaited<ReturnType<typeof run>>) =>
  result.calls.filter((call) =>
    call.name !== "enforce_revenuecat_premium_reconciliation_rate_limit"
  );

Deno.test("Google Restore dispatches exact provider-derived same-owner snapshot, never client authority", async () => {
  const input = fixture();
  const result = await run(input);
  equal(result.status, 200);
  equal(result.body, {
    status: "reconciled",
    entitlementActive: true,
    liveMoneyAction: false,
  });
  const [call] = projections(result);
  equal(projections(result).length, 1);
  equal(call.name, "reconcile_revenuecat_google_premium_snapshot_atomic");
  equal(call.args.p_user_id, USER);
  equal(call.args.p_original_customer_id, USER);
  equal(call.args.p_provider_product_id, "premium_subscription");
  equal(call.args.p_provider_base_plan_id, "monthly");
  equal(call.args.p_original_transaction_id, input.transactions[0].id);
  equal(
    call.args.p_expires_at,
    new Date(Number(input.subscription.current_period_ends_at)).toISOString(),
  );
  assert(
    /^[a-f0-9]{64}$/u.test(String(call.args.p_raw_payload_hash)),
    "snapshot digest missing",
  );
  assert(
    !("p_amount_minor" in call.args) && !("p_currency" in call.args),
    "Restore invented a price",
  );
});

Deno.test("Google transaction bare SKU corroborates product; exact base plan comes from the Product resource", async () => {
  const input = fixture();
  input.transactions[1].product_store_identifier = "premium_subscription";
  const result = await run(input);
  equal(result.status, 200);
  equal(projections(result)[0].args.p_provider_base_plan_id, "monthly");
});

Deno.test("Google Restore reads every transaction page before choosing its exact bound period", async () => {
  const input = fixture();
  const result = await run({
    ...input,
    transactionPages: [[input.transactions[0]], [input.transactions[1]]],
  });
  equal(result.status, 200);
  equal(
    result.providerUrls.filter((url) => url.includes("/transactions")).length,
    2,
  );
  equal(
    projections(result)[0].args.p_original_transaction_id,
    input.transactions[0].id,
  );
});

Deno.test("Apple Restore preserves existing current-owner RPC and product semantics", async () => {
  const input = fixture();
  input.subscription.store = "app_store";
  input.product.store_identifier = "com.chillywood.premium.monthly";
  const result = await run(input);
  equal(result.status, 200);
  equal(
    projections(result)[0].name,
    "reconcile_revenuecat_premium_current_owner_snapshot_atomic",
  );
  equal(
    projections(result)[0].args.p_provider_product_id,
    "com.chillywood.premium.monthly",
  );
  assert(
    !("p_provider_base_plan_id" in projections(result)[0].args),
    "Apple base-plan semantics changed",
  );
});

for (
  const authOptions of [{ auth: false }, { authorized: false }, {
    rateLimited: true,
  }]
) {
  Deno.test(`Restore authenticates and rate-limits before provider reads: ${JSON.stringify(authOptions)}`, async () => {
    const result = await run({ ...fixture(), ...authOptions });
    equal(result.status, authOptions.rateLimited ? 429 : 401);
    equal(result.providerUrls.length, 0);
    equal(projections(result).length, 0);
  });
}

for (
  const [field, value] of [
    ["customer_id", OTHER],
    ["original_customer_id", OTHER],
    ["original_customer_id", "$RCAnonymousID:other"],
    ["environment", "production"],
    ["store", "promotional"],
    ["ownership", "family_shared"],
    ["pending_payment", true],
    ["gives_access", false],
    ["current_period_ends_at", 1],
    ["current_period_starts_at", "123456"],
    ["current_period_ends_at", Number.POSITIVE_INFINITY],
    ["entitlements", { object: "list", items: [] }],
  ] as const
) {
  Deno.test(`Google Restore refuses invalid subscription ${field}=${String(value)}`, async () => {
    const input = fixture();
    input.subscription[field] = value;
    const result = await run(input);
    equal(result.body.entitlementActive, false);
    equal(projections(result).length, 0);
  });
}

for (
  const product of [
    { id: "prodOther" },
    { type: "consumable" },
    { store_identifier: "other:monthly" },
    { store_identifier: "premium_subscription:" },
    { store_identifier: "premium_subscription:monthly:extra" },
  ]
) {
  Deno.test(`Google Restore refuses product mismatch ${JSON.stringify(product)}`, async () => {
    const input = fixture();
    Object.assign(input.product, product);
    const result = await run(input);
    equal(result.status, 409);
    equal(projections(result).length, 0);
  });
}

for (
  const change of [
    "malformed",
    "duplicate",
    "first-date",
    "latest-id",
    "latest-date",
    "latest-product",
    "wrong-project-page",
    "pagination-limit",
    "nonstring-page",
    "whitespace-page",
    "padded-page",
  ] as const
) {
  Deno.test(`Google Restore refuses incomplete or mismatched transaction proof: ${change}`, async () => {
    const input: Options = fixture();
    if (change === "malformed") input.malformedTransactions = true;
    if (change === "duplicate") input.transactions.push(input.transactions[1]);
    if (change === "first-date") {
      input.transactions[0].purchased_at =
        Number(input.subscription.starts_at) + 1;
    }
    if (change === "latest-id") input.transactions[1].id = "other-transaction";
    if (change === "latest-date") {
      input.transactions[1].purchased_at =
        Number(input.subscription.current_period_starts_at) - 1;
    }
    if (change === "latest-product") {
      input.transactions[1].product_store_identifier =
        "premium_subscription:other";
    }
    if (change === "wrong-project-page") {
      input.nextPage =
        "/v2/projects/other/subscriptions/subGoogle/transactions";
    }
    if (change === "pagination-limit") {
      input.nextPage =
        "/v2/projects/projFixture/subscriptions/subGoogle/transactions?starting_after=repeat";
    }
    if (change === "nonstring-page") input.nextPage = [];
    if (change === "whitespace-page") input.nextPage = " ";
    if (change === "padded-page") {
      input.nextPage =
        " /v2/projects/projFixture/subscriptions/subGoogle/transactions";
    }
    const result = await run(input);
    equal(result.status, 409);
    equal(projections(result).length, 0);
  });
}

Deno.test("Restore refuses multiple eligible subscriptions rather than guessing a store", async () => {
  const input = fixture();
  const other = { ...input.subscription, id: "subApple", store: "app_store" };
  const result = await run({ ...input, extraSubscriptions: [other] });
  equal(result.status, 409);
  equal(projections(result).length, 0);
});

for (
  const options of [{ projection: { entitlementActive: false } }, {
    projectionError: "premium_reconciliation_original_authority_missing",
  }]
) {
  Deno.test(`Restore cannot report success when database authority rejects: ${JSON.stringify(options)}`, async () => {
    const result = await run({ ...fixture(), ...options });
    equal(result.status, 409);
    equal(result.body.entitlementActive, false);
  });
}
