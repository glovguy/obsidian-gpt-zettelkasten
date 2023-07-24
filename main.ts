import { 
	App, 
	Editor, 
	MarkdownView, 
	Modal, 
	Notice, 
	Plugin, 
	PluginSettingTab, 
	Setting,
	TFile
} from 'obsidian';
import { initOpenAI, generateAndStoreEmbeddings } from './src/semantic_search';
import { VectorStore, LocalVectorDict, StoredVector } from './src/vector_storage';
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

		// // This creates an icon in the left ribbon.
		// const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
		// 	// Called when the user clicks the icon.
		// 	new Notice('This is a notice!');
		// });
		// // Perform additional things with the ribbon
		// ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// Generate embeddings current note command
		this.addCommand({
			id: 'generate-embeddings-current-note',
			name: 'Generate embeddings for current note only',
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
			name: 'Semantic Search',
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

		// This adds an editor command that can perform some operation on the current editor instance
		// this.addCommand({
		// 	id: 'sample-editor-command',
		// 	name: 'Sample editor command',
		// 	editorCallback: (editor: Editor, view: MarkdownView) => {
		// 		console.log(editor.getSelection());
		// 		editor.replaceSelection('Sample Editor Command');
		// 	}
		// });
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		// this.addCommand({
		// 	id: 'open-sample-modal-complex',
		// 	name: 'Open sample modal (complex)',
		// 	checkCallback: (checking: boolean) => {
		// 		// Conditions to check
		// 		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		// 		if (markdownView) {
		// 			// If checking is true, we're simply "checking" if the command can be run.
		// 			// If checking is false, then we want to actually perform the operation.
		// 			if (!checking) {
		// 				new SampleModal(this.app).open();
		// 			}

		// 			// This command will only show up in Command Palette when the check function returns true
		// 			return true;
		// 		}
		// 	}
		// });

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
