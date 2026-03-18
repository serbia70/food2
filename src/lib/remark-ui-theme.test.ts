import test from 'node:test';
import assert from 'node:assert/strict';
import { getRemarkCategoryTheme, normalizeRemarkCategoryLabel } from './remark-ui-theme.ts';

test('normalize: should lowercase and normalize separators/spaces', () => {
  assert.equal(
    normalizeRemarkCategoryLabel('  辣度/Spiciness  '),
    '辣度 spiciness',
  );
});

test('theme: spiciness -> #ff7043 + soft rgba + icon', () => {
  assert.deepEqual(getRemarkCategoryTheme('辣度/Spiciness'), {
    accent: '#ff7043',
    soft: 'rgba(255, 112, 67, 0.08)',
    icon: '🌶️',
  });
});

test('theme: exclusions -> #d32f2f', () => {
  assert.equal(getRemarkCategoryTheme('忌口/不吃 (Exclusions)').accent, '#d32f2f');
});

test('theme: healthy -> #4caf50', () => {
  assert.equal(getRemarkCategoryTheme('健康与调味 (Healthy & Seasoning)').accent, '#4caf50');
});

test('theme: allergies -> #ffa726', () => {
  assert.equal(getRemarkCategoryTheme('过敏/特殊 (Allergies)').accent, '#ffa726');
});

test('theme: modifications -> #2196f3', () => {
  assert.equal(getRemarkCategoryTheme('食材调整 (Modifications)').accent, '#2196f3');
});

test('theme: default -> #607d8b', () => {
  assert.deepEqual(getRemarkCategoryTheme('其他/Others'), {
    accent: '#607d8b',
    soft: 'rgba(96, 125, 139, 0.08)',
    icon: '📝',
  });
});
