# Release Notes

## v0.2.0

- Added OpenAI-compatible API settings in the UI, with encrypted API key storage.
- Added Ollama routing for text and vision tasks.
- Added daily planning with appendable goals and screenshot evidence review.
- Added entertainment allowance rules, temporary session memory, optional AI commentary, voice speed settings, and tactical game suggestions.
- Added optional Cold Turkey password-lock integration, 24-hour entertainment restriction, and penalty lock recovery safeguards.
- Made Cold Turkey fully optional: core focus, planning, AI review, rewards, and entertainment allowance continue to work when Cold Turkey is not installed.
- Changed distraction penalties to warn first, then deduct only on a second distracted verdict before the warning clears.
- Added a temporary “凛冬督学局” link.
- Updated UI title and copy to “ОГАС政委”.

### Privacy

- API keys are stored through Electron safe storage and are not written to normal settings files.
- Screenshots are not persisted by the app.
- Local user data lives under `%APPDATA%\ai-commissar` and is not part of the source release.
