import { useState, useRef, useEffect, JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, App, TFile, getIcon, Notice } from 'obsidian';
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
		const activeFile = app.workspace.getActiveFile();
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

			match['content'] = filterOutMetaData(await this.app.vault.cachedRead(existingFile));
		}));

		contentEl.setText('');
		const root = createRoot(contentEl.appendChild(document.createElement('div')));
		root.render(
			<SearchResults results={topMatches}
										 activeFileLinktext={activeFileVector.linktext}
										 plugin={this.plugin}
										 modal={this} />
		);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}


export const Icon = ({ svg }: { svg: SVGSVGElement | null }) => {
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (wrapperRef.current && svg) {
      wrapperRef.current.appendChild(svg)
    }
  }, [])

  return <span ref={wrapperRef}></span>
}

const CopyIcon = () => (<Icon svg={getIcon('copy')!} />);

const SearchResults = ({ results, plugin, activeFileLinktext, modal }: { results: Array<VectorSearchResult>, plugin: MyPlugin, activeFileLinktext: string, modal: SemanticSearchModal }) => {
	const [resultShowNum, setResultShowNum] = useState(5);
	const onClickNoteLink = (result: VectorSearchResult) => {
		plugin.app.workspace.openLinkText(result.storedVector.linktext, '')
		modal.close();
	}

  return (
    <div>
			<h1>Results</h1>
			<span>Notes similar to {"[[" + activeFileLinktext + "]]"}</span><p />
			<span style={{ fontSize: '12px' }}>Searched {plugin.vectorStore.numVectors()} entries</span><p /><p />
      {results.slice(0, resultShowNum).map((result) => {
				if (!result.content) { return; }
				return (
					<div key={result.storedVector.sha} style={{ padding: "4px", paddingBottom: "8px", border: "light-grey", margin: "4px", borderStyle: "groove", borderRadius: "8px"}}>
						<div>
							<a style={{ padding: "8px" }} onClick={() => onClickNoteLink(result)}>
								{'[[' + result.storedVector.linktext + ']]'}
							</a>
							<button style={{ cursor: 'pointer', width: '28px', height: '28px' }} onClick={() => navigator.clipboard.writeText(result.storedVector.linktext)}><CopyIcon></CopyIcon></button>
						</div>
						<p style={{ padding: "8px" }}>{result.content}</p>
					</div>
				)
			})}
			<div style={{ textAlign: "center" }}>
				<button style={{ cursor: 'pointer' }} onClick={() => setResultShowNum(resultShowNum + 5)}>Show More</button>
			</div>
    </div>
  );
};
