---
name: get-transcript
description: Retrieve transcripts from the currently attached tab (videos, audio, meetings) when summarization or recap is needed.
entry: scripts/get-transcript.js
allowed-tools: DOM(read,write) SW(fetch)
---

# Get Transcript

## When to use this skill
Use this skill when the user asks to summarize, recap, or transcribe audio/video content, or when a transcript is needed for accurate answers.

This skill does not auto-execute. Call `skill_run` when you need to run the script.

## How to detect transcript availability
1. Use view_tab to inspect the current or selected tab.
2. Confirm the tab is media-related (video/audio/meeting) by URL, title, or visible page sections.
3. Look for transcript panels, captions, or structured data indicating transcript availability.
4. If the tab is not media-related, do not activate this skill.

## How to retrieve transcript
1. If the transcript is already visible in the page content, use view_tab to capture it.
2. Otherwise, use fetch_page on the media URL and search for transcript or caption sections.
3. If no transcript is accessible, ask the user to paste the transcript or provide a source.

## How to return results
- Provide the transcript text (or best-effort partial transcript).
- Include source notes (where it was found and any limitations).

## Edge cases
- Auto-generated captions are missing or incomplete.
- Transcript is behind authentication or a paywall.
- Transcript language differs from the user language; summarize in the user's language.
