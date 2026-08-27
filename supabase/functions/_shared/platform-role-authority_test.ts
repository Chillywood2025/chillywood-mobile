import {
  activePlatformRoleHasAnyPermission,
  platformRoleAuthorityRowIsExactAndActive,
  platformRoleStatusAndExpiryAreActive,
  selectExactActivePlatformRoleRows,
} from "../../../_lib/platformRoleAuthority.ts";

const EXACT_USER = "94000000-0000-4000-8000-000000000001";
const WRONG_USER = "94000000-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-08-25T12:00:00.000Z");

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }`,
    );
  }
};

Deno.test("platform role readback ignores recycled email and selects exact user_id only", () => {
  const rows = [
    {
      email: "recycled@example.test",
      expires_at: null,
      id: 1,
      role: "owner",
      status: "active",
      user_id: WRONG_USER,
    },
    {
      email: "recycled@example.test",
      expires_at: null,
      id: 2,
      role: "operator",
      status: "active",
      user_id: EXACT_USER,
    },
    {
      email: "recycled@example.test",
      expires_at: null,
      id: 3,
      role: "owner",
      status: "active",
      user_id: null,
    },
  ];
  assertEquals(
    selectExactActivePlatformRoleRows(rows, EXACT_USER, NOW).map((row) =>
      row.id
    ),
    [2],
    "exact immutable subject rows",
  );
});

Deno.test("cached permissions require an active unexpired membership", () => {
  const required = new Set(["legal_review"]);
  assertEquals(
    activePlatformRoleHasAnyPermission(
      {
        expiresAt: "2026-08-25T13:00:00.000Z",
        permissionKeys: ["legal_review"],
        status: "active",
      },
      required,
      NOW,
    ),
    true,
    "active permission cache",
  );
  assertEquals(
    activePlatformRoleHasAnyPermission(
      {
        expiresAt: "2026-08-25T11:59:59.000Z",
        permissionKeys: ["legal_review"],
        status: "active",
      },
      required,
      NOW,
    ),
    false,
    "expired membership cache",
  );
  assertEquals(
    activePlatformRoleHasAnyPermission(
      {
        expiresAt: null,
        permissionKeys: ["legal_review"],
        status: "revoked",
      },
      required,
      NOW,
    ),
    false,
    "revoked membership cache",
  );
  assertEquals(
    activePlatformRoleHasAnyPermission(
      {
        expiresAt: null,
        permissionKeys: ["unrelated"],
        status: "active",
      },
      required,
      NOW,
    ),
    false,
    "wrong permission cache",
  );
});

Deno.test("expired, malformed-expiry, wrong-subject, and malformed-user roles fail closed", () => {
  assertEquals(
    platformRoleStatusAndExpiryAreActive(
      "active",
      "2026-08-25T11:59:59.000Z",
      NOW,
    ),
    false,
    "expired membership cannot satisfy downstream role authority",
  );
  assertEquals(
    platformRoleAuthorityRowIsExactAndActive(
      {
        expires_at: "2026-08-25T11:59:59.000Z",
        status: "active",
        user_id: EXACT_USER,
      },
      EXACT_USER,
      NOW,
    ),
    false,
    "expired owner",
  );
  assertEquals(
    platformRoleAuthorityRowIsExactAndActive(
      {
        expires_at: "malformed",
        status: "active",
        user_id: EXACT_USER,
      },
      EXACT_USER,
      NOW,
    ),
    false,
    "malformed expiry",
  );
  assertEquals(
    platformRoleAuthorityRowIsExactAndActive(
      {
        expires_at: null,
        status: "active",
        user_id: WRONG_USER,
      },
      EXACT_USER,
      NOW,
    ),
    false,
    "wrong subject",
  );
  assertEquals(
    platformRoleAuthorityRowIsExactAndActive(
      {
        expires_at: null,
        status: "active",
        user_id: EXACT_USER,
      },
      "missing",
      NOW,
    ),
    false,
    "malformed expected user",
  );
  assertEquals(
    platformRoleAuthorityRowIsExactAndActive(
      {
        expires_at: "2026-08-25T13:00:00.000Z",
        status: "active",
        user_id: EXACT_USER,
      },
      EXACT_USER,
      NOW,
    ),
    true,
    "exact unexpired owner",
  );
});
