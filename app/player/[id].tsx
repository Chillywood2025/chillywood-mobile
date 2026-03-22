import { ResizeMode, Video, type AVPlaybackStatus } from "expo-av";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderEvent,
} from "react-native";

import { titles } from "../../_data/titles";
import { getVideoSource } from "../../_lib/mediaSources";
import { supabase } from "../../_lib/supabase";
import {
  clearProgressForTitle,
  readMergedWatchProgress,
  readMyListIds,
  toggleMyListTitle,
  writeProgressForTitle,
} from "../../_lib/userData";
import { createPartyRoom, getSafePartyUserId } from "../../_lib/watchParty";

const ACCENT = "#DC143C";
const BG = "#0B0B10";
const STEP_MILLIS = 10_000;
const SWIPE_PIXELS_PER_STEP = 30;
const MAX_ZOOM = 2.5;
const MIN_ZOOM = 1;
const PROGRESS_WRITE_INTERVAL = 4_000;
const CONTROLS_AUTO_HIDE_MILLIS = 3_000;
const NEXT_AUTOPLAY_DELAY_MILLIS = 1_500;
const UP_NEXT_TRIGGER_MILLIS = 12_000;
const UP_NEXT_COUNTDOWN_SECONDS = 5;
const PAN_SCRUB_SEEK_THROTTLE_MILLIS = 16;
const PAN_SCRUB_MIN_DRAG_PIXELS = 4;
const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const;
const UUID_LIKE_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TitleRow = {
  id: string;
  title: string;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
  thumbnail_url?: string | null;
  video_url?: string | null;
  video?: any;
};

const BASE_SELECT = "id,title,category,year,runtime,synopsis,poster_url,thumbnail_url,video_url";
const ADVANCED_SELECT = `${BASE_SELECT},status,is_published,release_at,release_date`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatTime = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const touchDistance = (touches: readonly { pageX: number; pageY: number }[]) => {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = b.pageX - a.pageX;
  const dy = b.pageY - a.pageY;
  return Math.sqrt(dx * dx + dy * dy);
};

