---
name: summerize
description: Summarize the current tab in both Chinese and English; if the tab is YouTube, retrieve transcript first via get-transcript.
---

# Summerize

## When to use this skill
Use this skill when the user asks to summarize the current page, or when a bilingual summary (Chinese + English) is needed.

## Detect YouTube and get transcript
1. Use view_tab to inspect the current or selected tab URL and title.
2. If the URL matches youtube.com/watch or youtu.be, call skill_call with name=get-transcript.
3. Use the transcript output as the primary input for summarization.

## Summarize current tab
- If the tab is not YouTube, summarize directly from view_tab content.
- Keep the summary concise and accurate.

## Output format
Use two sections with headings, Chinese first, then English:

## 中文摘要
- ...

## English Summary
- ...
