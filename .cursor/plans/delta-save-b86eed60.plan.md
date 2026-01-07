<!-- b86eed60-f165-4bec-a157-839bda0ca4ca 2ad2b5cf-bd3c-47f5-9e9e-6fa358ef1451 -->
# Delta Save Optimization Plan

## Overview

Optimize the delta save implementation to reduce unnecessary operations, prevent version conflicts, and improve performance. Each phase is independently testable with detailed logging and user testing instructions.

---

## Phase 1: Skip Saves for Tiny Patches

**Goal**: Skip saves when patches are too small or inefficient to warrant a database write.

**Changes**:

- In `DocumentPanel.js` `performSave()`:
- Skip save if patch size < 10 bytes (whitespace/formatting only)
- Skip save if patch size > 80% of new content size (inefficient)
- Add logging: `[DELTA] Skipping save: reason`

**Files to Modify**:

- [`frontend/src/components/DocumentPanel/DocumentPanel.js`](frontend/src/components/DocumentPanel/DocumentPanel.js)

**Dependencies**: None

**Testing Instructions**:

1. Open browser DevTools Console
2. Create new document, type "hi"
3. Add a single space character
4. **Expected**: Console shows `[DELTA] Skipping save: patch too small (<10 bytes)`
5. **Expected**: No POST request to `/api/document` in Network tab
6. Type a large paragraph (500+ chars)
7. **Expected**: Save occurs normally
8. Make a tiny edit (1-2 chars) to large document
9. **Expected**: Save occurs (patch is small but content is large, so ratio is good)

**Backend Logs to Check**: Should see fewer `[DELTA SAVE]` entries for tiny edits

---

## Phase 2: Reduce Version Conflicts

**Goal**: Prevent 409 conflicts by queuing saves and skipping unchanged content.

**Changes**:

- In `DocumentPanel.js`:
- Add `saveInProgressRef` to track active saves
- Add `pendingSaveQueueRef` to queue saves during active save
- Increase debounce: 2s → 3s
- Skip save if `htmlContentToSave === lastSavedContentRef.current`
- Add logging: `[DELTA] Save queued`, `[DELTA] Save skipped: no changes`

**Files to Modify**:

- [`frontend/src/components/DocumentPanel/DocumentPanel.js`](frontend/src/components/DocumentPanel/DocumentPanel.js)

**Dependencies**: None (works with Phase 1)

**Testing Instructions**:

1. Open browser DevTools Console and Network tab
2. Create document, type rapidly (10+ characters quickly)
3. **Expected**: Console shows `[DELTA] Save queued` if save in progress
4. **Expected**: Only 1-2 POST requests (not one per keystroke)
5. **Expected**: No 409 errors in Network tab
6. Wait 3 seconds after stopping typing
7. **Expected**: Final save completes successfully
8. Make no changes, wait for autosave
9. **Expected**: Console shows `[DELTA] Skipping save: no changes`
10. **Expected**: No POST request sent

**Backend Logs to Check**: Should see no `Version mismatch` errors

---

## Phase 3: First-Page Snapshot Detection (Method A)

**Goal**: Only generate snapshots when edits occur on page 1 of multi-page documents.

**Changes**:

