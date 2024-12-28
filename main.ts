import {
  App,
  MarkdownView,
  Modal,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  WorkspaceLeaf,
} from 'obsidian';
import {
  OpenAIClient,
  unlabelledEmbeddingModel,
  availableEmbeddingModels,
  AnthropicClient,
} from './src/llm_client';
import { generateAndStoreEmbeddings, FileFilter } from './src/semantic_search';
import { VectorStore, StoredVector } from './src/vector_storage';
import SemanticSearchModal from './src/semantic_search_modal';
import CopilotTab from './src/zettelkasten_ai_tab';
import BatchVectorStorageModal from './src/batch_vector_storage_modal';
import { VIEW_TYPE_AI_COPILOT, VIEW_TYPE_AI_SEARCH } from './src/constants';
import SemanticSearchTab from 'src/semantic_search_tab';
import { DEFAULT_NOTE_GROUPS, NoteGroup, filesInGroupFolder } from 'src/note_group';
import EmbeddingsOverwriteConfirmModal from 'src/embeddings_overwrite_confirm_modal';

const IDLE_STATUS = 'idle';
const INDEXING_STATUS = 'indexing';
interface ZettelkastenLLMToolsPluginSettings {
  openaiAPIKey: string;
  anthropicAPIKey: string;
  vectors: Array<StoredVector>;
  noteGroups: Array<NoteGroup>;
  embeddingsModelVersion?: string;
  embeddingsEnabled: boolean;
  indexedNoteGroup: number;
};

// TODO: when removing a note group, remove the vectors associated with it

const DEFAULT_SETTINGS: ZettelkastenLLMToolsPluginSettings = {
  openaiAPIKey: '',
  anthropicAPIKey: '',
  vectors: [],
  noteGroups: DEFAULT_NOTE_GROUPS.map(grp => ({ ...grp })), // deep copy
  embeddingsEnabled: false,
  indexedNoteGroup: 0,
};

export default class ZettelkastenLLMToolsPlugin extends Plugin {
  settings: ZettelkastenLLMToolsPluginSettings;
  vectorStore: VectorStore;
  fileFilter: FileFilter;
  copilotTab: CopilotTab;
  semanticSearchTab: SemanticSearchTab;
  llmClient: OpenAIClient;
  anthropicClient: AnthropicClient;
  indexingStatus: typeof IDLE_STATUS | typeof INDEXING_STATUS;
  lastIndexedCount: number;

