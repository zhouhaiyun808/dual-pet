import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionStatus, dialogueCatalogue } from '../src/dialogue-catalog.ts';

test('catalogue retains internal provenance after the collection UI is simplified', () => {
  assert.ok(dialogueCatalogue.length > 0);
  for (const scene of dialogueCatalogue) {
    assert.ok(scene.sourceTitle.trim(), scene.id);
    assert.match(scene.sourceUrl, /^https:\/\//, scene.id);
    assert.ok(scene.originalContext.trim(), scene.id);
    assert.ok(scene.editorialNote.trim(), scene.id);
  }
});

test('collection status distinguishes locked solo and paired lines', () => {
  assert.equal(collectionStatus({ trigger: 'solo-growth' }, false), '待陪伴');
  assert.equal(collectionStatus({ trigger: 'face-dialogue' }, false), '待相遇');
  assert.equal(collectionStatus({ trigger: 'shared-work' }, false), '待相遇');
  assert.equal(collectionStatus({ trigger: 'solo-growth' }, true), '已收集');
  assert.equal(collectionStatus({ trigger: 'face-dialogue' }, true), '已收集');
});
