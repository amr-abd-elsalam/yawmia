import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeAttachmentMetadata,
  validateAttachmentList,
  attachToMessage,
} from '../server/services/workroomAttachments.js';

test('Phase 53 workroom attachments: sanitize metadata strips HTML and caps fields', () => {
  const meta = sanitizeAttachmentMetadata({
    caption: '<b>صورة الموقع</b>',
    clientName: 'x'.repeat(300),
    purpose: '<script>x</script>',
  });

  assert.equal(meta.caption, 'صورة الموقع');
  assert.ok(meta.clientName.length <= 160);
  assert.equal(meta.purpose, 'x');
});

test('Phase 53 workroom attachments: validate empty attachments', () => {
  const result = validateAttachmentList(undefined);
  assert.equal(result.ok, true);
  assert.deepEqual(result.attachments, []);
});

test('Phase 53 workroom attachments: reject non-array attachments', () => {
  const result = validateAttachmentList({ imageRef: 'img_x' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_ATTACHMENTS');
});

test('Phase 53 workroom attachments: reject invalid attachment item', () => {
  const result = validateAttachmentList([{ type: 'file' }]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_ATTACHMENT');
});

test('Phase 53 workroom attachments: attachToMessage stores metadata only', async () => {
  const msg = { id: 'msg_x', text: 'hello' };
  await attachToMessage(msg, [
    {
      type: 'image',
      imageRef: 'img_abcdef12',
      caption: '<b>مرفق</b>',
      clientName: 'site.png',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);

  assert.equal(msg.attachments.length, 1);
  assert.equal(msg.attachments[0].imageRef, 'img_abcdef12');
  assert.equal(msg.attachments[0].caption, 'مرفق');
  assert.equal(msg.attachments[0].type, 'image');
  assert.equal('dataUri' in msg.attachments[0], false);
  assert.equal('base64' in msg.attachments[0], false);
});
