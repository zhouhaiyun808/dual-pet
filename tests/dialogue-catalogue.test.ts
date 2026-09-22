import test from 'node:test';
import assert from 'node:assert/strict';
import { dialogueCatalogue } from '../src/dialogue-catalog.ts';

test('catalogue retains internal provenance after the collection UI is simplified', () => {
  assert.ok(dialogueCatalogue.length > 0);
  for (const scene of dialogueCatalogue) {
    assert.ok(scene.sourceTitle.trim(), scene.id);
    assert.match(scene.sourceUrl, /^https:\/\//, scene.id);
    assert.ok(scene.originalContext.trim(), scene.id);
    assert.ok(scene.editorialNote.trim(), scene.id);
  }
});
