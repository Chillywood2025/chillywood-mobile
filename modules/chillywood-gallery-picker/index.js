import { requireOptionalNativeModule } from "expo-modules-core";

// Old binaries and iOS deliberately return null; never pretend OTA installed it.
export default requireOptionalNativeModule("ChillywoodGalleryPicker");
