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
import React from 'react';

export default class ZettelkastenAiTab extends ItemView {
  plugin: ZettelkastenLLMToolsPlugin;
  root: Root;
  SelectedView: (plugin: ZettelkastenLLMToolsPlugin, app: App) => JSX.Element;
  selectedViewLookup: { [key: string]: (plugin: ZettelkastenLLMToolsPlugin, app: App) => JSX.Element } = {
    "semanticSearch": SemanticSearchTab,
    "chatbot": () => <span>Chatbot</span>,
    "summarize": () => <span>Summarize</span>,
  };

  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenLLMToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.SelectedView = this.selectedViewLookup["semanticSearch"];
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
    this.SelectedView = this.selectedViewLookup[value];
  }

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    this.root = createRoot(contentEl.appendChild(document.createElement('div')));
    this.root.render(
      <div>
        <select onChange={(e) => this.handleFunctionChange(e.target.value)}>
          <option value="semanticSearch">Semantic Search</option>
          <option value="chatbot">Chatbot</option>
          <option value="summarize">Summarize</option>
        </select>
        <hr />
        {this.SelectedView(this.plugin, this.app)}
      </div>
    );
  }
}

const SemanticSearchTab = function (plugin: ZettelkastenLLMToolsPlugin, app: App): JSX.Element {
  return React.createElement(SemanticSearchTabContent, { plugin, app });
};

const SemanticSearchTabContent: React.FC<{ plugin: ZettelkastenLLMToolsPlugin, app: App }> = ({ plugin, app }) => {
  const [searching, setSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [activeFileVector, setActiveFileVector] = useState<any>(null);
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
    console.log("performSearch");
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
