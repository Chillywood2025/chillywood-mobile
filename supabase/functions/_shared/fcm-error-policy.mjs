const FCM_ERROR_DETAIL_TYPE = "type.googleapis.com/google.firebase.fcm.v1.FcmError";

const toText = (value) => String(value ?? "").trim();

export const readFcmProviderErrorCode = ({
  body,
  httpStatus,
  responseOk,
}) => {
  const payload = body && typeof body === "object" && !Array.isArray(body)
    ? body
    : {};
  const errorPayload = payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
    ? payload.error
    : {};
  const details = Array.isArray(errorPayload.details) ? errorPayload.details : [];
  const fcmDetail = details.find((detail) => (
    detail
    && typeof detail === "object"
    && !Array.isArray(detail)
    && toText(detail["@type"]) === FCM_ERROR_DETAIL_TYPE
  ));
  const fcmErrorCode = fcmDetail && typeof fcmDetail === "object"
    ? toText(fcmDetail.errorCode ?? fcmDetail.error_code)
    : "";

  return fcmErrorCode
    || toText(errorPayload.status)
    || toText(errorPayload.message)
    || (responseOk ? null : `fcm_http_${httpStatus}`);
};

export const isPermanentFcmTokenError = (value) => (
  value === "UNREGISTERED" || value === "SENDER_ID_MISMATCH"
);
