package expo.modules.chillywoodexternalcontentlinks;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import com.android.billingclient.api.*;

/** Separate short-lived listener-free client; RevenueCat remains owner of native purchases. */
public final class GooglePlayTransport implements ExternalLinkFlow.Transport {
  public interface ActivityProvider { Activity current(); }
  private final ActivityProvider activities;
  private final BillingClient client;
  private boolean closed;
  private boolean disconnected;
  private ExternalLinkFlow.Result activeResult;
  public GooglePlayTransport(Context context, ActivityProvider activities) {
    this.activities = activities;
    // The params overload shown by newer docs does not exist in pinned 8.2.1.
    client = BillingClient.newBuilder(context.getApplicationContext())
      .enableBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK).build();
  }
  private boolean available() {
    Activity activity = activities.current();
    return !closed && activity != null && !activity.isFinishing() && !activity.isDestroyed();
  }
  private static String error(BillingResult result) {
    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) return null;
    if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) return "ECL_CANCELLED";
    return "ECL_PLAY_" + result.getResponseCode();
  }
  public void prepare(ExternalLinkFlow.Result result) {
    activeResult = result;
    if (!available()) { result.complete("ECL_ACTIVITY_UNAVAILABLE", null); return; }
    client.startConnection(new BillingClientStateListener() {
      public void onBillingServiceDisconnected() {
        disconnected = true;
        if (!closed && activeResult != null) activeResult.complete("ECL_SERVICE_DISCONNECTED", null);
      }
      public void onBillingSetupFinished(BillingResult setup) {
        if (closed) return;
        if (error(setup) != null) { result.complete(error(setup), null); return; }
        if (!available()) { result.complete("ECL_ACTIVITY_UNAVAILABLE", null); return; }
        try {
          client.isBillingProgramAvailableAsync(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK,
            (eligibility, details) -> {
              if (closed) return;
              if (error(eligibility) != null) { result.complete(error(eligibility), null); return; }
              if (!available()) { result.complete("ECL_ACTIVITY_UNAVAILABLE", null); return; }
              try {
                client.createBillingProgramReportingDetailsAsync(
                  BillingProgramReportingDetailsParams.newBuilder()
                    .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK).build(),
                  (reporting, tokenDetails) -> {
                    if (closed) return;
                    if (error(reporting) != null) { result.complete(error(reporting), null); return; }
                    result.complete(null, tokenDetails == null ? null : tokenDetails.getExternalTransactionToken());
                  });
              } catch (RuntimeException ignored) { result.complete("ECL_TOKEN_UNAVAILABLE", null); }
            });
        } catch (RuntimeException ignored) { result.complete("ECL_UNAVAILABLE", null); }
      }
    });
  }
  public void launch(String url, ExternalLinkFlow.Result result) {
    activeResult = result;
    if (!available() || disconnected || !client.isReady()) {
      result.complete("ECL_ACTIVITY_UNAVAILABLE", null); return;
    }
    Uri uri = Uri.parse(url);
    String path = uri.getPath();
    if (!"https".equals(uri.getScheme()) || !"checkout.stripe.com".equals(uri.getHost())
        || uri.getUserInfo() != null || uri.getPort() != -1
        || path == null || !(path.startsWith("/c/pay/") || path.startsWith("/pay/"))) {
      result.complete("ECL_INVALID_CHECKOUT_URL", null); return;
    }
    LaunchExternalLinkParams params = LaunchExternalLinkParams.newBuilder()
      .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
      .setLinkUri(uri)
      .setLinkType(LaunchExternalLinkParams.LinkType.LINK_TO_DIGITAL_CONTENT_OFFER)
      .setLaunchMode(LaunchExternalLinkParams.LaunchMode.LAUNCH_IN_EXTERNAL_BROWSER_OR_APP).build();
    client.launchExternalLink(activities.current(), params, launched -> {
      if (!closed) result.complete(error(launched), null);
    });
  }
  public void close() {
    if (closed) return;
    closed = true;
    activeResult = null;
    client.endConnection();
  }
}
