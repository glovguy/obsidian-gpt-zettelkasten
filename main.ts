import {
  App,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import {
  OpenAIClient,
  defaultEmbeddingModel,
  unlabelledEmbeddingModel,
  availableEmbeddingsModels,
} from './src/llm_client';
import type { EmbeddingModelNames } from './src/llm_client';
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
  contentMarker: string;
  embeddingsModelVersion?: string;
}

const DEFAULT_SETTINGS: ZettelkastenLLMToolsPluginSettings = {
  openaiAPIKey: '',
  vectors: [],
  allowPattern: '.*',
  contentMarker: '',
  embeddingsModelVersion: defaultEmbeddingModel,
}

export default class ZettelkastenLLMToolsPlugin extends Plugin {
  settings: ZettelkastenLLMToolsPluginSettings;
  vectorStore: VectorStore;
  fileFilter: FileFilter;
  sideTab: SemanticSearchTab;
  llmClient: OpenAIClient;

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
            llmClient: this.llmClient,
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
    const updateAllowPattern = (newAllowPattern: string) => {
      this.settings.allowPattern = newAllowPattern;
      this.saveSettings();
    }
    let batchModel: BatchVectorStorageModal | undefined;
    this.addCommand({
      id: 'open-batch-generate-embeddings-modal',
      name: 'Open batch generate embeddings modal',
      callback: () => {
        if (batchModel === undefined) {
          batchModel = new BatchVectorStorageModal(this.app, this, this.settings.allowPattern, this.filesForIndex, updateAllowPattern);
          batchModel.open();
        }
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
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    if (!loadedSettings?.embeddingsModelVersion && this.settings.vectors.length !== 0) {
      // if the model version was not set in settings, but vectors exist
      this.settings.embeddingsModelVersion = unlabelledEmbeddingModel;
    }
    this.llmClient = new OpenAIClient(this.settings.openaiAPIKey);
  }

  clearVectorArray() {
    this.settings.vectors = [];
    this.vectorStore = new VectorStore(this);
  }

  async saveSettings() {
    console.log('saving...');
    await this.saveData(this.settings);
    this.llmClient = new OpenAIClient(this.settings.openaiAPIKey);
    console.log('done');
  }

  linkTextForFile(file: TFile): { linktext: string, path: string } {
    return {
      linktext: this.app.metadataCache.fileToLinktext(file, file.path),
      path: file.path
    };
  }

  async reindex() {
    return generateAndStoreEmbeddings({
      files: this.filteredFiles(),
      app: this.app,
      vectorStore: this.vectorStore,
      contentMarker: this.settings.contentMarker,
      llmClient: this.llmClient,
    });
  }

  filesForIndex = (allowPttrn: string) => {
    const allowGroups = allowPttrn.toLowerCase().split(',').filter((s) => s.length > 0).map((s) => s.split('*').filter((s) => s.length > 0));
    return this.app.vault.getFiles().filter((file) => {
      const path = file.path.toLowerCase();

      return allowGroups.some((allowGroup) => {
        return allowGroup.every((subString) => {
          return path.includes(subString);
        });
      });
    });
  }

  filteredFiles() {
    return this.filesForIndex(
      this.settings.allowPattern);
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

    new Setting(containerEl)
      .setName('Model version for embeddings')
      .setDesc('Select the model version you want to use for vector embeddings.')
      .addDropdown(dropdown => {
        Object.keys(availableEmbeddingsModels).forEach((modelName: EmbeddingModelNames) => {
          dropdown.addOption(availableEmbeddingsModels[modelName], availableEmbeddingsModels[modelName]);
        });
        dropdown.setValue(this.plugin.settings.embeddingsModelVersion || defaultEmbeddingModel);
        dropdown.onChange(async (value) => {
          const confirmModal = new EmbeddingsModelOverwriteConfirmModal(
            this.app,
            this.plugin,
            async (confirmWasClicked) => {
              if (!confirmWasClicked) {
                dropdown.setValue(this.plugin.settings.embeddingsModelVersion || defaultEmbeddingModel);
                return;
              }
              this.plugin.settings.embeddingsModelVersion = value;
              this.plugin.clearVectorArray();
              await this.plugin.saveSettings();
              await this.plugin.reindex();
              await this.plugin.saveSettings();
            }
          );
          confirmModal.open();
        })
      });

    new Setting(containerEl)
      .setName('Allow pattern')
      .setDesc('Which files to index')
      .addText(text => text
        .setPlaceholder('*')
        .setValue(this.plugin.settings.allowPattern)
        .onChange(async (value) => {
          this.plugin.settings.allowPattern = value;
          await this.plugin.saveSettings();
        }));
  }
}

class EmbeddingsModelOverwriteConfirmModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;
  confirmClicked: boolean;
  confirmCallback: (confirmClicked: boolean) => void;

  constructor(app: App, plugin: ZettelkastenLLMToolsPlugin, confirmCallback: (confirmClicked: boolean) => void) {
    super(app);
    this.plugin = plugin;
    this.confirmCallback = confirmCallback;
    this.confirmClicked = false;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.setText(`Changing the embedding model used means throwing out existing vectors and re-indexing using the new model. Please confirm that you would like to trigger this re-indexing.\nThis will delete ${this.plugin.settings.vectors.length} vectors.\n\n`);
    contentEl.appendChild(this.confirmButton());
    contentEl.appendChild(this.cancelButton());
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.confirmCallback(this.confirmClicked);
  }

  private confirmButton(): HTMLButtonElement {
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Confirm';
    confirmButton.addEventListener('click', () => {
      this.confirmClicked = true;
      this.close();
    });
    return confirmButton;
  }

  private cancelButton(): HTMLButtonElement {
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.addEventListener('click', () => {
      this.close();
    });
    return cancelButton;
  }
}
