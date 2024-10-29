import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { TFile, getIcon } from 'obsidian';
import { Icon } from './icon';
import ZettelkastenLLMToolsPlugin from '../main';
import SemanticSearchResults from './semantic_search_results';
import { allTags, filterMetaData } from './semantic_search';
import { StoredVector, VectorSearchResult } from './vector_storage';
import { VIEW_TYPE_AI_SEARCH } from './constants';
import { App } from 'obsidian';
import { useState } from 'react';


export default class ZettelkastenAiTab extends ItemView {
  plugin: ZettelkastenLLMToolsPlugin;
  root: Root;
  selectedView: string;
  selectedViewLookup: { [key: string]: React.FC<{ plugin: ZettelkastenLLMToolsPlugin, app: App }> } = {
    "semanticSearch": SemanticSearchTabContent,
    "copilot": CopilotTabContent,
  };

  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenLLMToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.selectedView = "copilot";
  }

  getViewType(): string {
    return VIEW_TYPE_AI_SEARCH;
  }

  getDisplayText(): string {
    return 'AI';
  }

  getIcon(): string {
    return 'star';
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  handleFunctionChange(value: string) {
    this.selectedView = value;
    this.render();
  }

  renderSelectedView(): JSX.Element {
    const viewToRender = this.selectedViewLookup[this.selectedView];
    return React.createElement(viewToRender, { plugin: this.plugin, app: this.app });
  }

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    this.root = createRoot(contentEl.appendChild(document.createElement('div')));
    this.root.render(
      <div>
        <select value={this.selectedView} onChange={(e) => this.handleFunctionChange(e.target.value)}>
          <option value="semanticSearch">Semantic Search</option>
          <option value="copilot">Copilot</option>
        </select>
        <hr />
        {this.renderSelectedView()}
      </div>
    );
  }
}

const CopilotTabContent: React.FC<{ plugin: ZettelkastenLLMToolsPlugin, app: App }> = ({ plugin, app }) => {
  const [response, setResponse] = useState('Click refresh to show suggestion');
  const [isLoadingResponse, setIsLoadingResponse] = useState(false);

  const populateCopilotSuggest = async () => {
    let activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      setResponse('Error loading current file...');
      return;
    }
    setIsLoadingResponse(true);
    const activeFileText = await plugin.app.vault.cachedRead(activeFile);
    const activeFileTitle = activeFile.basename;

    try {
      const tagCounts = (app.metadataCache as any).getTags(); // getTags works but is not documented
      const tags = tagCounts ? Object.keys(tagCounts) : null;
      const tagsMessage = tags ? `\ntags used in vault: ${tags.join(" ")}` : "";

      const msg = await plugin.anthropicClient.createMessage(
        'The following is a Zettelkasten note written by the user. The note should have 1. a clear title, 2. a single, clear thought stated briefly, 3. links to relevant ideas.\nSuggest revisions for this note. Be very brief and concise. Imitate their writing style. If you show an example of the suggested edits, wrap them in a <note></note> tag. If you want to suggest splitting into multiple notes, use more than one <note></note> tag.',
        [
          { role: 'user', content: `<note>\n# ${activeFileTitle}\n${activeFileText}</note>${tagsMessage}` }
        ],
        'haiku'
      );
      setResponse(msg.content[0].type === 'text' ? msg.content[0].text : JSON.stringify(msg.content[0]));
      setIsLoadingResponse(false);
    } catch (error) {
      console.error('Error calling Anthropic API:', error);
      setResponse('An error occurred while processing your request.');
      setIsLoadingResponse(false);
    }
  };

  return (
    <div>
      <button onClick={() => populateCopilotSuggest()}>Refresh</button><p></p>
      {isLoadingResponse && <span>Loading...</span>}<p></p>
      {response.includes('<note>') ? (
        <ReactMarkdown>{response.match(/<note>([\s\S]*?)<\/note>/)?.[1] || ''}</ReactMarkdown>
      ) : (
        <ReactMarkdown>{response}</ReactMarkdown>
      )}
    </div>
  );
}

const SemanticSearchTabContent: React.FC<{ plugin: ZettelkastenLLMToolsPlugin, app: App }> = ({ plugin, app }) => {
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<VectorSearchResult[]>([]);
  const [activeFileVector, setActiveFileVector] = useState<StoredVector | null>(null);
  const [errorGeneratingEmbedding, setErrorGeneratingEmbedding] = useState<boolean>(false);

  const awaitingEmbeddingPrompt = (BodyComponent: JSX.Element): JSX.Element => {
    return (
      <div>
        <button onClick={performSearch}>
          <Icon svg={getIcon('search')!} /> Semantic Search for active file
        </button><br />
        {BodyComponent}
      </div>
    );
  }

  const performSearch = async () => {
    setSearchResults([]);
    let activeFile = app.workspace.getActiveFile();
    if (!activeFile) {
      setSearching(false);
      return;
    }

    setSearching(true);
    let fileVectorResult: StoredVector;
    try {
      fileVectorResult = await plugin.vectorStore.upsertVector(activeFile);
      setActiveFileVector(fileVectorResult);
    } catch (e) {
      console.error("Error getting embedding: ", e)
      setSearching(false);
      setErrorGeneratingEmbedding(true);
      return;
    }

    const topMatches = plugin.vectorStore.vectorSearch(fileVectorResult);

    await Promise.all(topMatches.map(async (match: VectorSearchResult) => {
      let existingFile = app.vault.getAbstractFileByPath(match.storedVector.path);
      if (!existingFile || !(existingFile instanceof TFile)) {
        return;
      }
      const fileText = await app.vault.cachedRead(existingFile);
      match['content'] = filterMetaData(plugin.settings.contentMarker, fileText);
      match['tags'] = allTags(fileText);
    }));

    setSearching(false);
    setSearchResults(topMatches);
  }

  if (searching && !activeFileVector) {
    return (<span>Getting embedding...</span>);
  }
  if (searching && activeFileVector) {
    return (<span>Searching... {plugin.vectorStore.numVectors()} entries</span>);
  }
  if (errorGeneratingEmbedding) {
    return (<span>There was an issue generating the vector for the active document</span>);
  }
  if (activeFileVector && searchResults.length > 0) {
    return (awaitingEmbeddingPrompt(
        <SemanticSearchResults results={searchResults}
          activeFileLinktext={activeFileVector.linktext}
          plugin={plugin}
          noteLinkClickedCallback={undefined} />
      )
    );
  }

  return awaitingEmbeddingPrompt(<span>Search for docs similar to active window</span>);
};
