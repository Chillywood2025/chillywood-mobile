import { useIsFocused } from '@react-navigation/native';
import type { AVPlaybackStatus } from 'expo-av';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { readCurrentAccountSessionAuthority, sameAccountSessionAuthority } from './accountSessionAuthority';
import { createNotificationViewProgress } from './notificationViewProgress.mjs';
import { useSession } from './session';
import { supabase } from './supabase';

export function useNotificationViewTracking(kind: 'video' | 'spectator', sourceId: string | null, enabled = true) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const lifetime = useMemo(() => ({ authority, authorityStatus, kind, sourceId }), [authority, authorityStatus, kind, sourceId]);
  const latestLifetime = useRef(lifetime);
  latestLifetime.current = lifetime;
  const tracker = useRef<{ lifetime: object; progress: ReturnType<typeof createNotificationViewProgress> } | null>(null);
  const active = useRef(false);
  active.current = enabled && focused && authorityStatus === 'active';
  useEffect(() => {
    if (!sourceId || !authority || authorityStatus !== 'active' || authority.restoreOnly) return;
    const expected = authority;
    let disposed = false;
    const eligible = () => !disposed && latestLifetime.current === lifetime && active.current && AppState.currentState === 'active';
    const current = async () => eligible()
      && sameAccountSessionAuthority(expected, await readCurrentAccountSessionAuthority()) && eligible();
    const progress = createNotificationViewProgress({
      begin: async () => {
        if (!await current()) return null;
        const result = kind === 'video'
          ? await supabase.rpc('begin_video_notification_view', { p_video_id: sourceId })
          : await supabase.rpc('begin_spectator_notification_view', { p_record_id: sourceId });
        return result.error || !await current() ? null : result.data;
      },
      complete: async (viewId: string) => {
        if (!await current()) return false;
        const result = await supabase.rpc('complete_content_notification_view', { p_view_id: viewId });
        return !result.error && result.data === true && await current();
      },
    });
    const owned = { lifetime, progress };
    tracker.current = owned;
    const subscription = AppState.addEventListener('change', () => progress.pause());
    return () => {
      disposed = true; progress.dispose(); subscription.remove();
      if (tracker.current === owned) tracker.current = null;
    };
  }, [authority, authorityStatus, kind, sourceId, lifetime]);
  useEffect(() => { if (!active.current) tracker.current?.progress.pause(); }, [enabled, focused, authorityStatus]);
  return useCallback((status: AVPlaybackStatus) => {
    const owned = tracker.current;
    if (latestLifetime.current === lifetime && owned?.lifetime === lifetime) {
      owned.progress.observe(status, active.current && AppState.currentState === 'active');
    }
  }, [lifetime]);
}
