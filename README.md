# Slide Tutor Desktop

Desktop app for turning local PDF slide decks into teachable lessons. PDFs, transcripts, settings, and generated Piper audio are stored on your computer. Gemini is still used for transcript generation.

## Development

Install dependencies, then run the desktop app:

```bash
npm run desktop:dev
```

This starts the Next renderer and opens it in Electron. The app will warn if you open the renderer in a normal browser because local filesystem access is provided through Electron.

## Desktop Build

Build an unpacked Windows desktop app:

```bash
npm run desktop:pack
```

After this finishes, run:

```text
release\win-unpacked\Slide Tutor.exe
```

Build an installer:

```bash
npm run desktop:dist
```

The installer output is written to the `release` folder. Use `desktop:pack` while testing because it is faster and gives you a runnable app folder. Use `desktop:dist` when you want a proper installable Windows app.

## Settings

Configure these inside the app Settings screen:

- Gemini API key
- Piper executable path
- Piper `.onnx` voice model path

For development only, `GEMINI_API_KEY` can be set in `.env.local` or the shell. `SLIDE_TUTOR_DATA_DIR` can override the local data directory.

## Piper TTS Setup

This repo includes a bundled Piper voice in the `piper/` folder:

```text
piper/en_US-john-medium.onnx
piper/en_US-john-medium.onnx.json
```

The app auto-detects that model on startup. You do **not** need to configure paths manually unless you want a different voice.

### Option A: Python Piper (recommended for development)

Install the Piper Python package once:

```powershell
pip install piper-tts
```

Test the bundled voice from any folder except `piper/` itself:

```powershell
cd $env:TEMP
"Hello world" | python -m piper --model "C:\path\to\project\piper\en_US-john-medium.onnx" --output_file test.wav
```

If that works, open Slide Tutor, go to Viewer, and press **Generate slide** or **Generate all slides**.

### Option B: Standalone `piper.exe`

If you prefer the native Windows binary, download `piper_windows_amd64.zip` from [rhasspy/piper releases](https://github.com/rhasspy/piper/releases) (or the [SourceForge mirror](https://sourceforge.net/projects/piper-tts.mirror/files/)) and place these files in the project `piper/` folder:

```text
piper.exe
onnxruntime.dll
espeak-ng.dll
```

The app prefers `piper.exe` when present and falls back to Python otherwise.

### Additional voices (optional)

More voices are available on [Hugging Face: rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main). Each voice needs **both** files in the same folder:

```text
en_US-lessac-medium.onnx
en_US-lessac-medium.onnx.json
```

Point Settings at the `.onnx` file if you want to override the bundled `en_US-john-medium` voice.

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `No module named piper` | Run `pip install piper-tts` |
| Piper runs but WAV is silent/empty | Keep `.onnx` and `.onnx.json` together; remove conflicting `espeak` installs from PATH ([details](https://github.com/rhasspy/piper/issues/224)) |
| Windows Defender blocks `piper.exe` | Choose **Run anyway** or add an exclusion for the `piper/` folder |
| `python -m piper` fails inside `piper/` | Run Piper from another directory (e.g. `$env:TEMP`) so the bundled source tree does not shadow the pip package |
| Generation fails in the app | Confirm the test command above works, then use **Generate slide** in Viewer |

### Settings

Open Settings only if you want to override the defaults:

- **Piper executable** — optional `piper.exe` path
- **Piper voice model** — optional `.onnx` path

### Viewer audio behavior

- Slides auto-play narration when you move between them
- Use **Play slide** / **Stop** to override auto-play
- **Generate all slides** creates Piper WAV files for the whole deck

The app still falls back to Windows/browser speech synthesis when Piper audio has not been generated yet.

Piper usage reference: [Piper usage docs](https://tderflinger.github.io/piper-docs/guides/usage/).

## External LLM import

Use ChatGPT or another premium model when you want higher-quality transcripts:

1. Open a deck in the **Editor**.
2. Expand **Import from external LLM** and click **Copy prompt**.
3. Paste the prompt into ChatGPT and attach the same PDF.
4. Copy the full ChatGPT response back into the app (one paste).
5. Click **Import slides** to replace the deck transcripts.

Each slide in the ChatGPT response must use this structure:

```text
========== SLIDE 1 ==========
TITLE: Slide title

---MARKDOWN---
Markdown with LaTeX here.

---SPEECH---
Plain spoken narration here.

,,,,,,,,,,
```

Use exactly ten commas on their own line between slides.

## Flow

1. Import a PDF from your computer.
2. Generate slide transcripts with Gemini, or import them from an external LLM.
3. Review Markdown/LaTeX and speech-friendly narration.
4. Publish the deck locally.
5. View the lesson, generate Piper audio per slide, or use browser speech synthesis as fallback.
