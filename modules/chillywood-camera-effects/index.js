import { requireOptionalNativeModule } from "expo-modules-core";

// Older installed binaries and web stay usable; an OTA cannot add this module.
export default requireOptionalNativeModule("ChillywoodCameraEffects");
