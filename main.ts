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
  defaultEmbeddingModel,
  unlabelledEmbeddingModel,
  availableEmbeddingsModels,
  AnthropicClient,
} from './src/llm_client';
import type { EmbeddingModelNames } from './src/llm_client';
import { generateAndStoreEmbeddings, FileFilter } from './src/semantic_search';
import { VectorStore, StoredVector } from './src/vector_storage';
import SemanticSearchModal from './src/semantic_search_modal';
import CopilotTab from './src/zettelkasten_ai_tab';
import BatchVectorStorageModal from './src/batch_vector_storage_modal';
import { VIEW_TYPE_AI_COPILOT, VIEW_TYPE_AI_SEARCH } from './src/constants';
import SemanticSearchTab from 'src/semantic_search_tab';
import { DEFAULT_NOTE_GROUPS, NoteGroup, filesInGroupFolder } from 'src/note_group';


interface ZettelkastenLLMToolsPluginSettings {
  openaiAPIKey: string;
  anthropicAPIKey: string;
  vectors: Array<StoredVector>;
  noteGroups: Array<NoteGroup>;
  contentMarker: string;
  embeddingsModelVersion?: string;
};

const DEFAULT_SETTINGS: ZettelkastenLLMToolsPluginSettings = {
  openaiAPIKey: '',
  anthropicAPIKey: '',
  vectors: [],
  noteGroups: DEFAULT_NOTE_GROUPS.map(grp => ({ ...grp })), // deep copy
  contentMarker: '',
  embeddingsModelVersion: defaultEmbeddingModel,
};

export default class ZettelkastenLLMToolsPlugin extends Plugin {
  settings: ZettelkastenLLMToolsPluginSettings;
  vectorStore: VectorStore;
  fileFilter: FileFilter;
  copilotTab: CopilotTab;
  semanticSearchTab: SemanticSearchTab;
  llmClient: OpenAIClient;
  anthropicClient: AnthropicClient;

  async onload() {
    this.fileFilter = new FileFilter();
    await this.loadSettings();
    this.vectorStore = new VectorStore(this);
    this.indexVectorStores();

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
            contentMarker: this.settings.contentMarker,
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
    }
    this.llmClient = new OpenAIClient(this.settings.openaiAPIKey);
    this.anthropicClient = new AnthropicClient(this.settings.anthropicAPIKey);
  }

  clearVectorArray() {
    this.settings.vectors = [];
    this.vectorStore = new VectorStore(this);
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
    // for now only the first note group will have a vector store
    return Promise.all([this.settings.noteGroups[0]].map(noteGroup => {
      const filesForNoteGroup = filesInGroupFolder(this.app, noteGroup);
      return generateAndStoreEmbeddings({
        files: filesForNoteGroup,
        app: this.app,
        vectorStore: this.vectorStore,
        contentMarker: this.settings.contentMarker,
        llmClient: this.llmClient,
      });
    }));
  }

  // filesForIndex = (allowPttrn: string) => {
  //   const allowGroups = allowPttrn.toLowerCase().split(',').filter((s) => s.length > 0).map((s) => s.split('*').filter((s) => s.length > 0));
  //   return this.app.vault.getFiles().filter((file) => {
  //     const path = file.path.toLowerCase();

  //     return allowGroups.some((allowGroup) => {
  //       return allowGroup.every((subString) => {
  //         return path.includes(subString);
  //       });
  //     });
  //   });
  // }

  // filteredFiles() {
  //   return filesInGroupFolder(this.app, this.settings.noteGroups[0]);
  // }
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
      .setName('Anthropic API Key')
      .setDesc('Paste your Anthropic API key here.')
      .addText(text => text
        .setPlaceholder('Enter your API key')
        .setValue(this.plugin.settings.anthropicAPIKey)
        .onChange(async (value) => {
          this.plugin.settings.anthropicAPIKey = value;
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
              await this.plugin.indexVectorStores();
              await this.plugin.saveSettings();
            }
          );
          confirmModal.open();
        })
      });

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
          const folders = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder)
            .map(f => f.path);
          // TODO: add filter for existing groups to ensure they aren't shown here

          // Add "none selected" option
          folders.unshift(NO_FOLDER_SELECTED);
          folders.sort();

          // Populate dropdown with folder paths
          folders.forEach(folder => {
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

      new Setting(groupContainer)
        .setName(`${(i == 0) ? '' : 'Not'} Indexed`)
        .setDesc('This note group ' + (i == 0 ? 'is' : 'is NOT') + ' indexed by the vector store. (Only the first note group is indexed.)');

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
