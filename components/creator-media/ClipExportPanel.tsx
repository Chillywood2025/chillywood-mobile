import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AppActionButton } from "../ui/app-surface";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "../../_lib/accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import type { ClipStudioEditPatch } from "../../_lib/clipStudio";

type ExportJob = { id: string; status: "queued" | "rendering" | "ready" | "failed" | "canceled" | "stale"; outputVideoId: string | null };
const requestId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === "x" ? n : (n & 3) | 8).toString(16);
});
const notices: Record<string, string> = {
  clip_export_worker_unavailable: "Video exporting is temporarily unavailable. Your saved original and edits are safe. Try again later.",
  clip_export_source_not_ready: "The saved source must finish scanning and review before exporting.",
  clip_export_watermark_not_ready: "Publish an approved, scanned watermark first, or turn off the brand mark.",
  clip_export_edit_changed: "Your saved edit changed. Reopen this clip before exporting.",
  clip_export_queue_full: "Three exports are already waiting or running. Finish or cancel one first.",
};

/** Parent keys by editor/account generation. Every request retains its initiating
 * account, and a lost enqueue response retries the same durable operation ID. */
export function ClipExportPanel({ videoId, ownerId, saved, edit, onReview }: {
  videoId: string | null; ownerId: string; saved: boolean; edit: ClipStudioEditPatch; onReview: (id: string) => void;
}) {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [statusKnown, setStatusKnown] = useState(false);
  const current = useRef(true), inFlight = useRef(false), focused = useRef(false);
  const attempt = useRef<string | null>(null);
  const attemptSpec = useRef<string | null>(null);
  const authority = useRef(getCurrentAccountSessionAuthoritySnapshot());
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  const active = useCallback(() => current.current && focused.current && AppState.currentState === "active"
    && sameAccountSessionAuthority(authority.current, getCurrentAccountSessionAuthoritySnapshot()), []);
  const call = useCallback(async (name: string, args: Record<string, unknown>) => {
    if (!active()) return null;
    const subject = await captureAccountBoundSupabaseMutationSubject(ownerId);
    if (!active()) return null;
    const response = await invokeAccountBoundSupabaseMutationRpc<ExportJob>(subject, name, args);
    if (!active()) return null;
    if (response.error) throw new Error(response.error.message || "export_unavailable");
    return response.data;
  }, [active, ownerId]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    let reading = false;
    const refresh = async () => {
      if (!videoId || !active() || reading || inFlight.current) return;
      reading = true;
      try { const result = await call("read_creator_clip_export", { p_video_id: videoId }); if (active()) { setJob(result); setStatusKnown(true); } }
      catch { /* An unavailable status is not evidence of success or failure. */ }
      finally { reading = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const resume = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { focused.current = false; clearInterval(timer); resume.remove(); };
  }, [active, call, videoId]));
  const perform = async (cancel: boolean) => {
    if (inFlight.current || !active() || !videoId || (!cancel && !saved)) return;
    inFlight.current = true; setBusy(true); setNotice("");
    try {
      const spec = JSON.stringify({ videoId, clipFormat: edit.clipFormat, fitMode: edit.fitMode,
        trimStartMs: edit.trimStartMs ?? null, trimEndMs: edit.trimEndMs ?? null,
        brandMarkEnabled: edit.brandMarkEnabled ?? false, brandAssetId: edit.brandAssetId ?? null });
      // Only retries of the identical intent reuse its durable operation ID.
      if (!cancel && attemptSpec.current !== spec) { attempt.current = null; attemptSpec.current = spec; }
      attempt.current ??= requestId();
      const result = cancel && job
        ? await call("cancel_creator_clip_export", { p_job_id: job.id })
        : await call("request_creator_clip_export", { p_video_id: videoId, p_request_id: attempt.current,
          p_edit: { clip_format: edit.clipFormat, fit_mode: edit.fitMode, trim_start_ms: edit.trimStartMs ?? null,
            trim_end_ms: edit.trimEndMs ?? null, brand_mark_enabled: edit.brandMarkEnabled ?? false, brand_asset_id: edit.brandAssetId ?? null } });
      if (!active()) return;
      setJob(result);
      if (cancel) attempt.current = null;
    } catch (error) {
      if (!active()) return;
      const message = error instanceof Error ? error.message : "";
      setNotice(Object.entries(notices).find(([code]) => message.includes(code))?.[1]
        ?? "Export could not be confirmed. Retry to check the same request without creating a duplicate.");
    } finally { inFlight.current = false; if (current.current && sameAccountSessionAuthority(authority.current, getCurrentAccountSessionAuthoritySnapshot())) setBusy(false); }
  };
  const pending = job?.status === "queued" || job?.status === "rendering";
  return <View style={{ gap: 10, marginTop: 12 }}>
    <Text style={{ color: "#fff", fontWeight: "700" }}>Export a new video</Text>
    <Text style={{ color: "#cbd5e1" }}>Applies the saved trim, frame and optional approved brand mark to a new private draft. Your original stays unchanged. Review and publish the exported draft separately.</Text>
    {!saved || !videoId ? <Text style={{ color: "#cbd5e1" }}>Save Draft before exporting these changes.</Text> : null}
    {job ? <Text accessibilityLiveRegion="polite" style={{ color: "#fff" }}>{({queued:"Export queued",rendering:"Rendering your video…",ready:"Latest export ready in Content Library. Later edits require a new export.",failed:"Export failed. Your original is safe.",canceled:"Export canceled",stale:"Source changed. Save the current edit and export again."})[job.status]}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: "#fbbf24" }}>{notice}</Text> : null}
    {pending ? <AppActionButton label="Cancel Export" disabled={busy} onPress={() => void perform(true)} />
      : <AppActionButton label={busy || (videoId && !statusKnown) ? "Checking Export…" : "Export Video"} disabled={busy || !saved || !videoId || !statusKnown}
        onPress={() => { if (job && ["ready","failed","canceled","stale"].includes(job.status)) attempt.current = null; void perform(false); }} />}
    {job?.status === "ready" && job.outputVideoId ? <AppActionButton label="Review Exported Draft" onPress={() => { if (active() && job.outputVideoId) onReview(job.outputVideoId); }} /> : null}
  </View>;
}
