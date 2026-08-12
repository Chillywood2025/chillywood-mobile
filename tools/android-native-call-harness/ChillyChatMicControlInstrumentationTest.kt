package com.chillywood.mobile

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.MediaConstraints
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnectionFactory

@RunWith(AndroidJUnit4::class)
class ChillyChatMicControlInstrumentationTest {
  private lateinit var factory: PeerConnectionFactory
  private lateinit var source: AudioSource
  private lateinit var track: AudioTrack

  @Before
  fun createNativeWebRtcAudioTrack() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    PeerConnectionFactory.initialize(
      PeerConnectionFactory.InitializationOptions.builder(context).createInitializationOptions(),
    )
    factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
    source = factory.createAudioSource(MediaConstraints())
    track = factory.createAudioTrack("assurance-audio", source)
  }

  @After
  fun releaseNativeWebRtcAudioTrack() {
    track.dispose()
    source.dispose()
    factory.dispose()
  }

  @Test
  fun nativeAudioTrackMutesAndUnmutesWithoutTermination() {
    assertTrue(track.enabled())
    assertTrue(track.setEnabled(false))
    assertFalse(track.enabled())
    assertEquals(MediaStreamTrack.State.LIVE, track.state())
    assertTrue(track.setEnabled(true))
    assertTrue(track.enabled())
    assertEquals(MediaStreamTrack.State.LIVE, track.state())
  }

  @Test
  fun repeatedToggleRemainsLiveAndDeterministic() {
    repeat(20) { index ->
      val enabled = index % 2 != 0
      assertTrue(track.setEnabled(enabled))
      assertEquals(enabled, track.enabled())
      assertEquals(MediaStreamTrack.State.LIVE, track.state())
    }
  }

  @Test
  fun duplicateMuteAndUnmuteAreIdempotent() {
    assertTrue(track.setEnabled(false))
    assertFalse(track.setEnabled(false))
    assertFalse(track.enabled())
    assertTrue(track.setEnabled(true))
    assertFalse(track.setEnabled(true))
    assertTrue(track.enabled())
  }

  @Test
  fun audioToggleDoesNotCreateVideoOrNetworkAuthority() {
    assertTrue(track.setEnabled(false))
    assertEquals("audio", track.kind())
    assertEquals(MediaStreamTrack.State.LIVE, track.state())
  }
}
