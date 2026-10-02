import type { MicVAD } from "@ricky0123/vad-web";
import { emitPhantomEvent } from "./event-bus";
import { floatArrayToWav } from "@/lib/utils";
import { getVadAssetOptions } from "@/lib/vad";

const VAD_SAMPLE_RATE = 16000;
const DEFAULT_MAX_RECORDING_SECS = 180;

type CaptureVadConfig = {
  enabled?: boolean;
  max_recording_duration_secs?: number;
};

let captureStream: MediaStream | null = null;
let captureVad: MicVAD | null = null;
let isContinuous = false;
let continuousFrames: Float32Array[] = [];
let continuousSampleCount = 0;
let progressTimer: number | null = null;
let maxDurationTimer: number | null = null;

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(String(reader.result || "").split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function emitSpeech(samples: Float32Array) {
  if (!samples.length) {
    emitPhantomEvent("speech-discarded", "empty");
    return;
  }
  try {
    const wav = floatArrayToWav(samples, VAD_SAMPLE_RATE, "wav");
    emitPhantomEvent("speech-detected", await blobToBase64(wav));
  } catch (error) {
    emitPhantomEvent(
      "audio-encoding-error",
      error instanceof Error ? error.message : String(error)
    );
  }
}

function takeContinuousAudio() {
  const merged = new Float32Array(continuousSampleCount);
  let offset = 0;
  for (const frame of continuousFrames) {
    merged.set(frame, offset);
    offset += frame.length;
  }
  continuousFrames = [];
  continuousSampleCount = 0;
  return merged;
}

function clearTimers() {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
  if (maxDurationTimer !== null) {
    window.clearTimeout(maxDurationTimer);
    maxDurationTimer = null;
  }
}

async function getLoopbackAudioStream() {
  captureStream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true,
  });
  for (const track of captureStream.getVideoTracks()) {
    track.enabled = false;
  }

  const audioTracks = captureStream.getAudioTracks();
  if (!audioTracks.length) {
    captureStream.getTracks().forEach((track) => track.stop());
    captureStream = null;
    throw new Error("No system audio track was captured.");
  }
  return new MediaStream(audioTracks);
}

async function teardownCapture() {
  clearTimers();
  const vad = captureVad;
  captureVad = null;
  if (vad) {
    await vad.destroy().catch(() => {});
  }
  captureStream?.getTracks().forEach((track) => track.stop());
  captureStream = null;
}

async function startSystemAudioCapture(args: Record<string, unknown>) {
  if (captureVad) {
    await teardownCapture();
  }

  const vadConfig = (args.vadConfig || {}) as CaptureVadConfig;
  isContinuous = vadConfig.enabled === false;
  continuousFrames = [];
  continuousSampleCount = 0;

  const audioStream = await getLoopbackAudioStream();

  try {
    const { MicVAD } = await import("@ricky0123/vad-web");
    captureVad = await MicVAD.new({
      ...getVadAssetOptions(),
      startOnLoad: false,
      getStream: async () => audioStream,
      pauseStream: async () => {},
      resumeStream: async () => audioStream,
      redemptionMs: 900,
      minSpeechMs: 300,
      onFrameProcessed: (_probabilities, frame) => {
        if (!isContinuous) return;
        continuousFrames.push(frame.slice());
        continuousSampleCount += frame.length;
      },
      onSpeechEnd: (audio) => {
        if (isContinuous) return;
        void emitSpeech(audio);
      },
    });
    await captureVad.start();
  } catch (error) {
    await teardownCapture();
    throw error;
  }

  emitPhantomEvent("capture-started", VAD_SAMPLE_RATE);

  if (isContinuous) {
    const startedAt = Date.now();
    const maxSecs =
      vadConfig.max_recording_duration_secs || DEFAULT_MAX_RECORDING_SECS;
    emitPhantomEvent("continuous-recording-start", maxSecs);
    progressTimer = window.setInterval(() => {
      emitPhantomEvent(
        "recording-progress",
        Math.floor((Date.now() - startedAt) / 1000)
      );
    }, 1000);
    maxDurationTimer = window.setTimeout(() => {
      void manualStopContinuous();
    }, maxSecs * 1000);
  }
}

async function manualStopContinuous() {
  if (!isContinuous || !captureVad) {
    await stopSystemAudioCapture();
    return;
  }
  const audio = takeContinuousAudio();
  await teardownCapture();
  emitPhantomEvent("continuous-recording-stopped", {});
  await emitSpeech(audio);
}

async function stopSystemAudioCapture() {
  const wasContinuous = isContinuous;
  continuousFrames = [];
  continuousSampleCount = 0;
  await teardownCapture();
  if (wasContinuous) {
    emitPhantomEvent("continuous-recording-stopped", {});
  }
  emitPhantomEvent("capture-stopped", {});
}

async function listAudioDevices(kind: "audioinput" | "audiooutput") {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const fallbackName = kind === "audioinput" ? "Microphone" : "Speaker";
  return devices
    .filter((device) => device.kind === kind)
    .map((device, index) => ({
      id: device.deviceId,
      name: device.label || `${fallbackName} ${index + 1}`,
      is_default: device.deviceId === "default",
    }));
}

export async function invoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  if (command === "start_system_audio_capture") {
    await startSystemAudioCapture(args);
    return undefined as T;
  }
  if (command === "manual_stop_continuous") {
    await manualStopContinuous();
    return undefined as T;
  }
  if (command === "stop_system_audio_capture") {
    await stopSystemAudioCapture();
    return undefined as T;
  }
  if (command === "get_capture_status") {
    return Boolean(captureVad) as T;
  }
  if (command === "get_input_devices" || command === "get_output_devices") {
    return (await listAudioDevices(
      command === "get_input_devices" ? "audioinput" : "audiooutput"
    )) as T;
  }
  return window.phantom.invoke(command, args) as Promise<T>;
}
