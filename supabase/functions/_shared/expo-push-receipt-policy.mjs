const toText = (value) => String(value ?? "").trim();

export function classifyExpoPushReceipt(receiptValue) {
  const receipt = receiptValue && typeof receiptValue === "object" ? receiptValue : {};
  const status = toText(receipt.status).toLowerCase();
  if (status !== "error") {
    return Object.freeze({
      errorCode: null,
      errorMessage: null,
      isError: false,
      shouldRevokeToken: false,
    });
  }

  const details = receipt.details && typeof receipt.details === "object"
    ? receipt.details
    : {};
  const errorCode = toText(details.error) || "expo_receipt_error";
  return Object.freeze({
    errorCode,
    errorMessage: toText(receipt.message) || errorCode,
    isError: true,
    shouldRevokeToken: errorCode === "DeviceNotRegistered",
  });
}
