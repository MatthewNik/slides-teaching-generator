import { app } from "electron";
import { existsSync } from "fs";
import path from "path";

export type PiperInvocation = {
  command: string;
  args: string[];
  cwd: string;
};

export function projectRoot() {
  return path.join(__dirname, "..", "..");
}

export function bundledPiperDir() {
  const devDir = path.join(projectRoot(), "piper");
  if (existsSync(devDir)) {
    return devDir;
  }

  const packagedDir = path.join(process.resourcesPath, "piper");
  if (existsSync(packagedDir)) {
    return packagedDir;
  }

  return devDir;
}

export function bundledPiperPaths() {
  const piperDir = bundledPiperDir();
  return {
    piperDir,
    executable: path.join(piperDir, "piper.exe"),
    voiceModel: path.join(piperDir, "en_US-john-medium.onnx"),
  };
}

export function applyBundledPiperDefaults(settings: {
  piperExecutablePath: string;
  piperVoiceModelPath: string;
}) {
  const bundled = bundledPiperPaths();

  return {
    piperExecutablePath:
      settings.piperExecutablePath.trim() ||
      (existsSync(bundled.executable) ? bundled.executable : ""),
    piperVoiceModelPath:
      settings.piperVoiceModelPath.trim() ||
      (existsSync(bundled.voiceModel) ? bundled.voiceModel : ""),
  };
}

export function resolvePiperInvocation(
  executablePath: string,
  voiceModelPath: string,
  outputPath: string,
  voiceRate: number,
): PiperInvocation {
  if (!voiceModelPath) {
    throw new Error(
      "No Piper voice model found. Place en_US-john-medium.onnx in the piper folder or set a path in Settings.",
    );
  }

  if (!existsSync(voiceModelPath)) {
    throw new Error(`Piper voice model not found: ${voiceModelPath}`);
  }

  const lengthScale = Math.min(4, Math.max(0.5, 1 / voiceRate));
  const args = [
    "--model",
    voiceModelPath,
    "--output_file",
    outputPath,
    "--length_scale",
    lengthScale.toFixed(3),
  ];

  if (executablePath && existsSync(executablePath)) {
    return {
      command: executablePath,
      args,
      cwd: path.dirname(executablePath),
    };
  }

  const pythonCommand = process.platform === "win32" ? "python" : "python3";

  return {
    command: pythonCommand,
    args: ["-m", "piper", ...args],
    cwd: app.getPath("temp"),
  };
}
