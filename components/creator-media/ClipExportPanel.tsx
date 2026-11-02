import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AppActionButton } from "../ui/app-surface";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "../../_lib/accountBoundSupabaseMutation";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
import type { ClipStudioEditPatch } from "../../_lib/clipStudio";

type ExportJob = {
  id: string; status: "queued" | "rendering" | "ready" | "failed" | "canceled" | "stale"; outputVideoId: string | null;
  displayState?: "queued" | "rendering" | "technical_delay" | "terminal"; errorCode?: string | null;
};
const requestId = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === "x" ? n : (n & 3) | 8).toString(16);
});
const notices: Record<string, string> = {
  clip_export_worker_unavailable: "Video exporting is temporarily unavailable. Your saved original and edits are safe. Try again later.",
  clip_export_capacity_exhausted: "The export queue is full. This request was not added. Your saved original and edits are safe. Try again later.",
  clip_export_admission_paused: "New exports are temporarily paused. This request was not added. Your saved original and edits are safe. Try again later.",
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
  const responseGeneration = useRef(0);
  const attempt = useRef<string | null>(null);
  const attemptSpec = useRef<string | null>(null);
  const authority = useRef(getCurrentAccountSessionAuthoritySnapshot());
  useEffect(() => { current.current = true; return () => { current.current = false; }; }, []);
  const active = useCallback(() => current.current && focused.current && AppState.currentState === "active"
    && sameAccountSessionAuthority(authority.current, getCurrentAccountSessionAuthoritySnapshot()), []);
  const call = useCallback(async (name: string, args: Record<string, unknown>) => {
    if (!active()) return null;
    const generation = responseGeneration.current;
    const subject = await captureAccountBoundSupabaseMutationSubject(ownerId);
    if (!active() || generation !== responseGeneration.current) return null;
    const response = await invokeAccountBoundSupabaseMutationRpc<ExportJob>(subject, name, args);
    if (!active() || generation !== responseGeneration.current) return null;
    if (response.error) throw new Error(response.error.message || "export_unavailable");
    return response.data;
  }, [active, ownerId]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    responseGeneration.current++;
    let reading = false;
    const refresh = async () => {
      if (!videoId || !active() || reading || inFlight.current) return;
      reading = true;
      const generation = responseGeneration.current;
      try { const result = await call("read_creator_clip_export", { p_video_id: videoId }); if (active() && generation === responseGeneration.current) { setJob(result); setStatusKnown(true); } }
      catch { /* An unavailable status is not evidence of success or failure. */ }
      finally { reading = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const resume = AppState.addEventListener("change", state => {
      if (state === "active") void refresh();
      else responseGeneration.current++;
    });
    return () => { focused.current = false; responseGeneration.current++; clearInterval(timer); resume.remove(); };
  }, [active, call, videoId]));
  const perform = async (cancel: boolean) => {
    if (inFlight.current || !active() || !videoId || (!cancel && !saved)) return;
    // A poll already on the wire cannot replace the result of a newer intent.
    const generation = ++responseGeneration.current;
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
      if (!active() || generation !== responseGeneration.current) return;
      setJob(result);
      if (cancel) attempt.current = null;
    } catch (error) {
      if (!active() || generation !== responseGeneration.current) return;
      const message = error instanceof Error ? error.message : "";
      setNotice(Object.entries(notices).find(([code]) => message.includes(code))?.[1]
        ?? "Export could not be confirmed. Retry to check the same request without creating a duplicate.");
    } finally { inFlight.current = false; if (current.current && sameAccountSessionAuthority(authority.current, getCurrentAccountSessionAuthoritySnapshot())) setBusy(false); }
  };
  const pending = job?.status === "queued" || job?.status === "rendering";
  // Optional backend health is presentation-only. Terminal/ready results always
  // win, and old backends continue to use the durable status without guessing.
  const jobMessage = !job ? "" : pending && job.displayState === "technical_delay"
    ? "Export is delayed by a processing issue. Your request and original are safe."
    : job.status === "failed" && job.errorCode === "output_reconciliation_required"
      ? "Export needs a processing review. Your original is safe."
      : job.status === "failed" && ["hdr_dolby_vision_unqualified", "hdr_color_metadata_unqualified"].includes(job.errorCode ?? "")
        ? "This HDR format is not yet qualified for export. Your original HDR video is unchanged. Processing support is needed before exporting this source."
      : job.status === "failed" && job.errorCode === "hdr_conversion_unavailable"
        ? "HDR export is unavailable because the renderer needs attention. Your original HDR video is unchanged. Wait for processing support before trying this export again."
      : job.status === "stale" && job.errorCode === "output_unavailable"
        ? "Exported draft is no longer available. Export again to create a new draft."
      : ({queued:"Export queued. Your request is saved and waiting for an available renderer.",rendering:"Rendering your video…",ready:"Latest export ready in Content Library. Later edits require a new export.",failed:"Export failed. Your original is safe.",canceled:"Export canceled",stale:"Source changed. Save the current edit and export again."})[job.status];
  return <View style={{ gap: 10, marginTop: 12 }}>
    <Text style={{ color: "#fff", fontWeight: "700" }}>Export a new video</Text>
    <Text style={{ color: "#cbd5e1" }}>Applies the saved trim, frame and optional approved brand mark to a new private draft. Your original stays unchanged. Review and publish the exported draft separately.</Text>
    {!saved || !videoId ? <Text style={{ color: "#cbd5e1" }}>Save Draft before exporting these changes.</Text> : null}
    {job ? <Text accessibilityLiveRegion="polite" style={{ color: "#fff" }}>{jobMessage}</Text> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: "#fbbf24" }}>{notice}</Text> : null}
    {pending ? <AppActionButton label="Cancel Export" disabled={busy} onPress={() => void perform(true)} />
      : <AppActionButton label={busy || (videoId && !statusKnown) ? "Checking Export…" : "Export Video"} disabled={busy || !saved || !videoId || !statusKnown}
        onPress={() => { if (job && ["ready","failed","canceled","stale"].includes(job.status)) attempt.current = null; void perform(false); }} />}
    {job?.status === "ready" && job.outputVideoId ? <AppActionButton label="Review Exported Draft" onPress={() => { if (active() && job.outputVideoId) onReview(job.outputVideoId); }} /> : null}
  </View>;
}
