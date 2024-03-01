import { ItemView, WorkspaceLeaf } from 'obsidian';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { TFile, getIcon } from 'obsidian';
import { Icon } from './icon';
import ZettelkastenLLMToolsPlugin from '../main';
import SemanticSearchResults from './semantic_search_results';
import { VIEW_TYPE_AI_SEARCH } from './constants';

export default class SemanticSearchTab extends ItemView {
  plugin: ZettelkastenLLMToolsPlugin;
  root: Root;

  constructor(leaf: WorkspaceLeaf, plugin: ZettelkastenLLMToolsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_AI_SEARCH;
  }

  getDisplayText(): string {
    return 'AI';
  }

  getIcon(): string {
    return 'star-list';
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

  private async performSearch() {
    let activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.root.render(this.awaitingEmbeddingPrompt(<span>No active file</span>))
      return;
    }

    this.root.render(<span>Getting embedding...</span>);
    let activeFileVector;
    try {
      activeFileVector = await this.plugin.vectorStore.upsertVector(activeFile);
    } catch (e) {
      console.error("Error getting embedding: ", e)
      this.root.render(
        this.awaitingEmbeddingPrompt(<span>There was an issue generating the vector for the active document</span>)
      );
      return;
    }

    this.root.render(<span>Searching... {this.plugin.vectorStore.numVectors()} entries</span>);
    const topMatches = this.plugin.vectorStore.vectorSearch(activeFileVector);

    await Promise.all(topMatches.map(async (match) => {
      let existingFile = this.app.vault.getAbstractFileByPath(match.storedVector.path);
      if (!existingFile || !(existingFile instanceof TFile)) {
        return;
      }
      match['content'] = this.plugin.fileFilter.filterOutMetaData(await this.app.vault.cachedRead(existingFile));
    }));

    this.root.render(
      this.awaitingEmbeddingPrompt(
      <SemanticSearchResults results={topMatches}
        activeFileLinktext={activeFileVector.linktext}
        plugin={this.plugin}
        noteLinkClickedCallback={undefined} />
      )
    );
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
}
