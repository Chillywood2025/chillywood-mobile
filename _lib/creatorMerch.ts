import { Linking } from "react-native";
import {
  assertAccountBoundSupabaseMutationSubjectCurrent,
  captureAccountBoundSupabaseMutationSubject,
  runCurrentAccountBoundSupabaseMutationRpc,
} from "./accountBoundSupabaseMutation";
import { SUPABASE_URL } from "./supabase";
import { resolveMerchProductPhotos, type MerchPhotoFields } from "./merchProductPhotos";

export type MerchVariant = {
  id: string; sku: string; size: string | null; color: string | null;
  stockQuantity: number; availableQuantity: number;
  status: "active" | "paused" | "archived"; updatedAt: string;
};
export type MerchVariantInput = Pick<MerchVariant, "id" | "sku" | "size" | "color" | "stockQuantity" | "status">;
export type MerchProduct = MerchPhotoFields & {
  id: string; creatorId: string; title: string; description: string | null;
  imageUrl: string | null; priceMinor: number; currency: string;
  publicationStatus: "draft" | "published" | "paused" | "archived";
  stockQuantity: number; availableQuantity: number; environment: "sandbox";
  checkoutAvailable: boolean; checkoutReason: string; updatedAt: string; shippingSummary: string;
  variantMode?: "simple" | "options"; variants?: MerchVariant[];
};
export type MerchOrder = {
  id: string; creatorId: string; productId: string; title: string; quantity: number;
  totalMinor: number; currency: string; paymentStatus: string; fulfillmentStatus: string;
  refundedAmountMinor: number; createdAt: string; updatedAt: string; environment: string;
  checkoutAttemptId?: string | null; checkoutResumeAvailable?: boolean; checkoutResumeReason?: string;
  variantId?: string | null; sku?: string | null; size?: string | null; color?: string | null;
};
export type MerchProductInput = {
  id?: string; title: string; description: string | null; imageUrl: string | null;
  priceMinor: number; stockQuantity: number; publicationStatus: MerchProduct["publicationStatus"];
  expectedUpdatedAt?: string;
};

export function createMerchCheckoutAttemptId() {
  const bytes = new Uint8Array(16);
  // supabase installs the existing react-native-get-random-values polyfill.
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const MERCH_ERRORS: Record<string, string> = {
  merch_current_session_required: "Sign in again to continue with your shop or orders.",
  merch_creator_required: "Only the creator can manage this shop.",
  merch_platform_unavailable: "This creator's Platform is not available to your account.",
  merch_product_invalid: "Check the title, price, stock quantity, and HTTPS image address.",
  merch_product_changed_reload: "This product changed elsewhere. Reload it before saving again.",
  merch_stock_below_reserved: "Stock cannot be lower than the quantity already reserved by orders.",
  merch_product_unavailable: "This product is no longer available for checkout. Refresh the shop.",
  merch_sold_out: "There is not enough stock for this order. Refresh the shop or choose a smaller quantity.",
  merch_attempt_closed_check_orders: "This checkout attempt has ended. Check My orders before starting another.",
  merch_attempt_conflict: "This checkout attempt belongs to a different selection. Check My orders first.",
  merch_order_changed_reload: "This order changed elsewhere. Refresh its status before continuing.",
  merch_fulfillment_not_available: "This order is not eligible for a fulfillment update. Refresh its payment and refund status.",
  sandbox_tester_required: "Checkout is limited to approved sandbox testers. Public sales are not active.",
  merch_existing_pending_order_check_orders: "You already have a pending order for this product. Resume it from My orders instead of starting another.",
  merch_pending_order_limit_check_orders: "You have pending orders to review. Open My orders before starting another checkout.",
  merch_creator_not_ready: "This creator is not ready to accept sandbox orders. Existing order status remains available.",
  merch_variant_mode_has_reserved_stock: "This product has order history or reserved stock. Keep its inventory mode, or create a new listing for different options.",
  merch_variant_mode_has_order_history: "Existing orders use this inventory mode. Create a new listing to change between one item and size/color options.",
  merch_variants_archive_instead_of_delete: "Keep existing options in the list and archive them instead of deleting them.",
  merch_variants_invalid: "Check each option's SKU, size or color, and whole-number stock quantity. Up to 50 options are supported.",
  merch_variants_stock_limit: "Total stock across all options must not exceed 1,000,000 units.",
  merch_variant_not_found: "This option is no longer available to edit. Reload your product before trying again.",
  merch_variant_unavailable: "This size/color option is unavailable. Refresh the shop and choose an available option.",
  merch_variant_not_expected: "This product does not use size/color options. Refresh the product before checking out.",
};
const merchError = (message?: string) => {
  const match = Object.keys(MERCH_ERRORS).find(key => message?.includes(key));
  return match ? MERCH_ERRORS[match] : message || "The shop is unavailable. Please try again.";
};

async function merchRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  // Frozen token and exact-session readback bind reads as well as writes: an
  // account switch must never display the previous buyer's private orders.
  const result = await runCurrentAccountBoundSupabaseMutationRpc<T>(name, args);
  if (result.error || !result.data) throw new Error(merchError(result.error?.message));
  return result.data;
}

