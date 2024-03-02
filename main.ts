import {
  App,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import { initOpenAI } from './src/llm_client';
import { generateAndStoreEmbeddings, FileFilter } from './src/semantic_search';
import { VectorStore, StoredVector } from './src/vector_storage';
import SemanticSearchModal from './src/semantic_search_modal';
import SemanticSearchTab from './src/semantic_search_tab';
import BatchVectorStorageModal from './src/batch_vector_storage_modal';
import { VIEW_TYPE_AI_SEARCH } from './src/constants';

interface ZettelkastenLLMToolsPluginSettings {
  openaiAPIKey: string;
  vectors: Array<StoredVector>;
  allowPattern: string;
  disallowPattern: string;
  contentMarker: string;
}

const DEFAULT_SETTINGS: ZettelkastenLLMToolsPluginSettings = {
  openaiAPIKey: '',
  vectors: [],
  allowPattern: '.*',
  disallowPattern: '',
  contentMarker: '',
}

export default class ZettelkastenLLMToolsPlugin extends Plugin {
  settings: ZettelkastenLLMToolsPluginSettings;
  vectorStore: VectorStore;
  fileFilter: FileFilter;
  sideTab: SemanticSearchTab;

  async onload() {
    this.fileFilter = new FileFilter();
    await this.loadSettings();
    this.vectorStore = new VectorStore(this);

    // Generate embeddings for current note command
    this.addCommand({
      id: 'generate-embeddings-current-note',
      name: 'Generate embeddings for current note',
      callback: async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const editor = activeView.editor;
          const text = editor.getValue();

          const activeFile = this.app.workspace.getActiveFile();
          if (!activeFile) { return; }

          generateAndStoreEmbeddings({
            vectorStore: this.vectorStore,
            fileFilter: this.fileFilter,
            files: [activeFile],
            app: this.app,
          });
        }
      }
    });

    // Semantic search command
    this.addCommand({
      id: 'open-semantic-search-modal',
      name: 'Semantic Search for notes similar to current note',
      callback: () => {
        new SemanticSearchModal(this.app, this).open();
      }
    });

    this.registerView(VIEW_TYPE_AI_SEARCH, (leaf: WorkspaceLeaf) => {
      this.sideTab = new SemanticSearchTab(leaf, this);
      return this.sideTab;
    });

    // Populate vector store command
    this.addCommand({
      id: 'open-batch-generate-embeddings-modal',
      name: 'Open batch generate embeddings modal',
      callback: () => {
        new BatchVectorStorageModal(this.app, this).open();
      }
    });

    this.addSettingTab(new ZettelkastenLLMToolsPluginSettingTab(this.app, this));
    
    this.app.workspace.onLayoutReady(() => {
      this.initLeaf();
      this.sideTab.render();
    });
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_SEARCH).forEach((leaf) => leaf.detach());
  }

  initLeaf(): void {
    if (this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_SEARCH).length) {
      return;
    }
    const rightLeaf = this.app.workspace.getRightLeaf(false);
    if (!rightLeaf) {
      return;
    }
    rightLeaf.setViewState({
      type: VIEW_TYPE_AI_SEARCH,
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    initOpenAI(this.settings.openaiAPIKey);
    this.fileFilter.contentMarker = this.settings.contentMarker;
  }

  clearVectorSettings() {
    this.settings.vectors = [];
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  linkTextForFile(file: TFile): { linktext: string, path: string } {
    return {
      linktext: this.app.metadataCache.fileToLinktext(file, file.path),
      path: file.path
    };
  }
}

class ZettelkastenLLMToolsPluginSettingTab extends PluginSettingTab {
  plugin: ZettelkastenLLMToolsPlugin;

  constructor(app: App, plugin: ZettelkastenLLMToolsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide(): void {
    this.plugin.loadSettings();
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('OpenAI API Key')
      .setDesc('Paste your OpenAI API key here.')
      .addText(text => text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.openaiAPIKey)
        .onChange(async (value) => {
          this.plugin.settings.openaiAPIKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Content marker')
      .setDesc('Enter the markdown heading that marks the start of the content you want to use for semantic search. Leave blank to use the entire note.')
      .addText(text => text
        .setPlaceholder('# Body')
        .setValue(this.plugin.settings.contentMarker)
        .onChange(async (value) => {
          this.plugin.settings.contentMarker = value;
          await this.plugin.saveSettings();
        }));
  }
}
