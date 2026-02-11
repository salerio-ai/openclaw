---
name: minimax-tts
description: Convert text to speech audio using MiniMax T2A API. Use when user asks to generate voice, speech, audio from text, read aloud, pronounce something, create voiceover, or wants text-to-speech synthesis. Supports multiple voices and emotions.
homepage: https://platform.minimaxi.com/docs/api-reference/speech-t2a-http
user-invocable: true
disable-model-invocation: false
metadata: {"openclaw":{"emoji":"🔊","requires":{"bins":["python3"],"env":["MINIMAX_API_KEY"]},"primaryEnv":"MINIMAX_API_KEY"}}
---

# MiniMax Text-to-Speech

Generate high-quality speech audio from text using MiniMax T2A v2 API.

## When to Use This Skill

**ALWAYS use this skill when the user:**
- Asks to convert text to speech/audio/voice
- Wants to hear how something sounds
- Requests a voiceover or narration
- Asks to "read this aloud" or "pronounce this"
- Needs TTS/text-to-speech generation
- Asks to generate audio files from text
- Says "把这段文字转成语音" or similar in Chinese
- Mentions "语音合成" or "朗读"

## How to Execute

Run the Python script at `{baseDir}/scripts/tts.py`:

```bash
python3 {baseDir}/scripts/tts.py "<text>" [options]
```

### Required Arguments

| Argument | Description |
|----------|-------------|
| `text` | Text to convert to speech (quoted string) |

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--voice` | Voice ID | `male-qn-qingse` |
| `--emotion` | Emotion: happy, sad, angry, fearful, disgusted, surprised, calm, whisper | (none) |
| `--speed` | Speech speed (0.5-2.0) | `1.0` |
| `--output` | Output file path | `./tts_output.mp3` |
| `--model` | TTS model version | `speech-2.8-hd` |

### Available Voices

| Voice ID | Description |
|----------|-------------|
| `male-qn-qingse` | Male, young, clear |
| `female-shaonv` | Female, young |
| `female-yujie` | Female, mature |
| `male-qn-jingying` | Male, professional |
| `presenter_male` | Male announcer |
| `presenter_female` | Female announcer |

### Examples

**Basic usage:**
```bash
python3 {baseDir}/scripts/tts.py "Hello, welcome to our service."
```

**With emotion and voice:**
```bash
python3 {baseDir}/scripts/tts.py "I'm so happy to meet you!" --voice female-shaonv --emotion happy
```

**Save to specific file:**
```bash
python3 {baseDir}/scripts/tts.py "Breaking news..." --voice presenter_male --output news.mp3
```

**Chinese text:**
```bash
python3 {baseDir}/scripts/tts.py "你好，欢迎使用语音合成服务。"
```

## Configuration

This skill requires the `MINIMAX_API_KEY` environment variable to be set.

## Output

After successful generation, the script will output:
- Path to the generated MP3 file
- Audio duration (milliseconds)
- File size (bytes)
- Characters consumed

**Note:** Always inform the user where the audio file was saved so they can play it.