- In `DocumentPanel.js`:
- Add `isEditOnFirstPage()` function:
- Get TipTap editor instance
- Calculate `scrollHeight` of editor container
- Define page height: 1056px (11" at 96 DPI)
- Calculate total pages: `Math.ceil(scrollHeight / 1056)`
- Get cursor position: `editor.view.coordsAtPos(editor.state.selection.$anchor.pos)`
- Calculate cursor Y relative to editor container
- Determine page: `Math.floor((cursorY - editorTop) / 1056) + 1`
- Return `true` if page === 1 OR total pages <= 1
- In `performSave()`: Call `isEditOnFirstPage()` and pass `shouldGenerateSnapshot` flag
- In `api.js`: Add `shouldGenerateSnapshot` parameter to `saveDocument()`
- In `document.py`: Accept `should_generate_snapshot` parameter, only generate snapshot if `True`

**Files to Modify**:

- [`frontend/src/components/DocumentPanel/DocumentPanel.js`](frontend/src/components/DocumentPanel/DocumentPanel.js)
- [`frontend/src/services/api.js`](frontend/src/services/api.js)
- [`backend/routes/document.py`](backend/routes/document.py)

**Dependencies**: None (works with Phases 1-2)

**Testing Instructions**:

1. Open browser DevTools Console
2. Create new document, type content until it's clearly 2+ pages (scroll to see)
3. Make edit on page 1 (top of document)
4. **Expected**: Console shows `[DELTA] Edit on page 1, snapshot will be generated`
5. **Expected**: Backend logs show snapshot generation
6. Scroll to page 2, make edit
7. **Expected**: Console shows `[DELTA] Edit on page 2, skipping snapshot`
8. **Expected**: Backend logs show NO snapshot generation
9. Make edit on page 1 again
10. **Expected**: Snapshot generated again

**Backend Logs to Check**: Should see `[DELTA SAVE]` but no snapshot file writes for page 2+ edits

---

## Phase 4: Throttle Snapshot Generation

**Goal**: Further reduce snapshot frequency with debouncing and significant-change detection.

**Changes**:

- In `DocumentPanel.js`:
- Add `lastSnapshotTimeRef` to track last snapshot generation
- Add `snapshotDebounceTimerRef` for debounced snapshots
- In `performSave()`:
- Calculate chars changed: `Math.abs(newContent.length - lastSavedContentRef.current.length)`
- If `shouldGenerateSnapshot` is true:
- If chars changed < 100: queue snapshot (debounce 30s)
- If chars changed >= 100: generate immediately
- If 30s passed since last snapshot: generate immediately
- On document close/tab switch: force snapshot generation
- Add logging: `[DELTA] Snapshot queued (debounce)`, `[DELTA] Snapshot generated immediately`

**Files to Modify**:

- [`frontend/src/components/DocumentPanel/DocumentPanel.js`](frontend/src/components/DocumentPanel/DocumentPanel.js)

**Dependencies**: Phase 3 (needs `shouldGenerateSnapshot` flag)

**Testing Instructions**:

1. Open browser DevTools Console
2. Create document, make small edit (<100 chars) on page 1
3. **Expected**: Console shows `[DELTA] Snapshot queued (debounce)`
4. **Expected**: No snapshot file write in backend logs immediately
5. Wait 30 seconds
6. **Expected**: Backend logs show snapshot generation
7. Make large edit (>100 chars) on page 1
8. **Expected**: Console shows `[DELTA] Snapshot generated immediately`
9. **Expected**: Backend logs show immediate snapshot generation
10. Switch to different document tab
11. **Expected**: Snapshot generated for previous document (on tab switch)

**Backend Logs to Check**: Should see fewer snapshot file writes, clustered around significant changes

---

## Phase 5: Batch Operations (Async Snapshot + Indexing)

**Goal**: Move snapshot and indexing to background, don't block save response.

**Changes**:

- In `document.py`:
- Remove snapshot/indexing from main save flow
- Create background task queue (or use threading)
- After successful save, queue snapshot + indexing tasks
- Return save response immediately
- Add logging: `[DELTA] Snapshot/indexing queued`, `[DELTA] Background task completed`

**Files to Modify**:

- [`backend/routes/document.py`](backend/routes/document.py)
- Optionally: Create `backend/services/background_tasks.py` for task queue

**Dependencies**: Phase 4 (needs throttled snapshot logic)

**Testing Instructions**:

1. Open browser DevTools Network tab
2. Make edit that triggers snapshot
3. **Expected**: POST `/api/document` returns quickly (<100ms)
4. **Expected**: Snapshot file write appears in backend logs AFTER save response
5. **Expected**: No delay in frontend save status (should show "saved" immediately)
6. Make rapid edits (5+ in quick succession)
7. **Expected**: All saves complete quickly
8. **Expected**: Backend processes snapshots/indexing in background

**Backend Logs to Check**: Save response time should be faster, snapshot/indexing happens after response

---

## Phase 6: Optimize CORS

**Goal**: Cache CORS preflight responses to reduce OPTIONS requests.

**Changes**:

- In `app.py` or Flask CORS config:
- Set `max_age` for CORS preflight cache (e.g., 3600 seconds)
- Ensure proper CORS headers are set
- Add logging: `[CORS] Preflight cached for X seconds`

**Files to Modify**:

- [`backend/app.py`](backend/app.py) (Flask CORS configuration)

**Dependencies**: None

**Testing Instructions**:

1. Open browser DevTools Network tab
2. Make multiple document saves in quick succession
3. **Expected**: First request shows OPTIONS (preflight)
4. **Expected**: Subsequent requests within cache window show NO OPTIONS
5. **Expected**: Only POST requests (no OPTIONS) after first one
6. Wait > cache duration, make another request
7. **Expected**: OPTIONS appears again (cache expired)

**Backend Logs to Check**: Should see fewer OPTIONS requests in access logs

---

## Logging Strategy

**Phase Completion Checklist**:

1. ✅ Implementation complete
2. ✅ Debug logging added
3. ✅ User testing instructions provided
4. ⏳ User completes testing
5. ⏳ Remove debug logging from previous phase
6. ⏳ Move to next phase

**Logging Format**:

- Frontend: `[DELTA]`, `[SNAPSHOT]`, `[SAVE QUEUE]`
- Backend: `[DELTA SAVE]`, `[SNAPSHOT]`, `[BACKGROUND TASK]`

**Logging to Remove After Testing**:

- Verbose position calculations
- Detailed queue state dumps
- Step-by-step patch computation details
- Keep: Error logs, performance metrics, skip reasons

---

## Success Metrics

**Phase 1**: 50-70% reduction in tiny patch saves
**Phase 2**: 0 version conflicts, 30-50% reduction in total saves
**Phase 3**: 70-90% reduction in snapshots for multi-page documents
**Phase 4**: Additional 50% reduction in snapshot frequency
**Phase 5**: Save response time <100ms (down from ~500ms+)
**Phase 6**: 80-90% reduction in OPTIONS requests

---

## Implementation Order

1. **Phase 1** (Independent)
2. **Phase 2** (Independent, can run parallel with Phase 1)
3. **Phase 3** (Independent)
4. **Phase 4** (Depends on Phase 3)
5. **Phase 5** (Depends on Phase 4)
6. **Phase 6** (Independent, can run anytime)

**Recommended Sequence**: 1 → 2 → 3 → 4 → 5 → 6

### To-dos

- [ ] Phase 1: Skip saves for tiny patches (<10 bytes or >80% of content size)
- [ ] Phase 2: Reduce version conflicts with save queue and 3s debounce
- [ ] Phase 3: Implement first-page snapshot detection using cursor position (Method A)
- [ ] Phase 4: Throttle snapshot generation with debounce and significant-change detection
- [ ] Phase 5: Move snapshot/indexing to background tasks, non-blocking saves
- [ ] Phase 6: Optimize CORS with preflight caching