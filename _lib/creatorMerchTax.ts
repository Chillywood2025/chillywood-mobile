import { runCurrentAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
export type MerchTaxCategory = { id: string; categoryKey: string; label: string; revision: number };
export type MerchTaxSelection = { status: string; categoryId: string | null; requestId: string | null; reason: string | null };
export type MerchTaxCategories = { categories: MerchTaxCategory[]; selection: MerchTaxSelection | null };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const optionalText = (value: unknown) => typeof value === "string" ? value : null;
const selection = (value: unknown): MerchTaxSelection | null => object(value) && typeof value.status === "string" ? {
  status: value.status, categoryId: optionalText(value.categoryId), requestId: optionalText(value.requestId), reason: optionalText(value.reason),
} : null;
async function rpc(name: string, args: Record<string, unknown>) {
  const result = await runCurrentAccountBoundSupabaseMutationRpc<unknown>(name, args);
  if (result.error || !object(result.data)) throw new Error("Product category verification could not be completed. Refresh this product and try again.");
  return result.data;
}
export async function listMerchTaxCategories(productId: string): Promise<MerchTaxCategories> {
  const data = await rpc("list_creator_merch_tax_categories", { p_product_id: productId });
  if (!Array.isArray(data.categories) || data.categories.some(row => !object(row) || typeof row.id !== "string" || typeof row.categoryKey !== "string" || typeof row.label !== "string" || !Number.isSafeInteger(row.revision))) {
    throw new Error("Product categories could not be verified. Please refresh.");
  }
  return { categories: data.categories as MerchTaxCategory[], selection: selection(data.selection) };
}
export async function selectMerchTaxCategory(input: { productId: string; categoryId: string | null; expectedUpdatedAt: string; note?: string }) {
  if (input.categoryId === null && !input.note?.trim()) throw new Error("Describe the product so the owner can review its category.");
  const data = await rpc("select_creator_merch_tax_category", {
    p_product_id: input.productId, p_category_id: input.categoryId, p_expected_updated_at: input.expectedUpdatedAt,
    p_request_note: input.note?.trim() || null,
  });
  const result = selection(data);
  if (!result || !["ready", "review_required", "provider_evidence_required"].includes(result.status) || typeof data.updatedAt !== "string" || !Number.isFinite(Date.parse(data.updatedAt))) {
    throw new Error("Category selection could not be confirmed. Refresh the product before continuing.");
  }
  return { ...result, updatedAt: data.updatedAt };
}
