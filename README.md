<img src="NoteRobot.jpg" alt="Zettelkasten LLM Tools Logo" width="200" height="200" style="border-radius: 16px; border-style: solid; border-width: 4px; border-color: black;" />

# Zettelkasten LLM Tools

Zettelkasten note taking powered by Large Language Models.

## Features

- Semantic Search
  - Generate embeddings and index current note
  - Semantic Search for notes similar to current note
  - Batch generate embeddings and index notes based on a filename pattern

## Installation through Community Plugins Registry

- Navigate to Community Plugins tab in Obsidian
- Click "Browse" \
- Search for "Zettelkasten LLM Tools"
- Select to install plugin
- Navigate to Community Plugins tab in Obsidian
- Select "Options" icon next to "Zettelkasten LLM Tools"
- Fill in OpenAI API Key

## How to use

First, add your OpenAI API Key in the settings page. After installing and activating the plugin, open the settings panel in Obsidian and click on `Zettelkasten LLM Tools` tab. [Request an API key from OpenAI](https://help.openai.com/en/articles/4936850-where-do-i-find-my-secret-api-key) and paste it in the settings field.

### Rewriting notes with copilot

The copilot feature helps you improve your notes by suggesting revisions. To use it:

1. Open the right sidebar and click the "star" icon to open the AI tab
2. Select "Copilot" from the dropdown menu, if it is not already selected
3. Click "Refresh" to get suggestions for the currently open note

The copilot will analyze your note and suggest improvements focused on:
- Clear titles
- Single, focused ideas
- Relevant links and connections
- Appropriate tags

If the note would be better split into multiple notes, the copilot will suggest how to break it up.

### Batch generating indices for notes

To index many notes at once, open the [Obsidian command palette](https://help.obsidian.md/Plugins/Command+palette) and type "Open batch generate embeddings modal". This will open the batch indexing modal.

Create embedding vectors for only the notes you want by entering an "allow pattern". These patterns are not regex, but they do accept `*` as a wildcard. The "allow pattern" also admits multiple matching patterns, when separated by commas. In order to exclude a file that fits the "allow pattern".

The batch indexing modal will display a list of filepaths that match the patterns given. Once you've verified that this is the list you want to use, click to start the batch embedding, and the vector embeddings will be requested from OpenAI and stored to the local index.

If a note in the batch has already been added to the index, and the exact content text has not changed since the last embedding was created, it will not request a new embedding vector. If the content text has changed at all, a new embedding vector will be requested.

### Generating index for only current note

In order to index only one note, open the [Obsidian command palette](https://help.obsidian.md/Plugins/Command+palette), type "Generate embeddings for current note", and hit enter. The note will have a vector embedding created via OpenAI API, and that will be added to the local index.

If the current note has already been added to the index, and the content text has not changed since the last embedding was created, it will not request a new embedding vector. If the content text has changed at all, a new embedding vector will be requested.

### Searching for notes similar to current note using semantic search

To search for similar notes to the current open note using semantic search, you can do so either through  the [Obsidian command palette](https://help.obsidian.md/Plugins/Command+palette) or through the [right sidebar](https://help.obsidian.md/Getting+started/Use+the+mobile+app#Right+sidebar).

To use command palette, open it and type "Semantic Search for notes similar to current note" and click enter to select the command. The results will be displayed in a modal. In order to run a new search, close the modal and run the command again.

To use it through the right sidebar:
1. Open the sidebar and click the "star" icon to open the AI tab.
2. Select "Semantic Search" from the dropdown menu if it's not already selected.
3. Click the "Semantic Search for active file" button to run a search.

The results will be displayed in the right sidebar. To initiate a new search, navigate to another note and click the search button again.

Semantic search will look for notes similar to the one currently selected. The results are displayed in order of their similarity score (cosine similarity), along with their content text. (Note that this will only run a search over the notes that have been indexed locally with an embedding. If notes are missing here, run the batch create embeddings command above.)

To copy the linktext of a note in the results list, click the icon next to its linktext to copy the linktext to the clipboard.

## Manually installing the plugin

- Clone this repo.
- `npm i` to install dependencies
- `npm run dev` to start compilation in watch mode.
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/obsidian-gpt-zettelkasten/`.
