// import React from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, App, TFile } from 'obsidian';
import MyPlugin from '../main';
import { StoredVector, VectorSearchResult } from './vector_storage';
import { filterOutMetaData } from './semantic_search';

export default class SemanticSearchModal extends Modal {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const {contentEl} = this;
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
    
		console.log("in modal", this, contentEl);
		
		const activeFileInfo = this.plugin.activeFileLinkText();
		if (!activeFileInfo) {
			contentEl.setText('No active file');
			return;
		}
		const { linktext, path } = activeFileInfo;
		const topMatches = this.plugin.vectorStore.findTopMatches(linktext, 3);
		console.log("topMatches: ", topMatches);

		await Promise.all(topMatches.map(async (match) => {
			let existingFile = this.app.vault.getAbstractFileByPath(match.storedVector.path);
			if (!existingFile || !(existingFile instanceof TFile)) { 
				match['content'] = '';
				return;
			}

			match['content'] = filterOutMetaData(await this.app.vault.cachedRead(existingFile));
		}));

		root.render(<SearchResults results={topMatches} activeFileLinktext={linktext} plugin={this.plugin} />);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

const SearchResults = ({ results, plugin, activeFileLinktext }: { results: Array<VectorSearchResult>, plugin: MyPlugin, activeFileLinktext: string }) => {
  return (
    <div>
			<h1>Results</h1>
			<span>Notes similar to {"[[" + activeFileLinktext + "]]"}</span>
      {results.map((result) => (
        <div key={result.storedVector.sha} style={{ padding: "4px", paddingBottom: "8px", border: "light-grey", margin: "4px", borderStyle: "groove", borderRadius: "8px"}}>
          <a onClick={() => plugin.app.workspace.openLinkText(result.storedVector.linktext, '')}>{'[[' + result.storedVector.linktext + ']]'}</a>
					<p>{result.content}</p>
        </div>
      ))}
    </div>
  );
};
