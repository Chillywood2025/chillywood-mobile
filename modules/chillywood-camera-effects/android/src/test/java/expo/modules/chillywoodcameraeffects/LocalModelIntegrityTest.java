package expo.modules.chillywoodcameraeffects;

import java.nio.file.Files;
import java.nio.file.Path;

/** Does not construct an interpreter or execute any SDK/model. */
public final class LocalModelIntegrityTest {
  public static void main(String[] args) throws Exception {
    Path assets = Path.of(args[0]);
    byte[] face = Files.readAllBytes(assets.resolve(LocalCameraInference.FACE_ASSET));
    byte[] mask = Files.readAllBytes(assets.resolve(LocalCameraInference.MASK_ASSET));
    if (LocalCameraInference.verifiedModel(face, LocalCameraInference.FACE_SHA256).remaining() != face.length)
      throw new AssertionError("face model bytes");
    if (LocalCameraInference.verifiedModel(mask, LocalCameraInference.MASK_SHA256).remaining() != mask.length)
      throw new AssertionError("mask model bytes");
    face[face.length / 2] ^= 1;
    try { LocalCameraInference.verifiedModel(face, LocalCameraInference.FACE_SHA256); throw new AssertionError("corruption accepted"); }
    catch (IllegalArgumentException expected) { /* required fail-closed */ }
    try { LocalCameraInference.verifiedModel(new byte[0], LocalCameraInference.MASK_SHA256); throw new AssertionError("empty model accepted"); }
    catch (IllegalArgumentException expected) { /* required fail-closed */ }
    System.out.println("Bundled model integrity: exact assets accepted; corrupted/empty rejected");
  }
}