export async function readMerchProducts(input: { creatorId?: string; owner?: boolean; cursor?: string | null }) {
  const subject = await captureAccountBoundSupabaseMutationSubject();
  const page = await merchRpc<{ products: MerchProduct[]; nextCursor: string | null }>("list_creator_merch_products", {
    p_creator_id: input.creatorId ?? null, p_manage: input.owner === true,
    p_before_id: input.cursor ?? null, p_limit: 20,
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const products = await resolveMerchProductPhotos(page.products);
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return { ...page, products };
}

export function readMerchOrders(input: { role: "buyer" | "creator"; cursor?: string | null; orderId?: string }) {
  return merchRpc<{ orders: MerchOrder[]; nextCursor: string | null }>("list_my_merch_orders", {
    p_role: input.role, p_before_id: input.cursor ?? null, p_limit: 20, p_order_id: input.orderId ?? null,
  });
}

export function saveMerchProduct(input: MerchProductInput) {
  return merchRpc<MerchProduct>("save_creator_merch_product", {
    p_product_id: input.id ?? null, p_title: input.title, p_description: input.description ?? "",
    p_image_url: input.imageUrl, p_price_minor: input.priceMinor, p_stock_quantity: input.stockQuantity,
    p_publication_status: input.publicationStatus, p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
}

export function updateMerchFulfillment(input: { orderId: string; status: string; expectedStatus: string }) {
  return merchRpc<MerchOrder>("update_creator_merch_fulfillment", {
    p_order_id: input.orderId, p_status: input.status, p_expected_status: input.expectedStatus,
  });
}

export function configureMerchVariants(input: {
  productId: string; variantMode: "simple" | "options"; variants: MerchVariantInput[]; expectedUpdatedAt: string;
}) {
  return merchRpc<MerchProduct>("configure_creator_merch_variants", {
    p_product_id: input.productId, p_variant_mode: input.variantMode,
    p_variants: input.variants, p_expected_updated_at: input.expectedUpdatedAt,
  });
}

export async function launchMerchCheckout(input: { productId: string; quantity: number; attemptId: string; variantId?: string | null; isPresentationCurrent?: () => boolean }) {
  if (!input.productId || !input.attemptId || !Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10) {
    throw new Error("Choose a product and a quantity from 1 to 10.");
  }
  const subject = await captureAccountBoundSupabaseMutationSubject();
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const response = await fetch(`${SUPABASE_URL.replace(/\/+$/g, "")}/functions/v1/stripe-merch-checkout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${subject.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: input.productId, quantity: input.quantity, attempt_id: input.attemptId, variant_id: input.variantId ?? null }),
  });
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  const payload = await response.json().catch(() => null) as { checkoutCreated?: boolean; orderId?: string; url?: string; message?: string } | null;
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  if (!response.ok || !payload?.checkoutCreated || !payload.orderId || !payload.url) {
    throw new Error(merchError(payload?.message || "Checkout was not confirmed. Check your orders before trying again."));
  }
  const url = new URL(payload.url);
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password) {
    throw new Error("Checkout returned an unexpected destination. Nothing was opened.");
  }
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  // Leaving the screen cannot cancel a server checkout; it only retires the
  // external navigation. The durable order remains available in My orders.
  if (input.isPresentationCurrent && !input.isPresentationCurrent()) {
    throw new Error("Checkout may be pending. Open My orders to check its status.");
  }
  await Linking.openURL(url.toString());
  assertAccountBoundSupabaseMutationSubjectCurrent(subject);
  return { orderId: payload.orderId };
}