  async onload() {
    this.fileFilter = new FileFilter();
    await this.loadSettings();
    this.vectorStore = new VectorStore(this);
    this.indexingStatus = IDLE_STATUS;
    this.lastIndexedCount = this.settings.vectors.length;
    // this.indexVectorStores();

    // Generate embeddings for current note command
    this.addCommand({
      id: 'generate-embeddings-current-note',
      name: 'Generate embeddings for current note',
      callback: async () => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          const activeFile = this.app.workspace.getActiveFile();
          if (!activeFile) { return; }

          try {
            this.indexingStatus = INDEXING_STATUS;
            await this.saveSettings();
            const concurrencyManager = await generateAndStoreEmbeddings({
              vectorStore: this.vectorStore,
              files: [activeFile],
              app: this.app,
              llmClient: this.llmClient,
              notify: (numCompleted: number) => {
                this.lastIndexedCount = numCompleted;
              }
            });
            await concurrencyManager.done();
          } finally {
            this.indexingStatus = IDLE_STATUS;
            await this.saveSettings();
          }
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

    this.registerView(VIEW_TYPE_AI_COPILOT, (leaf: WorkspaceLeaf) => {
      this.copilotTab = new CopilotTab(leaf, this);
      return this.copilotTab;
    });

    this.registerView(VIEW_TYPE_AI_SEARCH, (leaf: WorkspaceLeaf) => {
      this.semanticSearchTab = new SemanticSearchTab(leaf, this);
      return this.semanticSearchTab;
    });

    let batchModel: BatchVectorStorageModal | undefined;
    this.addCommand({
      id: 'open-batch-generate-embeddings-modal',
      name: 'Open batch generate embeddings modal',
      callback: () => {
        if (batchModel === undefined) {
          batchModel = new BatchVectorStorageModal(this.app, this, this.settings.noteGroups);
          batchModel.open();
        }
      }
    });

    this.addSettingTab(new ZettelkastenLLMToolsPluginSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.initLeaf();
      if (this.copilotTab) {
        this.copilotTab.render();
      }
      if (this.semanticSearchTab) {
        this.semanticSearchTab.render();
      }
    });
  }

  onunload(): void {
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_SEARCH).forEach((leaf) => leaf.detach());
    this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_COPILOT).forEach((leaf) => leaf.detach());
  }

  initLeaf(): void {
    // Check if both leaves already exist
    const hasSearchLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_SEARCH).length > 0;
    const hasCopilotLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_COPILOT).length > 0;

    if (hasSearchLeaf && hasCopilotLeaf) {
      return;
    }

    // Create search leaf if missing
    if (!hasSearchLeaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: VIEW_TYPE_AI_SEARCH,
        });
      }
    }

    // Create copilot leaf if missing
    if (!hasCopilotLeaf) {
      const rightLeaf = this.app.workspace.getRightLeaf(false);
      if (rightLeaf) {
        rightLeaf.setViewState({
          type: VIEW_TYPE_AI_COPILOT,
        });
      }
    }
  }

  async loadSettings() {
    const loadedSettings = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    if (!loadedSettings?.embeddingsModelVersion && this.settings.vectors.length !== 0) {
      // if the model version was not set in settings, but vectors exist
      this.settings.embeddingsModelVersion = unlabelledEmbeddingModel;
      this.settings.embeddingsEnabled = true;
    }

    if (this.settings.vectors.length !== 0) {
      this.lastIndexedCount = this.settings.vectors.length;
    }

    // this.indexVectorStores();

    this.llmClient = new OpenAIClient(this.settings.openaiAPIKey);
    this.anthropicClient = new AnthropicClient(this.settings.anthropicAPIKey);
  }

  clearVectorArray() {
    this.settings.vectors = [];
    this.vectorStore = new VectorStore(this);
    this.lastIndexedCount = 0;
  }

  async saveSettings() {
    console.log('saving...');
    await this.saveData(this.settings);
    this.llmClient = new OpenAIClient(this.settings.openaiAPIKey);
    this.anthropicClient = new AnthropicClient(this.settings.anthropicAPIKey);
    console.log('done');
  }

  linkTextForFile(file: TFile): { linktext: string, path: string } {
    return {
      linktext: this.app.metadataCache.fileToLinktext(file, file.path),
      path: file.path
    };
  }

  async indexVectorStores() {
    if (!this.settings.embeddingsEnabled || this.indexingStatus === INDEXING_STATUS) {
      return;
    }

    // for now only the first note group will have a vector store
    this.indexingStatus = INDEXING_STATUS;
    this.lastIndexedCount = 0;
    this.app.workspace.trigger('zettelkasten-llm-tools:index-updated');
    await this.saveSettings(); // Save immediately to update UI

    try {
      const noteGroup = this.settings.noteGroups[this.settings.indexedNoteGroup];
      const filesForNoteGroup = filesInGroupFolder(this.app, noteGroup);
      const concurrencyManager = await generateAndStoreEmbeddings({
        files: filesForNoteGroup,
        app: this.app,
        vectorStore: this.vectorStore,
        llmClient: this.llmClient,
        notify: (numCompleted: number) => {
          this.lastIndexedCount = numCompleted;
          this.app.workspace.trigger('zettelkasten-llm-tools:index-updated');
        }
      });
      await concurrencyManager.done();
    } catch (error) {
      console.error('Error during indexing:', error);
    } finally {
      this.indexingStatus = IDLE_STATUS;
      this.app.workspace.trigger('zettelkasten-llm-tools:index-updated');
      await this.saveSettings();
    }
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
        .then(text => { text.inputEl.type = 'password'; })
        .onChange(async (value: string) => {
          this.plugin.settings.openaiAPIKey = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Anthropic API Key')
      .setDesc('Paste your Anthropic API key here.')
      .addText(text => text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.anthropicAPIKey)
        .then(text => { text.inputEl.type = 'password'; })
        .onChange(async (value: string) => {
          this.plugin.settings.anthropicAPIKey = value;
          await this.plugin.saveSettings();
        }));

    const statusEl = containerEl.createEl('div', { cls: 'embedding-status' });

    new Setting(statusEl)
      .setName('Enable Embeddings')
      .setDesc('Toggle embeddings functionality on/off')
      .addToggle(toggle => {
        toggle
          .setValue(this.plugin.settings.embeddingsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.embeddingsEnabled = value;
            await this.plugin.saveSettings();
            // Refresh the settings display to update status
            this.display();
          });
      });

    new Setting(statusEl)
      .setName('Model version for embeddings')
      .setDesc('Select the model version you want to use for vector embeddings.')
      .addDropdown(dropdown => {
        const availableModels = availableEmbeddingModels(
          this.plugin.settings.openaiAPIKey,
          this.plugin.settings.anthropicAPIKey
        );

        availableModels.forEach(model => {
          if (model.available) {
            dropdown.addOption(model.name, model.displayName);
          }
        });

        dropdown.setValue(this.plugin.settings.embeddingsModelVersion || '');
        dropdown.onChange(async (value) => {
          const confirmModal = new EmbeddingsOverwriteConfirmModal(
            this.app,
            this.plugin,
            async (confirmWasClicked) => {
              if (!confirmWasClicked) {
                dropdown.setValue(this.plugin.settings.embeddingsModelVersion || '');
                return;
              }
              if (value !== '' && value !== this.plugin.settings.embeddingsModelVersion) {
                this.plugin.settings.embeddingsModelVersion = value;
                this.plugin.clearVectorArray();
                await this.plugin.saveSettings();
                await this.plugin.indexVectorStores();
              }
            }
          );
          confirmModal.open();
        });
      });

    new Setting(statusEl)
      .setName('Note group to index')
      .setDesc('Select which note group to index with embeddings. (Only one note group can be indexed.)')
      .addDropdown(dropdown => {
        this.plugin.settings.noteGroups.forEach((group, index) => {
          dropdown.addOption(index.toString(), group.name);
        });

        dropdown.setValue(this.plugin.settings.indexedNoteGroup.toString());
        dropdown.onChange(async (value) => {
          const confirmModal = new EmbeddingsOverwriteConfirmModal(
            this.app,
            this.plugin,
            async (confirmWasClicked) => {
              if (!confirmWasClicked) {
                dropdown.setValue(this.plugin.settings.indexedNoteGroup.toString());
                return;
              }
              const newIndex = parseInt(value);
              if (newIndex !== this.plugin.settings.indexedNoteGroup) {
                this.plugin.settings.indexedNoteGroup = newIndex;
                this.plugin.clearVectorArray();
                await this.plugin.saveSettings();
                await this.plugin.indexVectorStores();
              }
            }
          );
          confirmModal.open();
        });
      });

    if (this.plugin.settings.embeddingsEnabled) {
      const status = this.plugin.indexingStatus === INDEXING_STATUS
        ? '🔄 Indexing...'
        : '✓ Indexed';

      const statusIndicatorEl = statusEl.createEl('div', {
        text: `Status: ${status}`,
        cls: this.plugin.indexingStatus === INDEXING_STATUS ? 'status-indexing' : 'status-ready'
      });

      const indexedCountEl = statusEl.createEl('div', {
        text: `Indexed notes: ${this.plugin.lastIndexedCount}`,
        cls: 'indexed-count'
      });

      this.app.workspace.on('zettelkasten-llm-tools:index-updated', () => {
        indexedCountEl.setText(`Indexed notes: ${this.plugin.lastIndexedCount}`);
        const newStatus = this.plugin.indexingStatus === INDEXING_STATUS
          ? '🔄 Indexing...'
          : '✓ Indexed';
        statusIndicatorEl.setText(`Status: ${newStatus}`);
        statusIndicatorEl.classList.toggle('status-indexing', this.plugin.indexingStatus === INDEXING_STATUS);
        statusIndicatorEl.classList.toggle('status-ready', this.plugin.indexingStatus === IDLE_STATUS);
      });

      const buttonContainer = statusEl.createEl('div', { cls: 'button-container' });
      buttonContainer.style.marginTop = '0.5em';

      const indexButton = buttonContainer.createEl('button', {
        text: 'Index Notes',
        cls: 'mod-cta',
      });
      indexButton.onclick = async () => {
        await this.plugin.indexVectorStores();
        this.app.workspace.trigger('zettelkasten-llm-tools:index-updated');
      };
    } else {
      statusEl.createEl('div', {
        text: 'Embeddings are disabled',
        cls: 'status-disabled'
      });
    }

    // Add some basic styles
    statusEl.style.marginTop = '1em';
    statusEl.style.marginBottom = '1em';
    statusEl.style.padding = '1em';
    statusEl.style.backgroundColor = 'var(--background-secondary)';
    statusEl.style.borderRadius = '4px';

    this.plugin.settings.noteGroups.forEach((noteGroup, i) => {
      // Create container div for this note group
      const groupContainer = containerEl.createDiv('note-group-container');
      groupContainer.style.border = '1px solid var(--background-modifier-border)';
      groupContainer.style.padding = '10px';
      groupContainer.style.marginBottom = '20px';
      groupContainer.style.borderRadius = '5px';

      // Add heading for group number
      const groupHeading = groupContainer.createEl('h3');
      groupHeading.setText(`${i + 1}. ${noteGroup.name}`);
      groupHeading.style.marginTop = '0';
      groupHeading.style.marginBottom = '10px';

      // group name
      new Setting(groupContainer)
        .setName('Group Name')
        .setDesc('Name of the group of notes')
        .addText(text => text
          .setPlaceholder('Permanent Notes')
          .setValue(noteGroup.name)
          .onChange(async (value) => {
            this.plugin.settings.noteGroups[i].name = value;
            await this.plugin.saveSettings();
          }));

      // select folder
      new Setting(groupContainer)
        .setName('Note group folder')
        .setDesc('Select folder containing notes to index')
        .addDropdown(dropdown => {
          const NO_FOLDER_SELECTED = '(none selected)';

          // Get all folders in vault
          const allFolders = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .map(f => f.path);

          // Filter out folders that are already used by other note groups
          const usedFolders = new Set(
            this.plugin.settings.noteGroups
              .filter((g, idx) => idx !== i && g.notesFolder) // Exclude current group
              .map(g => g.notesFolder!)
          );

          const selectableFolders = allFolders.filter(folder => {
            // Keep folder if it's not used and none of its parent folders are used
            return !Array.from(usedFolders).some(usedFolder =>
              folder === usedFolder || folder.startsWith(usedFolder + '/')
            );
          });

          // Add "none selected" option
          selectableFolders.unshift(NO_FOLDER_SELECTED);
          selectableFolders.sort();

          // Populate dropdown with folder paths
          selectableFolders.forEach(folder => {
            dropdown.addOption(folder, folder);
          });

          dropdown.setValue(noteGroup.notesFolder ?? NO_FOLDER_SELECTED);
          dropdown.onChange(async (value) => {
            this.plugin.settings.noteGroups[i].notesFolder = value === NO_FOLDER_SELECTED ? null : value;
            await this.plugin.saveSettings();
          });
        });

      // prompt write
      new Setting(groupContainer)
        .setName('Copilot Prompt')
        .setDesc('System prompt used by this note group')
        .addTextArea(text => {
          text.inputEl.style.width = '100%';
          text.inputEl.style.height = '150px';

          let saveTimeout: NodeJS.Timeout;

          return text
            .setPlaceholder('')
            .setValue(noteGroup.copilotPrompt)
            .onChange(async (value) => {
              // Clear existing timeout
              if (saveTimeout) clearTimeout(saveTimeout);

              // Set new timeout to save after 2 seconds of no typing
              saveTimeout = setTimeout(async () => {
                this.plugin.settings.noteGroups[i].copilotPrompt = value;
                await this.plugin.saveSettings();
              }, 2000);
            });
        });

      if (i !== 0 && this.plugin.settings.noteGroups.length > 1) {
        new Setting(groupContainer)
          .setName('Delete Note Group')
          .setDesc('Remove this note group.')
          .addButton(button => {
            button.setButtonText('Delete')
              .setWarning()
              .onClick(async () => {
                const modal = new Modal(this.app);
                modal.contentEl.createEl("h3", { text: "Delete Note Group" });
                modal.contentEl.createEl("p", { text: "Are you sure you want to delete this note group? This will only remove the group's settings. Your notes and folders will not be affected." });

                const buttonContainer = modal.contentEl.createDiv();
                buttonContainer.style.display = "flex";
                buttonContainer.style.justifyContent = "flex-end";
                buttonContainer.style.gap = "10px";

                const confirmButton = buttonContainer.createEl("button", { text: "Delete", cls: "mod-warning" });
                confirmButton.addEventListener("click", async () => {
                  this.plugin.settings.noteGroups.splice(i, 1);
                  await this.plugin.saveSettings();
                  this.display();
                  modal.close();
                });

                const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
                cancelButton.addEventListener("click", () => modal.close());

                modal.open();
              });
          });
      }
    });

    new Setting(containerEl)
      .setName('Create New Note Group')
      .setDesc('Add a new note group to the settings.')
      .addButton(button => {
        button.setButtonText('Add Note Group')
          .setCta()
          .onClick(async () => {
            const newNoteGroup = {
              name: `New Note Group ${this.plugin.settings.noteGroups.length + 1}`,
              notesFolder: null,
              copilotPrompt: '',
            };
            this.plugin.settings.noteGroups.push(newNoteGroup);
            await this.plugin.saveSettings();
            this.display(); // Refresh the settings display to show the new group
          });
      });
  }
}
