import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { TFile, getIcon } from 'obsidian';
import { Icon } from './icon';
import ZettelkastenLLMToolsPlugin from '../main';
import SemanticSearchResults from './semantic_search_results';
import { allTags, filterMetaData } from './semantic_search';
import { VIEW_TYPE_AI_SEARCH } from './constants';

export default class ZettelkastenAiTab extends ItemView {
  plugin: ZettelkastenLLMToolsPlugin;
  root: Root;
  semanticSearchTab: SemanticSearchTab;
  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenLLMToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.semanticSearchTab = new SemanticSearchTab(plugin, this);
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

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    this.root = createRoot(contentEl.appendChild(document.createElement('div')));
    this.root.render(
      this.awaitingEmbeddingPrompt(<span>Search for docs similar to active window</span>)
    );
  }
}

class SemanticSearchTab {
  plugin: ZettelkastenLLMToolsPlugin;
  zettelkastenAiTab: ZettelkastenAiTab;
  constructor(plugin: ZettelkastenLLMToolsPlugin, zettelkastenAiTab: ZettelkastenAiTab) {
    this.plugin = plugin;
    this.zettelkastenAiTab = zettelkastenAiTab;
  }

  private awaitingEmbeddingPrompt(BodyComponent: JSX.Element): JSX.Element {
    return (
      <div>
        <button onClick={() => this.performSearch()}>
          <Icon svg={getIcon('search')!} /> Semantic Search
        </button><br />
        {BodyComponent}
      </div>
    );
  }

  private async performSearch() {
    let activeFile = this.zettelkastenAiTab.app.workspace.getActiveFile();
    if (!activeFile) {
      this.zettelkastenAiTab.root.render(this.awaitingEmbeddingPrompt(<span>No active file</span>))
      return;
    }

    this.zettelkastenAiTab.root.render(<span>Getting embedding...</span>);
    let activeFileVector;
    try {
      activeFileVector = await this.plugin.vectorStore.upsertVector(activeFile);
    } catch (e) {
      console.error("Error getting embedding: ", e)
      this.zettelkastenAiTab.root.render(
        this.awaitingEmbeddingPrompt(<span>There was an issue generating the vector for the active document</span>)
      );
      return;
    }

    this.zettelkastenAiTab.root.render(<span>Searching... {this.plugin.vectorStore.numVectors()} entries</span>);
    const topMatches = this.plugin.vectorStore.vectorSearch(activeFileVector);

    await Promise.all(topMatches.map(async (match) => {
      let existingFile = this.zettelkastenAiTab.app.vault.getAbstractFileByPath(match.storedVector.path);
      if (!existingFile || !(existingFile instanceof TFile)) {
        return;
      }
      const fileText = await this.zettelkastenAiTab.app.vault.cachedRead(existingFile);
      match['content'] = filterMetaData(this.plugin.settings.contentMarker, fileText);
      match['tags'] = allTags(fileText);
    }));

    this.zettelkastenAiTab.root.render(
      this.awaitingEmbeddingPrompt(
      <SemanticSearchResults results={topMatches}
        activeFileLinktext={activeFileVector.linktext}
        plugin={this.plugin}
        noteLinkClickedCallback={undefined} />
      )
    );
  }
};