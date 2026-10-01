import { useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera as ExpoCamera,
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Camera,
  CircleAlert,
  CircleCheck,
  ExternalLink,
  Flashlight,
  FolderOpen,
  Image as ImageIcon,
  RotateCcw,
  ScanLine,
  Share2,
} from "lucide-react-native";

type ScanSource = "camera" | "photos" | "files";

type ScanResult = {
  data: string;
  source: ScanSource;
};

type ImageCandidates = {
  matches: BarcodeScanningResult[];
  source: Exclude<ScanSource, "camera">;
};

const colors = {
  paper: "#F4F3EC",
  white: "#FFFFFF",
  ink: "#19271F",
  muted: "#68756E",
  line: "#DDE2D8",
  forest: "#173D30",
  lime: "#D8EE76",
  coral: "#E87556",
  preview: "#21382E",
};

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [imageCandidates, setImageCandidates] =
    useState<ImageCandidates | null>(null);
  const [busy, setBusy] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanLocked = useRef(false);

  const handleLiveScan = ({ data }: BarcodeScanningResult) => {
    if (scanLocked.current || busy || result) return;
    scanLocked.current = true;
    setScanError(null);
    setResult({ data, source: "camera" });
  };

  const scanImage = async (
    selectImage: () => Promise<string | undefined>,
    source: Exclude<ScanSource, "camera">,
  ) => {
    if (busy) return;
    scanLocked.current = true;
    setBusy(true);
    setScanError(null);

    try {
      const uri = await selectImage();
      if (!uri) {
        scanLocked.current = false;
        return;
      }

      const matches = await ExpoCamera.scanFromURLAsync(uri, ["qr"]);
      if (Platform.OS === "android" && matches.length < 2) {
        const { width, height } = await new Promise<{
          width: number;
          height: number;
        }>((resolve, reject) => {
          Image.getSize(
            uri,
            (imageWidth, imageHeight) => {
              resolve({ width: imageWidth, height: imageHeight });
            },
            reject,
          );
        });
        const seenData = new Set(matches.map(({ data }) => data));
        const gridSize = 3;
        const overlap = 0.2;
        const cropWidth = Math.ceil(
          width / (gridSize - (gridSize - 1) * overlap),
        );
        const cropHeight = Math.ceil(
          height / (gridSize - (gridSize - 1) * overlap),
        );

        for (let row = 0; row < gridSize; row += 1) {
          for (let column = 0; column < gridSize; column += 1) {
            const originX = Math.round(
              (column * (width - cropWidth)) / (gridSize - 1),
            );
            const originY = Math.round(
              (row * (height - cropHeight)) / (gridSize - 1),
            );
            const { uri: croppedUri } = await ImageManipulator.manipulateAsync(
              uri,
              [
                {
                  crop: {
                    originX,
                    originY,
                    width: cropWidth,
                    height: cropHeight,
                  },
                },
              ],
              { format: ImageManipulator.SaveFormat.PNG },
            );
            const croppedMatches = await ExpoCamera.scanFromURLAsync(
              croppedUri,
              ["qr"],
            );

            for (const match of croppedMatches) {
              if (!seenData.has(match.data)) {
                matches.push(match);
                seenData.add(match.data);
              }
            }
          }
        }
      }

      if (matches.length === 0) {
        setScanError(
          "No QR code found. Try a clearer image with the whole code visible.",
        );
        scanLocked.current = false;
        return;
      }

      if (matches.length === 1) {
        setResult({ data: matches[0].data, source });
      } else {
        setImageCandidates({ matches, source });
      }
    } catch {
      setScanError(
        "That image could not be read. Try another image or browse a downloaded copy.",
      );
      scanLocked.current = false;
    } finally {
      setBusy(false);
    }
  };

  const pickFromPhotos = () =>
    scanImage(async () => {
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        selectionLimit: 1,
      });
      return selection.canceled ? undefined : selection.assets[0]?.uri;
    }, "photos");

  const pickFromFiles = () =>
    scanImage(async () => {
      const selection = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        copyToCacheDirectory: true,
      });
      return selection.canceled ? undefined : selection.assets[0]?.uri;
    }, "files");

  const startAgain = () => {
    scanLocked.current = false;
    setResult(null);
    setImageCandidates(null);
    setScanError(null);
    setTorchEnabled(false);
  };

  const chooseCandidate = (data: string, source: ImageCandidates["source"]) => {
    setResult({ data, source });
    setImageCandidates(null);
  };

  const shareResult = async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.data });
    } catch {
      setScanError("The share sheet could not be opened.");
    }
  };

  const openResult = async () => {
    if (!result || !/^https?:\/\//i.test(result.data)) return;
    try {
      await Linking.openURL(result.data);
    } catch {
      setScanError("This link could not be opened on your device.");
    }
  };

  const requestCameraAccess = async () => {
    if (permission?.canAskAgain === false) {
      await Linking.openSettings();
      return;
    }
    await requestPermission();
  };

  const sourceLabel =
    result?.source === "camera"
      ? "Live camera"
      : result?.source === "photos"
        ? "Photo library"
        : "Device files";
  const isWebLink = result !== null && /^https?:\/\//i.test(result.data);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <View style={styles.brandMark}>
                <ScanLine color={colors.lime} size={22} strokeWidth={2.4} />
              </View>
              <Text style={styles.brandName}>QR PLUS</Text>
            </View>
            <View style={styles.headerStatus}>
              <View style={styles.statusDot} />
              <Text style={styles.headerStatusText}>READY TO SCAN</Text>
            </View>
          </View>

          <View style={styles.intro}>
            <Text style={styles.eyebrow}>QR CODE READER</Text>
            <Text style={styles.title}>Scan a code.</Text>
            <Text style={styles.subtitle}>
              Use your camera, or bring in an image from this phone.
            </Text>
          </View>

          <View style={styles.preview}>
            {result || imageCandidates ? (
              <View style={styles.capturedState}>
                <View style={styles.capturedIcon}>
                  <CircleCheck
                    color={colors.lime}
                    size={34}
                    strokeWidth={1.8}
                  />
                </View>
                <Text style={styles.capturedTitle}>
                  {result
                    ? "Code captured"
                    : `${imageCandidates?.matches.length ?? 0} codes found`}
                </Text>
                <Text style={styles.capturedHint}>
                  {result
                    ? "Your result is ready below."
                    : "Choose the one you want below."}
                </Text>
              </View>
            ) : busy ? (
              <View style={styles.centerState}>
                <ActivityIndicator color={colors.lime} size="large" />
                <Text style={styles.previewStateTitle}>Reading image</Text>
                <Text style={styles.previewStateHint}>
                  Looking for QR codes
                </Text>
              </View>
            ) : permission?.granted ? (
              <>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleLiveScan}
                  onMountError={({ message }) => setScanError(message)}
                />
                <View pointerEvents="none" style={styles.cameraShade} />
                <View style={styles.previewTopRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE SCANNER</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      torchEnabled ? "Turn torch off" : "Turn torch on"
                    }
                    onPress={() => setTorchEnabled((enabled) => !enabled)}
                    style={({ pressed }) => [
                      styles.torchButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Flashlight
                      color={torchEnabled ? colors.lime : colors.white}
                      size={19}
                    />
                  </Pressable>
                </View>
                <View pointerEvents="none" style={styles.scanFrame}>
                  <View style={[styles.frameCorner, styles.frameTopLeft]} />
                  <View style={[styles.frameCorner, styles.frameTopRight]} />
                  <View style={[styles.frameCorner, styles.frameBottomLeft]} />
                  <View style={[styles.frameCorner, styles.frameBottomRight]} />
                </View>
                <View pointerEvents="none" style={styles.previewCaption}>
                  <Text style={styles.previewCaptionText}>
                    Align the code inside the frame
                  </Text>
                </View>
              </>
            ) : (
              <View style={styles.centerState}>
                <View style={styles.permissionIcon}>
                  <Camera color={colors.lime} size={25} />
                </View>
                <Text style={styles.previewStateTitle}>
                  Camera access needed
                </Text>
                <Text style={styles.previewStateHint}>
                  Allow access to scan a code live.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={requestCameraAccess}
                  style={({ pressed }) => [
                    styles.permissionButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.permissionButtonText}>
                    {permission?.canAskAgain === false
                      ? "Open settings"
                      : "Enable camera"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.importHeading}>
            <Text style={styles.sectionTitle}>SCAN FROM AN IMAGE</Text>
            <Text style={styles.sectionHint}>Photos or downloads</Text>
          </View>

          <View style={styles.importActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={pickFromPhotos}
              style={({ pressed }) => [
                styles.importButton,
                pressed && styles.pressed,
                busy && styles.disabledButton,
              ]}
            >
              <View style={styles.importIcon}>
                <ImageIcon color={colors.forest} size={19} strokeWidth={2} />
              </View>
              <Text style={styles.importButtonText}>Photo library</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={pickFromFiles}
              style={({ pressed }) => [
                styles.importButton,
                pressed && styles.pressed,
                busy && styles.disabledButton,
              ]}
            >
              <View style={[styles.importIcon, styles.fileIcon]}>
                <FolderOpen color={colors.forest} size={19} strokeWidth={2} />
              </View>
              <Text style={styles.importButtonText}>Browse files</Text>
            </Pressable>
          </View>

          {imageCandidates ? (
            <View style={styles.candidatesSection}>
              <Text style={styles.sectionTitle}>CHOOSE A QR CODE</Text>
              <Text style={styles.candidatesHint}>
                Select the code whose contents you want to view.
              </Text>
              <View style={styles.candidatesList}>
                {imageCandidates.matches.map((candidate, index) => (
                  <Pressable
                    accessibilityRole="button"
                    key={`${index}-${candidate.data}`}
                    onPress={() =>
                      chooseCandidate(candidate.data, imageCandidates.source)
                    }
                    style={({ pressed }) => [
                      styles.candidateButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.candidateNumber}>
                      <Text style={styles.candidateNumberText}>
                        {index + 1}
                      </Text>
                    </View>
                    <View style={styles.candidateCopy}>
                      <Text style={styles.candidateTitle}>
                        QR code {index + 1}
                      </Text>
                      <Text numberOfLines={2} style={styles.candidateData}>
                        {candidate.data}
                      </Text>
                    </View>
                    <ExternalLink color={colors.forest} size={17} />
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={startAgain}
                style={({ pressed }) => [
                  styles.cancelSelection,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.cancelSelectionText}>Cancel selection</Text>
              </Pressable>
            </View>
          ) : null}

          {scanError ? (
            <View style={styles.errorBanner}>
              <CircleAlert color={colors.coral} size={18} />
              <Text style={styles.errorText}>{scanError}</Text>
            </View>
          ) : null}

          {result ? (
            <View style={styles.resultSection}>
              <View style={styles.resultHeading}>
                <View>
                  <Text style={styles.sectionTitle}>SCAN RESULT</Text>
                  <Text style={styles.resultSource}>From {sourceLabel}</Text>
                </View>
                <View style={styles.resultCheck}>
                  <CircleCheck color={colors.forest} size={19} />
                </View>
              </View>
              <Text selectable style={styles.resultData}>
                {result.data}
              </Text>
              <View style={styles.resultActions}>
                {isWebLink ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={openResult}
                    style={({ pressed }) => [
                      styles.openButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <ExternalLink color={colors.white} size={17} />
                    <Text style={styles.openButtonText}>Open link</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={shareResult}
                  style={({ pressed }) => [
                    styles.shareButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Share2 color={colors.forest} size={17} />
                  <Text style={styles.shareButtonText}>Share</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan another code"
                  onPress={startAgain}
                  style={({ pressed }) => [
                    styles.resetButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <RotateCcw color={colors.forest} size={18} />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerText}>QR PLUS</Text>
            <Text style={styles.footerText}>·</Text>
            <Text style={styles.footerText}>ON-DEVICE SCANNING</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  page: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 34,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  headerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#E7EBDD",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#4C875D",
  },
  headerStatusText: {
    color: colors.forest,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  intro: {
    marginBottom: 19,
  },
  eyebrow: {
    color: colors.coral,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.25,
    marginBottom: 8,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 40,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
  },
  preview: {
    width: "100%",
    aspectRatio: 0.98,
    borderRadius: 23,
    overflow: "hidden",
    backgroundColor: colors.preview,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(16, 32, 25, 0.22)",
  },
  previewTopRow: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "rgba(18, 36, 28, 0.72)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lime,
  },
  liveText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  torchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18, 36, 28, 0.72)",
  },
  scanFrame: {
    width: "66%",
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  frameCorner: {
    position: "absolute",
    width: 25,
    height: 25,
    borderColor: colors.lime,
  },
  frameTopLeft: {
    top: -1,
    left: -1,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 11,
  },
  frameTopRight: {
    top: -1,
    right: -1,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 11,
  },
  frameBottomLeft: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 11,
  },
  frameBottomRight: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 11,
  },
  previewCaption: {
    position: "absolute",
    bottom: 19,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "rgba(18, 36, 28, 0.72)",
  },
  previewCaptionText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: "600",
  },
  centerState: {
    alignItems: "center",
    paddingHorizontal: 26,
  },
  permissionIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "rgba(216,238,118,0.13)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  previewStateTitle: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  previewStateHint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 6,
  },
  permissionButton: {
    backgroundColor: colors.lime,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 18,
  },
  permissionButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  capturedState: {
    alignItems: "center",
  },
  capturedIcon: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(216,238,118,0.13)",
    marginBottom: 15,
  },
  capturedTitle: {
    color: colors.white,
    fontSize: 19,
    fontWeight: "700",
  },
  capturedHint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    marginTop: 6,
  },
  importHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 25,
    marginBottom: 11,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sectionHint: {
    color: colors.muted,
    fontSize: 11,
  },
  importActions: {
    flexDirection: "row",
    gap: 10,
  },
  importButton: {
    flex: 1,
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 8,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 16,
  },
  importIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EFD4",
  },
  fileIcon: {
    backgroundColor: "#F9E9DF",
  },
  importButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  candidatesSection: {
    marginTop: 23,
  },
  candidatesHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  candidatesList: {
    gap: 8,
    marginTop: 12,
  },
  candidateButton: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  candidateNumber: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7EBDD",
  },
  candidateNumberText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: "800",
  },
  candidateCopy: {
    flex: 1,
    gap: 4,
  },
  candidateTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  candidateData: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  cancelSelection: {
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 5,
  },
  cancelSelectionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.78,
  },
  disabledButton: {
    opacity: 0.55,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#F9E9DF",
    borderRadius: 13,
    padding: 12,
    marginTop: 13,
  },
  errorText: {
    flex: 1,
    color: "#744332",
    fontSize: 12,
    lineHeight: 17,
  },
  resultSection: {
    marginTop: 27,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  resultHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultSource: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 5,
  },
  resultCheck: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: "#E7EBDD",
    alignItems: "center",
    justifyContent: "center",
  },
  resultData: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: colors.white,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    marginTop: 14,
    overflow: "hidden",
  },
  resultActions: {
    flexDirection: "row",
    gap: 9,
    marginTop: 12,
  },
  openButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.forest,
    borderRadius: 14,
  },
  openButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  shareButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E7EBDD",
    borderRadius: 14,
  },
  shareButtonText: {
    color: colors.forest,
    fontSize: 13,
    fontWeight: "700",
  },
  resetButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
  },
  footerLine: {
    width: 19,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.coral,
  },
  footerText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
});
