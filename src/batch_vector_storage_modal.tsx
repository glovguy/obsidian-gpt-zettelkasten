import { createRoot } from 'react-dom/client';
import { Modal, App, Notice, TFile } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { useState, useEffect } from 'react';
import { NoteGroup, filesInGroupFolder } from './note_group';


export default class BatchVectorStorageModal extends Modal {
  plugin: ZettelkastenLLMToolsPlugin;
  noteGroups: Array<NoteGroup>;

  constructor(
    app: App,
    plugin: ZettelkastenLLMToolsPlugin,
    noteGroups: Array<NoteGroup>,
  ) {
    super(app);
    this.plugin = plugin;
    this.noteGroups = noteGroups;
  }

  async onOpen() {
    const {contentEl} = this;
    const root = createRoot(contentEl.appendChild(document.createElement('div')));
    root.render(<BatchSetup plugin={this.plugin} modal={this} noteGroups={this.noteGroups} />);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

const BatchSetup = ({
  plugin,
  modal,
  noteGroups,
}: {
  plugin: ZettelkastenLLMToolsPlugin,
  modal: BatchVectorStorageModal,
  noteGroups: Array<NoteGroup>,
}) => {
  const filteredFiles = filesInGroupFolder(plugin.app, noteGroups[0]);
  const [numFilesNeedingIndexing, setNumFilesNeedingIndexing] = useState<number | undefined>();
  const [selectedNoteGroupIndex, setSelectedNoteGroupIndex] = useState(0);

  const onSelectedGroupChange = async (newGroupIndex: number) => {
    setSelectedNoteGroupIndex(newGroupIndex);
  };

  useEffect(() => {
    const countFilesNeedingIndexing = async () => {
      const count = (await Promise.all(
        filteredFiles.map(async f => !(await plugin.vectorStore.hasFileBeenIndexed(f)))
      )).filter(Boolean).length;
      setNumFilesNeedingIndexing(count);
    };

    countFilesNeedingIndexing();
  }, [selectedNoteGroupIndex]); // Re-run when these dependencies change

  const enqueueEmbeddings = () => {
    plugin.indexVectorStores();
    new Notice(`Enqueued ${filteredFiles.length} files for embedding`);
    modal.close();
  };

  return (
    <div>
      <h1>Set up batch embedding</h1>
      <span>Note Group: {noteGroups[0].name}</span><p />
      <button onClick={enqueueEmbeddings}>Start batch embedding</button>
      <div>
        <h3>Preview</h3>
        <span>{filteredFiles.length} files match pattern</span><p></p>
        <span>{(numFilesNeedingIndexing === undefined) ? '' : `(${numFilesNeedingIndexing} notes will be indexed)`}</span>
        {filteredFiles.map((file) => (
          <div key={file.path} className="batch-embedding-matching-file-preview-container" >
            <a onClick={() => plugin.app.workspace.openLinkText('', file.path)}><code>{file.path}</code></a>
          </div>
        ))}
      </div>
    </div>
  );
};
