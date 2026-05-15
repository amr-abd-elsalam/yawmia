import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleSearchWorkroomMessages,
  handleGetWorkroomReadReceipts,
  handleMarkWorkroomMessageRead,
  handleListWorkroomPins,
  handlePinWorkroomMessage,
  handleUnpinWorkroomMessage,
  handleGetWorkroomChecklist,
  handleCreateWorkroomChecklistItem,
  handleUpdateWorkroomChecklistItem,
  handleDeleteWorkroomChecklistItem,
  handleUploadWorkroomAttachment,
  handleGetWorkroomSummary,
} from '../server/handlers/workroomHandler.js';

test('Phase 53 Workroom V2 handlers are exported', () => {
  const handlers = [
    handleSearchWorkroomMessages,
    handleGetWorkroomReadReceipts,
    handleMarkWorkroomMessageRead,
    handleListWorkroomPins,
    handlePinWorkroomMessage,
    handleUnpinWorkroomMessage,
    handleGetWorkroomChecklist,
    handleCreateWorkroomChecklistItem,
    handleUpdateWorkroomChecklistItem,
    handleDeleteWorkroomChecklistItem,
    handleUploadWorkroomAttachment,
    handleGetWorkroomSummary,
  ];

  for (const handler of handlers) {
    assert.equal(typeof handler, 'function');
  }
});
