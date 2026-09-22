import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTask, listTasks } from '../src/store.js';

test('new tasks are not done', () => {
  assert.equal(createTask('Buy milk').done, false);
});

test('listTasks respects limit', () => {
  createTask('a');
  createTask('b');
  assert.equal(listTasks({ limit: 1 }).length, 1);
});
