import { createRoot } from 'react-dom/client';
import { Modal, App, TFile } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import SemanticSearchResults from './semantic_search_results';

export default class SemanticSearchModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;

  constructor(app: App, plugin: ZettelkastenLLMToolsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const { contentEl } = this;
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      contentEl.setText('No active file');
      return;
    }
    contentEl.setText('Getting embedding...');
    const activeFileVector = await this.plugin.vectorStore.upsertVector(activeFile);

    contentEl.setText(`Searching... ${this.plugin.vectorStore.numVectors()} entries`);
    const topMatches = this.plugin.vectorStore.vectorSearch(activeFileVector);

    await Promise.all(topMatches.map(async (match) => {
      let existingFile = this.app.vault.getAbstractFileByPath(match.storedVector.path);
      if (!existingFile || !(existingFile instanceof TFile)) {
        // match['content'] = null;
        return;
      }

      match['content'] = await this.app.vault.cachedRead(existingFile);
    }));

    contentEl.setText('');
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
    root.render(
      <SemanticSearchResults results={topMatches}
                     activeFileLinktext={activeFileVector.linktext}
                     plugin={this.plugin}
                     noteLinkClickedCallback={this.close} />
    );
  }

  onClose() {
    const {contentEl} = this;
    contentEl.empty();
  }
}
