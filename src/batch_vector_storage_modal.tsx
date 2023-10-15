import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, App, Notice } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { generateAndStoreEmbeddings } from './semantic_search';


export default class BatchVectorStorageModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;
  allowPattern: string;
  disallowPattern: string;

  constructor(app: App, plugin: ZettelkastenLLMToolsPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    const {contentEl} = this;
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
    root.render(<BatchSetup plugin={this.plugin} modal={this} />);
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
const BatchSetup = ({ plugin, modal }: { plugin: ZettelkastenLLMToolsPlugin, modal: BatchVectorStorageModal }) => {
  const [allowPattern, setAllowPattern] = useState(plugin.settings.allowPattern || '');
  const [disallowPattern, setDisallowPattern] = useState(plugin.settings.disallowPattern || '');
  const filterFiles = (allowPttrn: string, disallowPttrn: string) => {
    const allowGroups = allowPttrn.toLowerCase().split(',').filter((s) => s.length > 0).map((s) => s.split('*').filter((s) => s.length > 0));
    const disallowSubStrings = disallowPttrn.toLowerCase().split('*').filter((s) => s.length > 0);
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

  const enqueueEmbeddings = () => {
    generateAndStoreEmbeddings({ files: filteredFiles, app: plugin.app, vectorStore: plugin.vectorStore, fileFilter: plugin.fileFilter });
    new Notice(`Enqueued ${filteredFiles.length} files for embedding`);
    modal.close();
  };

  return (
    <div>
      <h1>Set up batch embedding</h1>
      <span>Allow pattern: <input value={allowPattern} onChange={onAllowPatternChange}></input></span><p />
      <span>Disallow pattern: <input value={disallowPattern} onChange={onDisallowPatternChange} ></input></span><p />
      <button onClick={enqueueEmbeddings}>Start batch embedding</button>
      <div>
        <h3>Preview</h3>
        <span>{filteredFiles.length} files match pattern</span>
        {filteredFiles.map((file) => (
          <div key={file.path} className="batch-embedding-matching-file-preview-container" >
            <a onClick={() => plugin.app.workspace.openLinkText('', file.path)}><code>{file.path}</code></a>
          </div>
        ))}
      </div>
    </div>
  );
};
