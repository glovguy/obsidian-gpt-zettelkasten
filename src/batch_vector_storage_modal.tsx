import { createRoot } from 'react-dom/client';
import { Modal, App, Notice } from 'obsidian';
import ZettelkastenLLMToolsPlugin from '../main';
import { useState, useEffect } from 'react';
import { NoteGroup, filesInGroupFolder } from './note_group';
import EmbeddingsOverwriteConfirmModal from './embeddings_overwrite_confirm_modal';


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
  const [numFilesNeedingIndexing, setNumFilesNeedingIndexing] = useState<number | undefined>();
  const [selectedNoteGroupIndex, setSelectedNoteGroupIndex] = useState(plugin.settings.indexedNoteGroup);
  const filteredFiles = filesInGroupFolder(plugin.app, noteGroups[selectedNoteGroupIndex]);

  useEffect(() => {
    const countFilesNeedingIndexing = async () => {
      const count = (await Promise.all(
        filteredFiles.map(async f => !(await plugin.vectorStore.hasFileBeenIndexed(f)))
      )).filter(Boolean).length;
      setNumFilesNeedingIndexing(count);
    };

    countFilesNeedingIndexing();
  }, [selectedNoteGroupIndex]);

  const onStartBatchEmbeddingClicked = () => {
    if (selectedNoteGroupIndex !== plugin.settings.indexedNoteGroup) {
      const confirmModal = new EmbeddingsOverwriteConfirmModal(
        plugin.app,
        plugin,
        async (confirmWasClicked) => {
          if (!confirmWasClicked) {
            return;
          }
          plugin.settings.indexedNoteGroup = selectedNoteGroupIndex;
          plugin.clearVectorArray();
          await plugin.saveSettings();
          enqueueEmbeddings();
        }
      );
      confirmModal.open();
    } else {
      enqueueEmbeddings();
    }
  };

  const enqueueEmbeddings = () => {
    plugin.indexVectorStores();
    new Notice(`Enqueued ${filteredFiles.length} files for embedding`);
    modal.close();
  };

  return (
    <div>
      <h1>Set up batch embedding</h1>
      <select
        value={selectedNoteGroupIndex}
        onChange={async (e) => {
          const newIndex = Number(e.target.value);
          setSelectedNoteGroupIndex(newIndex);
        }}
      >
        {noteGroups.map((group, index) => (
          <option key={index} value={index}>{group.name}</option>
        ))}
      </select><p />
      <button onClick={onStartBatchEmbeddingClicked}>Start batch embedding</button>
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
