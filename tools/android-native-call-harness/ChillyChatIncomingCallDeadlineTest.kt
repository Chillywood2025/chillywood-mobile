package com.chillywood.mobile

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class ChillyChatIncomingCallDeadlineTest {
  private val now = 1_780_000_000_000L
  private val elapsed = 50_000L
  private fun serverDate(time: Long) = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }.format(Date(time))

  @Test
  fun preservesFullNinetySecondServerLifetimeAndDelayedDeliveryRemainder() {
    val expiresAt = serverDate(now + 90_000L)
    assertEquals(90_000L, ChillyChatIncomingCallDeadline.resolve(expiresAt, now, elapsed)?.remainingMs)
    assertEquals(37_000L, ChillyChatIncomingCallDeadline.resolve(expiresAt, now + 53_000L, elapsed + 53_000L)?.remainingMs)
  }

  @Test
  fun acceptsPostgresFractionalUtcAndOffsetDateRepresentations() {
    val canonical = serverDate(now + 90_000L)
    val microseconds = canonical.replace(".000Z", ".000123+00:00")
    val offsetFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("GMT-05:00")
    }
    for (input in listOf(canonical, microseconds, canonical.replace(".000Z", "Z"), offsetFormat.format(Date(now + 90_000L)))) {
      assertEquals(input, 90_000L, ChillyChatIncomingCallDeadline.resolve(input, now, elapsed)?.remainingMs)
    }
  }

  @Test
  fun rejectsMissingMalformedExpiredAndUnreasonablyDistantValues() {
    for (input in listOf(null, "", "tomorrow", "2026-02-30T12:00:00Z", "2026-09-27T12:00:00", "2026-09-27T12:00:00+99:00", serverDate(now), serverDate(now - 1), serverDate(now + 120_001L))) {
      assertNull(input, ChillyChatIncomingCallDeadline.resolve(input, now, elapsed))
    }
    assertNotNull(ChillyChatIncomingCallDeadline.resolve(serverDate(now + 1), now, elapsed))
  }

  @Test
  fun duplicateCannotExtendOriginalDeadlineEvenWhenPayloadChanges() {
    val first = ChillyChatIncomingCallDeadline.resolve(serverDate(now + 90_000L), now, elapsed)!!
    val duplicate = ChillyChatIncomingCallDeadline.resolve(
      serverDate(now + 100_000L), now + 20_000L, elapsed + 20_000L, first.expiresAtMs, first.elapsedDeadlineMs,
    )!!
    assertEquals(first.expiresAtMs, duplicate.expiresAtMs)
    assertEquals(first.elapsedDeadlineMs, duplicate.elapsedDeadlineMs)
    assertEquals(70_000L, duplicate.remainingMs)
  }

  @Test
  fun elapsedClockPreventsWallClockRollbackExtendingDuplicate() {
    val first = ChillyChatIncomingCallDeadline.resolve(serverDate(now + 90_000L), now, elapsed)!!
    val duplicate = ChillyChatIncomingCallDeadline.resolve(
      serverDate(now + 90_000L), now - 10_000L, elapsed + 20_000L, first.expiresAtMs, first.elapsedDeadlineMs,
    )!!
    assertEquals(70_000L, duplicate.remainingMs)
    assertNull(ChillyChatIncomingCallDeadline.resolve(
      serverDate(now + 90_000L), now, elapsed + 90_000L, first.expiresAtMs, first.elapsedDeadlineMs,
    ))
  }

  @Test
  fun shorterDeadlineWinsAndExpiredPreviousDeadlineNeverRestarts() {
    val first = ChillyChatIncomingCallDeadline.resolve(serverDate(now + 90_000L), now, elapsed)!!
    assertEquals(10_000L, ChillyChatIncomingCallDeadline.resolve(
      serverDate(now + 30_000L), now + 20_000L, elapsed + 20_000L, first.expiresAtMs, first.elapsedDeadlineMs,
    )?.remainingMs)
    assertNull(ChillyChatIncomingCallDeadline.resolve(
      serverDate(now + 110_000L), now + 90_000L, elapsed + 90_000L, first.expiresAtMs, first.elapsedDeadlineMs,
    ))
  }
}
