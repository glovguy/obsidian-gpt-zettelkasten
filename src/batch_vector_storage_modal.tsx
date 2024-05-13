import { createRoot } from 'react-dom/client';
import { Modal, App, Notice, TFile } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { useState } from 'react';

export default class BatchVectorStorageModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;
  allowPattern: string;
  updateAllowPattern: (allowPattern: string) => void;
  filesForIndex: (allowPattern: string) => TFile[];

  constructor(
    app: App, 
    plugin: ZettelkastenLLMToolsPlugin, 
    allowPattern: string,
    filesForIndex: (allowPattern: string) => TFile[],
    updateAllowPattern: (allowPattern: string) => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.allowPattern = allowPattern;
    this.filesForIndex = filesForIndex;
    this.updateAllowPattern = updateAllowPattern;
  }

  async onOpen() {
    const {contentEl} = this;
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
    root.render(<BatchSetup plugin={this.plugin} modal={this} filesForIndex={this.filesForIndex} allowPattern={this.allowPattern} updateAllowPattern={this.updateAllowPattern} />);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

const bannedChars = [
  '\\', '=', '`', '@', '"', "'", '{', '}',
  '+', '?', '!', '|', '$', '.', '!',
  ':', '<', '>', '&', '%', '#'
];
const BatchSetup = ({
  plugin,
  modal,
  filesForIndex,
  allowPattern: _allowPattern,
  updateAllowPattern,
}: {
  plugin: ZettelkastenLLMToolsPlugin,
  modal: BatchVectorStorageModal,
  filesForIndex: (allowPattern: string) => TFile[],
  allowPattern: string,
  updateAllowPattern: (allowPattern: string) => void
}) => {
  const [allowPattern, setAllowPattern] = useState(_allowPattern);
  const filteredFiles = filesForIndex(allowPattern);

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
    setAllowPattern(filteredValue);
    updateAllowPattern(filteredValue);
  };

  const enqueueEmbeddings = () => {
    plugin.reindex();
    new Notice(`Enqueued ${filteredFiles.length} files for embedding`);
    modal.close();
  };

  return (
    <div>
      <h1>Set up batch embedding</h1>
      <span>Allow pattern: <input value={allowPattern} onChange={onAllowPatternChange}></input></span><p />
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