export default function PlayerScreen() {
  const { id } = useLocalSearchParams();
  let rawId = id;
  if (typeof rawId !== "string") rawId = String(rawId ?? "");
  const cleanId = rawId.replace(/["']/g, "").trim();

  console.log("PLAYER ID:", cleanId);

  const localExactIdMatch = titles.find((t: any) => String(t.id) === cleanId);
  const localSlugMatch = localExactIdMatch ? null : titles.find((t: any) => String(t.slug) === cleanId);
  const localTitleMatch =
    localExactIdMatch || localSlugMatch
      ? null
      : titles.find((t: any) => String(t.title).toLowerCase() === cleanId.toLowerCase());
  const localTitle = (localExactIdMatch ?? localSlugMatch ?? localTitleMatch ?? null) as any;
  const localMatchSource = localExactIdMatch
    ? "local:id"
    : localSlugMatch
      ? "local:slug"
      : localTitleMatch
        ? "local:title"
        : "none";
  const fallbackTitle = (titles[0] as any) ?? null;
  const fallbackVideo = getVideoSource(localTitle ?? fallbackTitle ?? {});

  const videoRef = useRef<Video>(null);
  const [item, setItem] = useState<TitleRow | null>(null);
  const [titleLoading, setTitleLoading] = useState(true);

  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [positionMillis, setPositionMillis] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [myListIds, setMyListIds] = useState<string[]>([]);
  const [myListBusy, setMyListBusy] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<string | null>(null);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(UP_NEXT_COUNTDOWN_SECONDS);
  const [upNextCanceled, setUpNextCanceled] = useState(false);
  const seekFeedbackOpacity = useRef(new Animated.Value(0)).current;

  const zoomScale = useRef(new Animated.Value(1)).current;
  const zoomScaleValueRef = useRef(1);
  const durationRef = useRef(0);
  const currentPositionRef = useRef(0);
  const lastProgressWriteAtRef = useRef(0);
  const lastPersistedPositionRef = useRef(0);
  const lastPlaybackIsPlayingRef = useRef(false);
  const resumePositionRef = useRef(0);
  const didJustFinishRef = useRef(false);
  const swipeLastAppliedStepRef = useRef(0);
  const progressTrackLayoutRef = useRef<{ width: number } | null>(null);
  const wasPlayingBeforeScrubRef = useRef(false);
  const pinchStartDistanceRef = useRef<number | null>(null);
  const pinchStartScaleRef = useRef(1);
  const seekFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideControlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextAutoplayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upNextIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldAutoplayNextRef = useRef(false);
  const hasNavigatedToNextRef = useRef(false);
  const lastTapRef = useRef(0);
  const videoWidthRef = useRef(0);
  const panScrubStartPositionRef = useRef(0);
  const panScrubLastSeekAtRef = useRef(0);
  const panScrubSeekInFlightRef = useRef(false);
  const panIsScrubbingRef = useRef(false);
  const panWasPlayingBeforeScrubRef = useRef(false);

  const titleId = useMemo(
    () => String(item?.id ?? (localTitle as any)?.id ?? (fallbackTitle as any)?.id ?? cleanId).trim(),
    [item?.id, localTitle, fallbackTitle, cleanId],
  );
  const inMyList = useMemo(() => (titleId ? myListIds.includes(titleId) : false), [myListIds, titleId]);
  const nextTitle = useMemo(() => {
    const index = titles.findIndex((entry) => String(entry.id) === titleId);
    if (index < 0 || index >= titles.length - 1) return null;
    return titles[index + 1] ?? null;
  }, [titleId]);
  const nextTitleId = useMemo(() => {
    if (!nextTitle) return "";
    return String(nextTitle.id ?? "").trim();
  }, [nextTitle]);

  useEffect(() => {
    const listener = zoomScale.addListener(({ value }) => {
      zoomScaleValueRef.current = value;
      setZoomLevel(value);
    });

    return () => {
      zoomScale.removeListener(listener);
    };
  }, [zoomScale]);

  useEffect(() => {
    let active = true;

    const loadTitle = async () => {
      const routeId = cleanId || String((localTitle as any)?.id ?? (fallbackTitle as any)?.id ?? "").trim();
      setTitleLoading(true);
      setItem(null);

      if (!routeId) {
        if ((localTitle || fallbackTitle) && active) {
          const chosen = (localTitle ?? fallbackTitle) as any;
          console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
          setItem({
            id: String(chosen.id),
            title: String(chosen.title),
            runtime: chosen.runtime,
            synopsis: chosen.description,
            category: chosen.genre,
            video: chosen.video,
          });
        }
        setTitleLoading(false);
        return;
      }

      try {
        const primary = await supabase
          .from("titles")
          .select(ADVANCED_SELECT)
          .eq("id", routeId)
          .maybeSingle();

        if (primary.data && !primary.error) {
          if (active) {
            console.log("PLAYER MATCH SOURCE: matched from", "db:advanced:id");
            setItem(primary.data as TitleRow);
            setTitleLoading(false);
          }
          return;
        }

        const fallback = await supabase
          .from("titles")
          .select(BASE_SELECT)
          .eq("id", routeId)
          .maybeSingle();

        if (fallback.data && !fallback.error) {
          if (active) {
            console.log("PLAYER MATCH SOURCE: matched from", "db:base:id");
            setItem(fallback.data as TitleRow);
            setTitleLoading(false);
          }
          return;
        }

        if ((localTitle || fallbackTitle) && active) {
          const chosen = (localTitle ?? fallbackTitle) as any;
          console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
          setItem({
            id: String(chosen.id),
            title: String(chosen.title),
            runtime: chosen.runtime,
            synopsis: chosen.description,
            category: chosen.genre,
            video: chosen.video,
          });
          setTitleLoading(false);
          return;
        }

        if (active) {
          if (active) {
            setItem((current) => current ?? null);
            setTitleLoading(false);
          }
        }
      } catch {
        if (active) {
          if (localTitle || fallbackTitle) {
            const chosen = (localTitle ?? fallbackTitle) as any;
            console.log("PLAYER MATCH SOURCE: matched from", localTitle ? localMatchSource : "local:fallback:first-title");
            setItem({
              id: String(chosen.id),
              title: String(chosen.title),
              runtime: chosen.runtime,
              synopsis: chosen.description,
              category: chosen.genre,
              video: chosen.video,
            });
          }
          setTitleLoading(false);
        }
      }
    };

    loadTitle();

    return () => {
      active = false;
    };
  }, [cleanId, localMatchSource, localTitle, fallbackTitle]);

  useEffect(() => {
    let active = true;

    const loadMyList = async () => {
      try {
        const ids = await readMyListIds();
        if (active) setMyListIds(ids);
      } catch {
        if (active) setMyListIds([]);
      }
    };

    loadMyList();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadResume = async () => {
      if (!titleId) {
        resumePositionRef.current = 0;
        return;
      }

      try {
        const merged = await readMergedWatchProgress();
        if (!active) return;
        resumePositionRef.current = Math.max(0, merged[titleId]?.positionMillis ?? 0);
      } catch {
        if (!active) return;
        resumePositionRef.current = 0;
      }
    };

    loadResume();
    return () => {
      active = false;
    };
  }, [titleId]);

  useEffect(() => {
    return () => {
      if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (hideControlsTimeoutRef.current) clearTimeout(hideControlsTimeoutRef.current);
      if (nextAutoplayTimeoutRef.current) clearTimeout(nextAutoplayTimeoutRef.current);
      if (upNextIntervalRef.current) clearInterval(upNextIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    shouldAutoplayNextRef.current = false;
    hasNavigatedToNextRef.current = false;
    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    setUpNextCanceled(false);

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }

    return () => {
      shouldAutoplayNextRef.current = false;
      hasNavigatedToNextRef.current = false;
      if (upNextIntervalRef.current) {
        clearInterval(upNextIntervalRef.current);
        upNextIntervalRef.current = null;
      }
      if (nextAutoplayTimeoutRef.current) {
        clearTimeout(nextAutoplayTimeoutRef.current);
        nextAutoplayTimeoutRef.current = null;
      }
    };
  }, [titleId]);

  useEffect(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (!isPlaying) {
      setControlsVisible(true);
      return;
    }

    if (!controlsVisible) return;

    hideControlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
      hideControlsTimeoutRef.current = null;
    }, CONTROLS_AUTO_HIDE_MILLIS);

    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
        hideControlsTimeoutRef.current = null;
      }
    };
  }, [controlsVisible, isPlaying]);

  useEffect(() => {
    return () => {
      if (!titleId) return;
      const duration = durationRef.current;
      const position = currentPositionRef.current;

      if (duration > 0 && position / duration >= 0.95) {
        clearProgressForTitle(titleId).catch(() => {});
      } else {
        writeProgressForTitle(titleId, position, duration || undefined).catch(() => {});
      }
    };
  }, [titleId]);

  const persistProgress = useCallback(
    (position: number, duration: number) => {
      if (!titleId) return;

      if (duration > 0 && position / duration >= 0.95) {
        clearProgressForTitle(titleId).catch(() => {});
        lastPersistedPositionRef.current = 0;
        return;
      }

      writeProgressForTitle(titleId, position, duration || undefined).catch(() => {});
      lastPersistedPositionRef.current = position;
    },
    [titleId],
  );

  const showSeekFeedback = useCallback(
    (deltaMillis: number) => {
      const seconds = Math.abs(Math.round(deltaMillis / 1000));
      const label = deltaMillis >= 0 ? `+${seconds}s` : `-${seconds}s`;
      setSeekFeedback(label);

      if (seekFeedbackTimeoutRef.current) {
        clearTimeout(seekFeedbackTimeoutRef.current);
      }

      seekFeedbackOpacity.stopAnimation();
      seekFeedbackOpacity.setValue(1);

      seekFeedbackTimeoutRef.current = setTimeout(() => {
        Animated.timing(seekFeedbackOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          setSeekFeedback(null);
        });
      }, 800);
    },
    [seekFeedbackOpacity],
  );

  const applySeekDelta = useCallback(
    async (deltaMillis: number) => {
      const duration = durationRef.current;
      const current = currentPositionRef.current;
      const max = duration > 0 ? duration : current + Math.abs(deltaMillis) + STEP_MILLIS;
      const next = clamp(current + deltaMillis, 0, Math.max(0, max));

      try {
        await videoRef.current?.setPositionAsync(next);
      } catch {
        return;
      }

      currentPositionRef.current = next;
      setPositionMillis(next);
      showSeekFeedback(deltaMillis);
      persistProgress(next, duration);
    },
    [persistProgress, showSeekFeedback],
  );

  const animateZoomTo = useCallback(
    (next: number) => {
      Animated.timing(zoomScale, {
        toValue: clamp(next, MIN_ZOOM, MAX_ZOOM),
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    },
    [zoomScale],
  );

  const resetAutoHideTimer = useCallback(() => {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
      hideControlsTimeoutRef.current = null;
    }

    if (isPlaying && controlsVisible) {
      hideControlsTimeoutRef.current = setTimeout(() => {
        setControlsVisible(false);
        hideControlsTimeoutRef.current = null;
      }, CONTROLS_AUTO_HIDE_MILLIS);
    }
  }, [controlsVisible, isPlaying]);

  const handleSingleTap = useCallback(() => {
    setControlsVisible((value) => !value);

    if (!isVideoReady) return;
    if (shouldAutoplayNextRef.current && nextTitleId) return;

    const reachedEnd =
      didJustFinishRef.current ||
      (durationRef.current > 0 && currentPositionRef.current >= durationRef.current - 1500);

    if (reachedEnd) {
      videoRef.current
        ?.setPositionAsync(0)
        .then(() => videoRef.current?.playAsync())
        .then(() => {
          didJustFinishRef.current = false;
          currentPositionRef.current = 0;
          setPositionMillis(0);
          setIsPlaying(true);
          if (titleId) writeProgressForTitle(titleId, 0, durationRef.current || undefined).catch(() => {});
        })
        .catch(() => {});
      return;
    }

    if (isPlaying) {
      videoRef.current?.pauseAsync().catch(() => {});
    } else {
      videoRef.current?.playAsync().catch(() => {});
    }
  }, [isPlaying, isVideoReady, nextTitleId, titleId]);

  const resetGestureState = useCallback(() => {
    swipeLastAppliedStepRef.current = 0;
    pinchStartDistanceRef.current = null;
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (event, gestureState) => {
          return event.nativeEvent.touches.length >= 2 || Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8;
        },
        onPanResponderGrant: () => {
          resetAutoHideTimer();
          swipeLastAppliedStepRef.current = 0;
          pinchStartDistanceRef.current = null;
          panScrubStartPositionRef.current = currentPositionRef.current;
          panScrubLastSeekAtRef.current = 0;
          panIsScrubbingRef.current = false;
          panWasPlayingBeforeScrubRef.current = false;
        },
        onPanResponderMove: (event: GestureResponderEvent, gestureState) => {
          const touches = event.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = touchDistance(touches);
            if (!distance) return;

            if (!pinchStartDistanceRef.current) {
              pinchStartDistanceRef.current = distance;
              pinchStartScaleRef.current = zoomScaleValueRef.current;
              return;
            }

            const ratio = distance / pinchStartDistanceRef.current;
            const nextScale = clamp(pinchStartScaleRef.current * ratio, MIN_ZOOM, MAX_ZOOM);
            zoomScale.setValue(nextScale);
            return;
          }

          pinchStartDistanceRef.current = null;
          const duration = durationRef.current;
          if (duration <= 0) return;
          if (Math.abs(gestureState.dx) < PAN_SCRUB_MIN_DRAG_PIXELS) return;
          if (Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) return;

          if (!panIsScrubbingRef.current) {
            panIsScrubbingRef.current = true;
            panWasPlayingBeforeScrubRef.current = isPlaying;
            if (isPlaying) {
              videoRef.current?.pauseAsync().catch(() => {});
            }
          }

          const positionFromDelta = panScrubStartPositionRef.current + (gestureState.dx / SWIPE_PIXELS_PER_STEP) * STEP_MILLIS;
          const nextPosition = clamp(positionFromDelta, 0, duration);

          currentPositionRef.current = nextPosition;
          setPositionMillis(nextPosition);

          const now = Date.now();
          if (panScrubSeekInFlightRef.current) return;
          if (now - panScrubLastSeekAtRef.current < PAN_SCRUB_SEEK_THROTTLE_MILLIS) return;

          panScrubLastSeekAtRef.current = now;
          panScrubSeekInFlightRef.current = true;

          videoRef.current
            ?.setPositionAsync(nextPosition)
            .catch(() => {})
            .finally(() => {
              panScrubSeekInFlightRef.current = false;
            });
        },
        onPanResponderRelease: (event, gestureState) => {
          resetAutoHideTimer();
          if (panIsScrubbingRef.current) {
            const finalPosition = currentPositionRef.current;
            videoRef.current
              ?.setPositionAsync(finalPosition)
              .then(() => {
                persistProgress(finalPosition, durationRef.current);
                if (panWasPlayingBeforeScrubRef.current) {
                  return videoRef.current?.playAsync();
                }
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;

            if (zoomScaleValueRef.current <= 1.05) {
              animateZoomTo(1);
            }
            resetGestureState();
            return;
          }

          const isTap = Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10;

          if (isTap && isVideoReady) {
            const now = Date.now();
            const isDoubleTap = now - lastTapRef.current <= 250;

            if (isDoubleTap) {
              if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
              }

              lastTapRef.current = 0;
              const half = (videoWidthRef.current || 1) / 2;
              const isLeftSide = event.nativeEvent.locationX <= half;
              applySeekDelta(isLeftSide ? -STEP_MILLIS : STEP_MILLIS).catch(() => {});
            } else {
              lastTapRef.current = now;
              singleTapTimeoutRef.current = setTimeout(() => {
                singleTapTimeoutRef.current = null;
                handleSingleTap();
              }, 250);
            }
          }

          if (zoomScaleValueRef.current <= 1.05) {
            animateZoomTo(1);
          }
          resetGestureState();
        },
        onPanResponderTerminate: () => {
          resetAutoHideTimer();
          if (panIsScrubbingRef.current) {
            const finalPosition = currentPositionRef.current;
            videoRef.current
              ?.setPositionAsync(finalPosition)
              .then(() => {
                persistProgress(finalPosition, durationRef.current);
                if (panWasPlayingBeforeScrubRef.current) {
                  return videoRef.current?.playAsync();
                }
              })
              .catch(() => {});

            panIsScrubbingRef.current = false;
            panWasPlayingBeforeScrubRef.current = false;
          }

          if (zoomScaleValueRef.current <= 1.05) {
            animateZoomTo(1);
          }
          resetGestureState();
        },
      }),
    [
      animateZoomTo,
      applySeekDelta,
      handleSingleTap,
      isPlaying,
      isVideoReady,
      persistProgress,
      resetAutoHideTimer,
      resetGestureState,
      zoomScale,
    ],
  );

  const progressScrubResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        },
        onPanResponderGrant: async () => {
          resetAutoHideTimer();
          wasPlayingBeforeScrubRef.current = isPlaying;
          if (isPlaying) await videoRef.current?.pauseAsync().catch(() => {});
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          resetAutoHideTimer();
          const layout = progressTrackLayoutRef.current;
          if (!layout) return;

          const x = event.nativeEvent.locationX;
          const duration = durationRef.current;
          if (duration <= 0 || !layout.width) return;

          const percent = clamp(x / layout.width, 0, 1);
          const newPosition = percent * duration;
          currentPositionRef.current = newPosition;
          setPositionMillis(newPosition);
        },
        onPanResponderRelease: async () => {
          resetAutoHideTimer();
          try {
            await videoRef.current?.setPositionAsync(currentPositionRef.current);
            persistProgress(currentPositionRef.current, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) await videoRef.current?.playAsync();
          } catch {
            // ignore errors on seek
          }
        },
        onPanResponderTerminate: async () => {
          resetAutoHideTimer();
          try {
            await videoRef.current?.setPositionAsync(currentPositionRef.current);
            persistProgress(currentPositionRef.current, durationRef.current);
            if (wasPlayingBeforeScrubRef.current) await videoRef.current?.playAsync();
          } catch {
            // ignore errors on seek
          }
        },
      }),
    [isPlaying, persistProgress, resetAutoHideTimer],
  );

  const navigateToNext = useCallback(() => {
    if (!nextTitleId || hasNavigatedToNextRef.current) return;

    hasNavigatedToNextRef.current = true;
    shouldAutoplayNextRef.current = false;

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }

    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    router.replace({ pathname: "/player/[id]", params: { id: nextTitleId } });
  }, [nextTitleId]);

  const startUpNextCountdown = useCallback(() => {
    if (!nextTitleId || upNextCanceled || hasNavigatedToNextRef.current) return;

    shouldAutoplayNextRef.current = true;
    setShowUpNext(true);

    setUpNextCountdown((current) => {
      if (current > 0) return current;
      return UP_NEXT_COUNTDOWN_SECONDS;
    });

    if (upNextIntervalRef.current) return;

    upNextIntervalRef.current = setInterval(() => {
      setUpNextCountdown((current) => {
        if (current <= 1) {
          if (upNextIntervalRef.current) {
            clearInterval(upNextIntervalRef.current);
            upNextIntervalRef.current = null;
          }
          navigateToNext();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  }, [navigateToNext, nextTitleId, upNextCanceled]);

  const cancelUpNext = useCallback(() => {
    setUpNextCanceled(true);
    setShowUpNext(false);
    setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
    shouldAutoplayNextRef.current = false;

    if (upNextIntervalRef.current) {
      clearInterval(upNextIntervalRef.current);
      upNextIntervalRef.current = null;
    }

    if (nextAutoplayTimeoutRef.current) {
      clearTimeout(nextAutoplayTimeoutRef.current);
      nextAutoplayTimeoutRef.current = null;
    }
  }, []);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsPlaying(false);
        return;
      }

      const duration = status.durationMillis ?? 0;
      const position = status.positionMillis ?? 0;
      durationRef.current = duration;
      currentPositionRef.current = position;
      setDurationMillis(duration);
      setPositionMillis(position);
      setIsPlaying(status.isPlaying);

      const wasPlaying = lastPlaybackIsPlayingRef.current;
      lastPlaybackIsPlayingRef.current = status.isPlaying;

      if (duration > 0 && position < duration - 1500) {
        didJustFinishRef.current = false;
      }

      const remainingMillis = duration > 0 ? Math.max(0, duration - position) : 0;
      const shouldShowUpNext =
        !!nextTitleId &&
        !upNextCanceled &&
        !didJustFinishRef.current &&
        duration > 0 &&
        remainingMillis > 0 &&
        remainingMillis <= UP_NEXT_TRIGGER_MILLIS;

      if (shouldShowUpNext) {
        startUpNextCountdown();
      } else if (!didJustFinishRef.current && remainingMillis > UP_NEXT_TRIGGER_MILLIS) {
        if (upNextIntervalRef.current) {
          clearInterval(upNextIntervalRef.current);
          upNextIntervalRef.current = null;
        }
        setShowUpNext(false);
        setUpNextCountdown(UP_NEXT_COUNTDOWN_SECONDS);
        shouldAutoplayNextRef.current = false;
      }

      if (titleId && duration > 0) {
        const now = Date.now();
        const positionDelta = Math.abs(position - lastPersistedPositionRef.current);
        const shouldPersistByTime = now - lastProgressWriteAtRef.current >= PROGRESS_WRITE_INTERVAL;
        const shouldPersistByDelta = positionDelta >= 1000;

        if (status.isPlaying && (shouldPersistByTime || shouldPersistByDelta)) {
          lastProgressWriteAtRef.current = now;
          persistProgress(position, duration);
        }

        if (wasPlaying && !status.isPlaying) {
          persistProgress(position, duration);
        }
      }

      if (status.didJustFinish) {
        didJustFinishRef.current = true;
        setIsPlaying(false);
        videoRef.current?.pauseAsync().catch(() => {});
        if (titleId) clearProgressForTitle(titleId).catch(() => {});

        if (nextTitleId) {
          if (!upNextCanceled && !hasNavigatedToNextRef.current) {
            shouldAutoplayNextRef.current = true;
            if (nextAutoplayTimeoutRef.current) clearTimeout(nextAutoplayTimeoutRef.current);
            nextAutoplayTimeoutRef.current = setTimeout(() => {
              nextAutoplayTimeoutRef.current = null;
              if (!upNextCanceled && !hasNavigatedToNextRef.current) {
                navigateToNext();
              }
            }, NEXT_AUTOPLAY_DELAY_MILLIS);
          }
        }
      }
    },
    [navigateToNext, nextTitleId, persistProgress, startUpNextCountdown, titleId, upNextCanceled],
  );

  const onVideoLoad = useCallback(
    async (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      setIsVideoReady(true);
      setIsPlaying(status.isPlaying);

      const duration = status.durationMillis ?? 0;
      durationRef.current = duration;
      setDurationMillis(duration);

      let startAt = 0;
      const resume = Math.max(0, resumePositionRef.current || 0);
      const resumePercent = duration > 0 ? resume / duration : 0;
      if (duration > 0 && resume > 0 && resumePercent < 0.95) {
        startAt = resume;
      }

      if (startAt > 0) {
        await videoRef.current?.setPositionAsync(startAt);
        currentPositionRef.current = startAt;
        setPositionMillis(startAt);
        lastPersistedPositionRef.current = startAt;
      } else {
        lastPersistedPositionRef.current = 0;
      }

      await videoRef.current?.setRateAsync(playbackRate, true);
    },
    [playbackRate],
  );

  const togglePlayPause = useCallback(async () => {
    if (!isVideoReady) return;

    try {
      if (isPlaying) {
        await videoRef.current?.pauseAsync();
        persistProgress(currentPositionRef.current, durationRef.current);
      } else {
        await videoRef.current?.playAsync();
      }
    } catch {
      // ignore transient player errors
    }
  }, [isPlaying, isVideoReady, persistProgress]);

  const replayFromStart = useCallback(async () => {
    try {
      await videoRef.current?.setPositionAsync(0);
      await videoRef.current?.playAsync();
      didJustFinishRef.current = false;
      currentPositionRef.current = 0;
      lastPersistedPositionRef.current = 0;
      setPositionMillis(0);
      setIsPlaying(true);
      if (titleId) writeProgressForTitle(titleId, 0, durationRef.current || undefined).catch(() => {});
    } catch {
      // ignore transient player errors
    }
  }, [titleId]);

  const onToggleMyList = useCallback(async () => {
    if (!titleId || myListBusy) return;

    setMyListBusy(true);
    try {
      const ids = await toggleMyListTitle(titleId, {
        title: item?.title,
        posterUrl: item?.poster_url ?? undefined,
        thumbnailUrl: item?.thumbnail_url ?? undefined,
      });
      setMyListIds(ids);
    } finally {
      setMyListBusy(false);
    }
  }, [item?.poster_url, item?.thumbnail_url, item?.title, myListBusy, titleId]);

  const onWatchParty = useCallback(async () => {
    if (!titleId) {
      console.log("WATCH PARTY: missing titleId, fallback to /watch-party");
      router.push("/watch-party");
      return;
    }

    try {
      const hostUserId = await getSafePartyUserId();
      const preferredRawId = String(item?.id ?? "").trim();
      const fallbackRawId = String(titleId ?? "").trim();

      let createTitleId = preferredRawId || fallbackRawId;

      if (!UUID_LIKE_REGEX.test(createTitleId)) {
        const titleNameCandidate = String(item?.title ?? (localTitle as any)?.title ?? (fallbackTitle as any)?.title ?? "").trim();
        if (titleNameCandidate) {
          try {
            const byName = await supabase
              .from("titles")
              .select("id")
              .eq("title", titleNameCandidate)
              .maybeSingle();

            const dbTitleId = String(byName.data?.id ?? "").trim();
            if (dbTitleId) createTitleId = dbTitleId;
          } catch {
            // keep existing createTitleId
          }
        }
      }

      console.log("WATCH PARTY: creating room", {
        titleId: createTitleId,
        hostUserId,
        positionMillis: currentPositionRef.current,
        playbackState: isPlaying ? "playing" : "paused",
      });

      const room = await createPartyRoom(createTitleId, hostUserId, currentPositionRef.current, isPlaying ? "playing" : "paused");
      console.log("WATCH PARTY: createPartyRoom returned", room);

      if (room && "partyId" in room && room.partyId) {
        const navParams = {
          roomId: room.partyId,
          roomCode: room.roomCode,
          titleId: room.titleId || createTitleId,
        };
        console.log("WATCH PARTY: navigating with params", navParams);
        router.push({ pathname: "/watch-party", params: navParams });
        return;
      }
    } catch {
      // fallback navigation below
    }

    console.log("WATCH PARTY: room creation failed, fallback to /watch-party");
    router.push("/watch-party");
  }, [isPlaying, titleId, item?.title, localTitle, fallbackTitle]);

  const onSelectRate = useCallback(async (rate: number) => {
    resetAutoHideTimer();
    setPlaybackRate(rate);
    setSpeedMenuOpen(false);
    try {
      await videoRef.current?.setRateAsync(rate, true);
    } catch {
      // ignore unsupported rate transitions
    }
  }, [resetAutoHideTimer]);

  const progressPercent = useMemo(() => {
    if (!durationMillis || durationMillis <= 0) return 0;
    return clamp((positionMillis / durationMillis) * 100, 0, 100);
  }, [durationMillis, positionMillis]);

  const displayItem = useMemo<TitleRow | null>(() => {
    if (item) return item;
    if (!localTitle && !fallbackTitle) return null;

    const chosen = (localTitle ?? fallbackTitle) as any;

    return {
      id: String(chosen.id ?? ""),
      title: String(chosen.title ?? "Now Playing"),
      runtime: chosen.runtime,
      synopsis: chosen.description,
      category: chosen.genre,
      video: chosen.video,
    };
  }, [item, localTitle, fallbackTitle]);

  const source = useMemo(() => {
    if (displayItem?.video_url && displayItem.video_url.trim()) return { uri: displayItem.video_url.trim() };
    return displayItem?.video || fallbackVideo;
  }, [displayItem?.video, displayItem?.video_url, fallbackVideo]);

  useEffect(() => {
    const sourceLabel = source
      ? typeof source === "number"
        ? "bundle:require"
        : typeof source === "object" && source && "uri" in source
          ? `remote:${String((source as { uri?: unknown }).uri ?? "")}`
          : "object:unknown"
      : "none";
    console.log("PLAYER VIDEO SOURCE:", sourceLabel);
  }, [source]);

  if (titleLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.text}>Loading title…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.header}>{displayItem?.title ?? "Now Playing"}</Text>

        {source ? (
          <View
            style={styles.videoWrap}
            {...panResponder.panHandlers}
            onLayout={(event) => {
              videoWidthRef.current = event.nativeEvent.layout.width;
            }}
          >
            <Animated.View style={[styles.videoAnimatedWrap, { transform: [{ scale: zoomScale }] }]}> 
              <Video
                ref={videoRef}
                source={source}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={onPlaybackStatusUpdate}
                onLoad={onVideoLoad}
              />
            </Animated.View>

            {seekFeedback ? (
              <Animated.View style={[styles.seekFeedback, { opacity: seekFeedbackOpacity }]}> 
                <Text style={styles.seekFeedbackText}>{seekFeedback}</Text>
              </Animated.View>
            ) : null}

            {showUpNext && nextTitle ? (
              <View style={styles.upNextOverlay}>
                <Text style={styles.upNextLabel}>Up Next</Text>
                <Text style={styles.upNextTitle} numberOfLines={1}>{String(nextTitle.title ?? "Next Title")}</Text>
                <Text style={styles.upNextCountdown}>Playing in {upNextCountdown}s</Text>
                <View style={styles.upNextActions}>
                  <TouchableOpacity style={styles.upNextPrimaryBtn} onPress={navigateToNext} activeOpacity={0.9}>
                    <Text style={styles.upNextPrimaryBtnText}>Play Now</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.upNextSecondaryBtn} onPress={cancelUpNext} activeOpacity={0.85}>
                    <Text style={styles.upNextSecondaryBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.text}>No video attached</Text>
        )}

        {controlsVisible ? (
          <>
            <View style={styles.progressMetaRow}>
              <Text style={styles.progressTime}>{formatTime(positionMillis)}</Text>
              <Text style={styles.progressTime}>{formatTime(durationMillis)}</Text>
            </View>
            <View
              style={styles.progressTrack}
              {...progressScrubResponder.panHandlers}
              onLayout={(event) => {
                progressTrackLayoutRef.current = { width: event.nativeEvent.layout.width };
              }}
            >
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>

            {zoomLevel > 1.01 ? (
              <View style={styles.controlsRow}>
                <TouchableOpacity style={styles.controlBtn} onPress={() => animateZoomTo(1)}>
                  <Text style={styles.controlBtnText}>Reset Zoom</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.speedWrap}>
              <Text style={styles.speedLabel}>Playback Speed</Text>
              <TouchableOpacity
                style={[styles.speedChip, styles.speedSelectorButton]}
                onPress={() => setSpeedMenuOpen((value) => !value)}
                activeOpacity={0.85}
              >
                <Text style={[styles.speedChipText, styles.speedChipTextActive]}>{playbackRate}x</Text>
              </TouchableOpacity>

              {speedMenuOpen ? (
                <View style={styles.speedMenu}>
                  {SPEED_OPTIONS.map((option) => {
                    const active = playbackRate === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        style={[styles.speedChip, active && styles.speedChipActive]}
                        onPress={() => onSelectRate(option)}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.speedChipText, active && styles.speedChipTextActive]}>{option}x</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.secondaryBtn, myListBusy && styles.secondaryBtnDisabled]}
                onPress={onToggleMyList}
                disabled={myListBusy}
              >
                <Text style={styles.secondaryBtnText}>{inMyList ? "✓ My List" : "+ My List"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryBtn} onPress={onWatchParty}>
                <Text style={styles.secondaryBtnText}>Watch Party</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={togglePlayPause}>
                <Text style={styles.secondaryBtnText}>{isPlaying ? "Pause" : "Play"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={replayFromStart}>
                <Text style={styles.secondaryBtnText}>Replay</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  header: { color: "white", fontSize: 24, fontWeight: "900", marginBottom: 14 },
  text: { color: "#D6D6D6", fontSize: 14, marginBottom: 10 },

  videoWrap: {
    width: "100%",
    height: 268,
    borderRadius: 16,
    backgroundColor: "black",
    marginBottom: 14,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  videoAnimatedWrap: {
    width: "100%",
    height: "100%",
  },
  video: {
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  seekFeedback: {
    position: "absolute",
    alignSelf: "center",
    top: "42%",
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  seekFeedbackText: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  upNextOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(10,10,14,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  upNextLabel: {
    color: "#D7DAE2",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  upNextTitle: {
    marginTop: 4,
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  upNextCountdown: {
    marginTop: 4,
    color: "#BFC3CF",
    fontSize: 12,
    fontWeight: "700",
  },
  upNextActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  upNextPrimaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  upNextPrimaryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  upNextSecondaryBtn: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  upNextSecondaryBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },

  progressMetaRow: {
    marginTop: 2,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressTime: {
    color: "#B9BCC6",
    fontSize: 12,
    fontWeight: "700",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: ACCENT,
    borderRadius: 999,
  },

  controlsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  controlBtn: {
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  controlBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  speedWrap: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  speedLabel: {
    color: "#DBDCE1",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  speedChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  speedChipActive: {
    borderColor: "rgba(220,20,60,0.8)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  speedChipText: {
    color: "#C8CBD5",
    fontSize: 12,
    fontWeight: "800",
  },
  speedChipTextActive: {
    color: "#fff",
  },
  speedSelectorButton: {
    alignSelf: "flex-start",
  },
  speedMenu: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  secondaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  secondaryBtnDisabled: {
    opacity: 0.6,
  },
  secondaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  fallbackActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  backBtn: {
    alignSelf: "flex-start",
    backgroundColor: ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginTop: 4,
  },
  backText: { color: "white", fontWeight: "900" },
});