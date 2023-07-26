import { 
	App, 
	MarkdownView, 
	Plugin, 
	PluginSettingTab, 
	Setting,
	TFile
} from 'obsidian';
import { initOpenAI, generateAndStoreEmbeddings } from './src/semantic_search';
import { VectorStore, StoredVector } from './src/vector_storage';
import SemanticSearchModal from './src/semantic_search_modal';
import BatchVectorStorageModal from './src/batch_vector_storage_modal';


interface MyPluginSettings {
	openaiAPIKey: string;
	vectors: Array<StoredVector>;
	allowPattern: string;
	disallowPattern: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	openaiAPIKey: '',
	vectors: [],
	allowPattern: '.*',
	disallowPattern: ''
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	vectorStore: VectorStore;

	async onload() {
		await this.loadSettings();
		this.vectorStore = new VectorStore(this);

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		// const statusBarItemEl = this.addStatusBarItem();
		// statusBarItemEl.setText('Status Bar Text');

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

		// Populate vector store command
		this.addCommand({
			id: 'open-batch-generate-embeddings-modal',
			name: 'Open batch generate embeddings modal',
			callback: () => {
				new BatchVectorStorageModal(this.app, this).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// this.clearVectorSettings();
		initOpenAI(this.settings.openaiAPIKey);
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

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.openaiAPIKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiAPIKey = value;
					await this.plugin.saveSettings();
				}));
	}
}
