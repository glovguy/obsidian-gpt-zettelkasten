import { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, App, TFile } from 'obsidian';
import MyPlugin from '../main';
import { generateAndStoreEmbeddings } from './semantic_search';


export default class BatchVectorStorageModal extends Modal {
	plugin: MyPlugin;
  allowPattern: string;
  disallowPattern: string;

	constructor(app: App, plugin: MyPlugin) {
		super(app);
		this.plugin = plugin;
	}

	async onOpen() {
		const {contentEl} = this;
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
		root.render(<BatchSetup plugin={this.plugin} />);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

const bannedChars = [
  '\\', '=', '`', '@', '"', "'", '{', '}', 
  '+', '?', '!', '|', '$', '.', '!', 
  ':', '<', '>', '&', '%', '#'
];
const BatchSetup = ({ plugin }: { plugin: MyPlugin}) => {
  const [allowPattern, setAllowPattern] = useState(plugin.settings.allowPattern || '');
  const [disallowPattern, setDisallowPattern] = useState(plugin.settings.disallowPattern || '');
  const filterFiles = (allowPttrn: string, disallowPttrn: string) => {
    console.log("running filterFiles")
    const allowGroups = allowPttrn.toLowerCase().split(',').filter((s) => s.length > 0).map((s) => s.split('*').filter((s) => s.length > 0));
    const disallowSubStrings = disallowPttrn.toLowerCase().split('*').filter((s) => s.length > 0);
    console.log(allowGroups, disallowSubStrings);
    return plugin.app.vault.getFiles().filter((file) => {
      const path = file.path.toLowerCase();

      return allowGroups.some((allowGroup) => {
        return allowGroup.every((subString) => {
          return path.includes(subString);
        });
      }) && !disallowSubStrings.some((subString) => {
        return path.includes(subString);
      });
    });
  };
  const [filteredFiles, setFilteredFiles] = useState(() => filterFiles(allowPattern, disallowPattern));

  const stringCharacterFilter = (string: string) => {
    const json_string = JSON.stringify(string);
    let filteredString = '';
    for (let i = 0; i < json_string.length; i++) {
      let char = json_string[i];
      if (!bannedChars.includes(char)) {
        filteredString += char;
      }
    }
    return filteredString;
  }

  const onAllowPatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filteredValue = stringCharacterFilter(e.target.value);
    setAllowPattern(stringCharacterFilter(filteredValue));
    plugin.settings.allowPattern = filteredValue;
    plugin.saveSettings();
    setFilteredFiles(filterFiles(filteredValue, disallowPattern));
  };

  const onDisallowPatternChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const filteredValue = stringCharacterFilter(e.target.value);
    setDisallowPattern(filteredValue);
    plugin.settings.disallowPattern = filteredValue;
    plugin.saveSettings();
    setFilteredFiles(filterFiles(allowPattern, filteredValue));
  };

  return (
    <div>
			<h1>Set up batch embedding</h1>
			<span>Allow pattern: <input value={allowPattern} onChange={onAllowPatternChange}></input></span><p />
      <span>Disallow pattern: <input value={disallowPattern} onChange={onDisallowPatternChange} ></input></span><p />
      <button onClick={() => generateAndStoreEmbeddings({ files: filteredFiles, app: plugin.app, vectorStore: plugin.vectorStore })}>Start batch embedding</button>
      <div>
        <h3>Preview</h3>
        <span>{filteredFiles.length} files match pattern</span>
        {filteredFiles.map((file) => (
          <div key={file.path} style={{ padding: "4px", margin: "4px" }}>
            <a onClick={() => plugin.app.workspace.openLinkText('', file.path)}><code>{file.path}</code></a>
          </div>
        ))}
      </div>
    </div>
  );
};
