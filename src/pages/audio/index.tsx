import { AudioSelection } from "./components";
import { PageLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const getOsInstructions = () => {
  const platform = getPlatform();

  switch (platform) {
    case "macos":
      return {
        mic: "System Preferences > Sound > Input",
        audio: "System Preferences > Sound > Output",
      };
    case "windows":
      return {
        mic: "Settings > System > Sound > Input",
        audio: "Settings > System > Sound > Output",
      };
    case "linux":
      return {
        mic: "Sound Settings > Input Devices",
        audio: "Sound Settings > Output Devices",
      };
    default:
      return {
        mic: "your system sound settings",
        audio: "your system sound settings",
      };
  }
};

const Audio = () => {
  const osInstructions = getOsInstructions();

  return (
    <PageLayout
      title="Audio Matrix"
      description="Configure microphone input, speaker output, voice transcription, and system audio capture."
    >
      <AudioSelection />

      <div className="rounded-lg border border-[#f8c45c]/25 bg-[#f8c45c]/10 p-3 text-xs leading-relaxed text-[#ffe7a6]">
        <p>
          <strong>If selected devices do not work:</strong> verify your default
          system audio settings. Go to <strong>{osInstructions.mic}</strong>{" "}
          for microphone and <strong>{osInstructions.audio}</strong> for
          speakers or headphones.
        </p>
        <p className="mt-2 text-[#ffe7a6]/80">
          <strong>Note:</strong> if a selected device fails or is unavailable,
          PruvoAI falls back to your system default audio devices.
        </p>
      </div>
    </PageLayout>
  );
};

export default Audio;
